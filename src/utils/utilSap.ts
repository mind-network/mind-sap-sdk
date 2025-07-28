import { FallbackProvider, JsonRpcProvider, JsonRpcSigner, StaticJsonRpcProvider } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
import { Point, utils as nobleUtils } from "@noble/secp256k1";
import { isHexString, splitSignature } from "@ethersproject/bytes";
import { getKeys } from "../contracts/SAPRegistry";
import KeypairECC, { RandomNumber } from "../keypair/KeypairECC";
import { createIntervalArray, getStartBlock, isOddNumber, isPublicKeyExist, parseChainConfig } from ".";
import {
  ChainConfig,
  RelayerParamSAtoEOA,
  RelayerParamSAtoHandler,
  RelayerParamSAtoSA,
  ResultType,
  ScanPayload,
  ScanResonse,
  SendPayload,
  SignMessagePayload,
} from "../types";
import { ACTION_SET, ChainlinkFeed, ETH_ADDRESS } from "./constants";
import { Contract } from "@ethersproject/contracts";
import { isAddress } from "@ethersproject/address";
import SAERC20Client from "../contracts/SAERC20Clients";
import { BigNumber } from "@ethersproject/bignumber";
import { NO_REGISTER } from "./exception";
import KeypairPhe from "../keypair/KeypairPhe";
import { CCIPBridgeConfig, CHAIN_OTHER_CONFIG, getRpcUrl } from "../contracts/config";
import SAPBridge from "../contracts/SAPBridge";
import Result from "./result";
import axios, { formToJSON } from "axios";
import { formatUnits, parseUnits } from "@ethersproject/units";
import { sha512 } from "@ethersproject/sha2";
import { defaultAbiCoder } from "@ethersproject/abi";
import { getAddress } from "@ethersproject/address";
import { arrayify } from "@ethersproject/bytes";
import { queryIndexByHash, queryLatestIndexByAddress, queryTotalTransactionIndex, queryTransactionFromChain } from "./transaction";
import { GAS_INFURA_ID, RELAYER_BASE_URL, RELAYER_WALLET_ADDRESS } from "../config";
import forge from "node-forge";

export function assertValidPrivateKey(key: string) {
  const isCorrectLength = key.length === 64 || key.length === 66;
  const isCorrectFormat = typeof key === "string" && isCorrectLength;
  if (!isCorrectFormat) throw new Error("Must provide private key as hex string");

  if (key.length === 66) key = key.slice(2);
  if (!nobleUtils.isValidPrivateKey(key)) throw new Error("Invalid private key");
}

export function assertValidPoint(point: string) {
  const isCorrectLength = point.length === 66 || point.length === 68;
  const isCorrectFormat = typeof point === "string" && isCorrectLength;
  if (!isCorrectFormat) throw new Error("Must provide uncompressed public key as hex string");

  const pointInstance = Point.fromHex(point.length === 66 ? point : point.slice(2));
  pointInstance.assertValidity();
}

export async function assertSABelongToSigner(signer: JsonRpcSigner | Wallet, SA: string | undefined) {
  if (!SA) {
    return;
  }
  if (!isHexString(SA) || SA.length !== 42) {
    throw new Error("Invalid SA address, must be a hex string");
  }

  //TODO: check
}

export async function isValidSA(receipt: string, tokenAddress: string, payload: Contract | number | ChainConfig) {
  if (!isAddress(receipt)) {
    throw new Error("Invalid address");
  }
  let contract: Contract;
  if (payload instanceof Contract) {
    contract = payload;
  } else if (typeof payload === "number") {
    const chain = parseChainConfig(payload);
    const rpc = getRpcUrl(payload);
    const provider = new StaticJsonRpcProvider(rpc);
    contract = SAERC20Client.connect(chain.ERC20ClientAddress, provider);
  } else if (payload.chainId && payload.ERC20ClientAddress) {
    const rpc = getRpcUrl(payload.chainId);
    const provider = new StaticJsonRpcProvider(rpc);
    contract = SAERC20Client.connect(payload.ERC20ClientAddress, provider);
  } else {
    throw new Error("Invalid payload");
  }
  const isSA = (await contract.existSA(receipt, [tokenAddress])) as boolean;
  return isSA;
}

export async function createSA(receipt: string) {
  const keys = await getKeys(receipt);
  if (!isPublicKeyExist(keys.opPubKey)) {
    throw new NO_REGISTER();
  }
  const opKeypair = new KeypairECC({ publickey: keys.opPubKey });
  const encKeypair = new KeypairPhe({ publickey: keys.encPubKey });
  const c2 = BigInt(keys.cipherText);
  //generate a random sk seed
  const sk = new RandomNumber().asBuffer;
  //The highest bit of the byte is set to 0
  sk[0] &= 0x7f;
  const randomKeypair = new KeypairECC({ privateKey: `0x${sk.toString("hex")}` });
  if (!randomKeypair.publicKeyHex || !randomKeypair.privateKeyHex) {
    throw new Error("stealthKeyPair generation failed");
  }
  const c1 = encKeypair.encrypt(randomKeypair.privateKeyHex) as bigint;
  const stealthKeyPair = opKeypair.addPublicKey(randomKeypair.publicKeyHex);
  const skCipherHexSlime = encKeypair.publicKey?.addition(c1, c2).toString(16) as string;

  const skCipher = `0x${isOddNumber(skCipherHexSlime.length) ? "0" + skCipherHexSlime : skCipherHexSlime}`;
  return {
    stealthKeyPair,
    skCipher,
  };
}

export async function verifySA(signer: JsonRpcSigner, sa: string | undefined, cipherText: string | undefined) {
  if (!sa || !cipherText) throw new Error("Invalid from and ciphertext");
  const { encKeypair } = await generatePrivateKeys(signer);
  const stealthKeyPair = isSAForUser(encKeypair, {
    sa,
    ciphertext: cipherText,
  });
  if (!stealthKeyPair || !BigNumber.from(sa).eq(stealthKeyPair.address)) throw new Error("SA not from current signer");
  const wallet = new Wallet(stealthKeyPair.privateKeyHex as string);
  return [stealthKeyPair, wallet] as [KeypairECC, Wallet];
}

export async function signMessage(payload: SignMessagePayload, wallet: Wallet) {
  const message = defaultAbiCoder.encode(
    ["uint256", "address", "address", "uint256", "address", "uint224", "bytes", "uint32", "address", "uint224", "uint256"],
    [
      payload.chainId,
      getAddress(payload.contractAddress),
      getAddress(payload.receive),
      payload.actionId,
      getAddress(payload.tokenAddress),
      payload.amount,
      payload.paramData || "0x",
      payload.nonce,
      getAddress(RELAYER_WALLET_ADDRESS), //relayerWalletAddress
      payload.relayerGas,
      payload.expireTime,
    ]
  );
  const msgBytes = arrayify(message);
  const sigStr = await wallet.signMessage(msgBytes);
  return sigStr;
}

export async function generatePrivateKeys(signer: JsonRpcSigner) {
  const baseMessage = "Sign this message to access your Mind account.\nPlease ensure that you are on the correct Mind Network website.";
  const signature = await signer.signMessage(baseMessage);
  if (!(isHexString(signature) || signature.length !== 132)) {
    throw new Error("Invalid signature");
  }
  const sigHash = Buffer.from(sha512(signature).slice(2), "hex");
  const opSK = sigHash.slice(0, 32);
  const encSK = sigHash.slice(32);
  opSK[0] &= 0x7f;
  const opKeypair = new KeypairECC({ privateKey: `0x${opSK.toString("hex")}` });
  const encKeypair = new KeypairPhe({ privateKey: `0x${encSK.toString("hex")}` });
  return { opKeypair, encKeypair };
}

export function isSAForUser(encKeypair: KeypairPhe, payload: { sa: string; ciphertext: string }): KeypairECC | undefined {
  try {
    const sk = encKeypair.privateKey?.decrypt(BigInt(payload.ciphertext)) as bigint;
    const skHex = sk.toString(16);
    const key = isOddNumber(skHex.length) ? "0" + skHex : skHex;
    const _stealthKeyPair = new KeypairECC({ privateKey: "0x" + key });
    return _stealthKeyPair;
  } catch (error) {
    return;
  }
}

export function getActionId(payload: SendPayload): bigint {
  const {
    from,
    cipherText,
    receive: { createSA },
  } = payload;
  if (!from || !cipherText) return BigInt(ACTION_SET.ACTION_EOAtoSA);
  if (!createSA) return BigInt(ACTION_SET.ACTION_SAtoEOA);
  return BigInt(ACTION_SET.ACTION_SAtoSA);
}

export async function getRateCapFloor(payload: SendPayload, chainId: number): Promise<[rate: number, cap: BigNumber, floor: BigNumber]> {
  const {
    from,
    cipherText,
    token: { address: tokenAddress },
  } = payload;
  const chainConfig = parseChainConfig(chainId);
  let actionId = getActionId(payload);
  let rate: number, cap: BigNumber, floor: BigNumber;

  const chain = parseChainConfig(chainId);
  let contractAddress = "0x0000000000000000000000000000000000000001";
  const bridgeChainId = payload.bridge?.chain;

  if (from && cipherText) {
    if (bridgeChainId) {
      //cross chain
      const ccipbridge = CCIPBridgeConfig[bridgeChainId];
      actionId = (BigInt(ccipbridge.chainSelector) << BigInt("8")) | BigInt(actionId);
      contractAddress = chain.SAPBridgeAddress;
    }
    [rate, cap, floor] = await SAERC20Client.connect(chainConfig.ERC20ClientAddress, chainId).getFeeParam(contractAddress, actionId, tokenAddress);
  } else {
    //EOA send
    if (bridgeChainId) {
      //cross chain
      const ccipbridge = CCIPBridgeConfig[bridgeChainId];
      [rate, cap, floor] = await SAPBridge.connect(chainConfig.SAPBridgeAddress, chainId).getFeeParam(
        BigInt(ccipbridge.chainSelector),
        actionId,
        tokenAddress
      );
    } else {
      //same chain
      [rate, cap, floor] = await SAERC20Client.connect(chainConfig.ERC20ClientAddress, chainId).getFeeParam(contractAddress, actionId, tokenAddress);
    }
  }
  return [rate, cap, floor];
}

export async function waitForTransaction(chainId: number, txHash: string, confirmations?: number, timeout?: number) {
  if (!chainId || !txHash) throw new Error("chainId and txHash must be not empty!");
  const rpc = getRpcUrl(chainId);
  const provider = new StaticJsonRpcProvider(rpc);
  const res = await provider.waitForTransaction(txHash, confirmations || 3, timeout);
  if (res) {
    return res;
  }
}

export function sendPayloadCheck(payload: SendPayload) {
  if (!payload.token.decimal) {
    payload.token.decimal = 18;
  }
  if (payload.receive.createSA === undefined || payload.receive.createSA === null) {
    payload.receive.createSA = true;
  }
  const amount = (payload.amount = parseUnits(payload.amount + "", payload.token.decimal));
  payload.amount = amount;
}

export async function getCCIPLink(txnHash: string): Promise<ResultType> {
  try {
    const baseUrl = "/ccip";
    const response = await axios.get(baseUrl, {
      params: {
        // query: "TRANSACTION_SEARCH_QUERY",
        variables: `{"msgIdOrTxnHash":"${txnHash}"}`,
      },
      headers: {},
    });
    const transaction = response.data.data.transactionHash.nodes?.[0];
    if (!transaction) return Result.fail("Not found transaction on CCIP ");
    return Result.success(transaction);
  } catch (error) {
    console.error(error);
    return Result.fail(error);
  }
}

export async function getEventsFromArseed(chainId: number, startBlock?: number) {
  if (!startBlock) return { startBlock: undefined, list: [] };
  const response = await queryLatestIndexByAddress(chainId);
  if (!response) return { startBlock, list: [] };
  const { endBlockAll, indexList } = response;
  if (startBlock >= endBlockAll) return { startBlock, list: [] };
  const index = indexList.filter((o: any) => startBlock <= o.endBlock);
  const data = await Promise.all(index.map((d: any) => queryIndexByHash(d.arHash)));
  return { startBlock: Number(endBlockAll) + 1, list: data.flat() };
}

export async function getENSByAddress(address: string) {
  try {
    const provider = new StaticJsonRpcProvider(getRpcUrl(1));
    const resolver = await provider.lookupAddress(address);
    return resolver;
  } catch (error) {
    console.error(error);
  }
}

export async function getTransactionBatchList(payload: ScanPayload, chain: ChainConfig, wallletAddress: string) {
  const startBlock = await getStartBlock(payload.startBlock, chain.chainId, wallletAddress);
  //get last block
  const provider = new StaticJsonRpcProvider(getRpcUrl(chain.chainId));
  const lastBlock = await provider.getBlockNumber();

  const array = createIntervalArray(startBlock as number, lastBlock, 1200);

  return {
    startBlock,
    total: array.length,
    index: [],
    chainBatch: array,
    announcementListChain: [],
  };
}

export async function scanTransactionNormal(payload: ScanPayload, chain: ChainConfig, wallletAddress: string, contract: Contract) {
  const startBlock = await getStartBlock(payload.startBlock, chain.chainId, wallletAddress);

  //@ts-ignore
  const announcementListChain = await queryTransactionFromChain(chain.chainId, startBlock as number);

  const total = Number(0) + announcementListChain.length;

  return {
    startBlock,
    total,
    index: [],
    announcementListChain,
  };
}

export async function scanTransactionByTxnHash(txnHash: string, chainID: number) {
  try {
    const chain = parseChainConfig(Number(chainID));

    const provider = new StaticJsonRpcProvider(getRpcUrl(Number(chainID)));

    const contract = SAERC20Client.connect(chain.ERC20ClientAddress, provider);

    let announcementListChain: ScanResonse[] = [];

    try {
      const transaction = await provider.getTransaction(txnHash);
      const transactionDescription = contract.interface.parseTransaction(transaction);
      let { saDest, keyCipher, token, amount, relayerRequest } = transactionDescription.args;
      if (relayerRequest) {
        saDest = relayerRequest.dest;
        token = relayerRequest.token;
        amount = relayerRequest.amount;
      }
      announcementListChain = [
        {
          ciphertext: keyCipher,
          txHash: transaction.hash,
          sa: saDest,
          amount,
          token,
          block: transaction.blockNumber,
          type: "Transfer",
        },
      ] as ScanResonse[];
    } catch (error) {
      // maybe bridge transaction
      const transactionRes = await getCCIPLink(txnHash);
      if (transactionRes.code !== 0) throw new Error();
      const transaction = transactionRes.result;
      if (transaction.state < 2) throw new Error("Your transaction is pending, please wait...");
      const { destTransactionHash } = transaction;
      const destTransaction = await provider.getTransaction(destTransactionHash);
      announcementListChain = await queryTransactionFromChain(chainID, destTransaction.blockNumber, destTransaction.blockNumber);
      if (!announcementListChain || announcementListChain.length === 0) throw new Error();
      announcementListChain = announcementListChain.map((o) => ({ ...o, type: "Bridge" }));
    }

    return {
      startBlcok: undefined,
      total: 1,
      index: [],
      announcementListChain,
    };
  } catch (error: any) {
    console.error(error);
    throw new Error(error?.message || "Invalid transaction hash or no transaction details response");
  }
}

export async function estimateGasLimitSAtoEOA(param: RelayerParamSAtoEOA, signer: JsonRpcSigner) {
  const signature = splitSignature(param.signature);
  const saRequest = {
    saSrc: param.stealthAddr,
    dest: param.destination,
    token: param.token,
    amount: param.amount,
    nonce: param.nonce,
    relayerWallet: RELAYER_WALLET_ADDRESS,
    gas: param.relayerGas,
    r: signature.r,
    s: signature.s,
    v: signature.v,
    expireTime: param.expireTime,
  };
  const chain = parseChainConfig(param.chainId);
  const contract = SAERC20Client.connect(chain.ERC20ClientAddress, signer);
  const gasLimit = await contract.estimateGas["transferSAtoEOA"](saRequest);
  return await calculateGas(gasLimit, param.chainId, param.token, signer);
}

export async function estimateGasLimitSAtoSA(param: RelayerParamSAtoSA, signer: JsonRpcSigner) {
  const signature = splitSignature(param.signature);
  const saRequest = {
    saSrc: param.stealthAddr,
    dest: param.destination,
    token: param.token,
    amount: param.amount,
    nonce: param.nonce,
    relayerWallet: RELAYER_WALLET_ADDRESS,
    gas: param.relayerGas,
    r: signature.r,
    s: signature.s,
    v: signature.v,
    expireTime: param.expireTime,
  };
  const chain = parseChainConfig(param.chainId);
  const contract = SAERC20Client.connect(chain.ERC20ClientAddress, signer);
  const gasLimit = await contract.estimateGas["transferSAtoSA"](saRequest, param.skCipher);
  return await calculateGas(gasLimit, param.chainId, param.token, signer);
}

export async function estimateGasLimitSAtoHandle(param: RelayerParamSAtoHandler, signer: JsonRpcSigner) {
  const signature = splitSignature(param.signature);
  const saRequest = {
    saSrc: param.stealthAddr,
    dest: param.destination,
    token: param.token,
    amount: param.amount,
    nonce: param.nonce,
    relayerWallet: RELAYER_WALLET_ADDRESS,
    gas: param.relayerGas,
    r: signature.r,
    s: signature.s,
    v: signature.v,
    expireTime: param.expireTime,
  };
  const chain = parseChainConfig(param.chainId);
  const contract = SAERC20Client.connect(chain.ERC20ClientAddress, signer);
  const gasLimit = await contract.estimateGas["transferSAToHandler"](saRequest, param.actionId, param.paramData, { value: param.additionalFee });
  return await calculateGas(gasLimit, param.chainId, param.token, signer);
}

export async function calculateGas(gasLimit: BigNumber, chainId: number, token: string, signer: JsonRpcSigner) {
  let maxFeePerGas;
  if (CHAIN_OTHER_CONFIG[chainId]?.gasPrice) {
    maxFeePerGas = CHAIN_OTHER_CONFIG[chainId]?.gasPrice;
  } else {
    maxFeePerGas = await getGasPriceByInfura(chainId);
    maxFeePerGas = maxFeePerGas || (await maxFeePerGasBySigner(signer));
  }
  const gas = gasLimit.mul(maxFeePerGas);
  if (token.toLocaleLowerCase() === ETH_ADDRESS.toLocaleLowerCase()) {
    return gas.add(gas.div(5));
  }

  try {
    const erc20Gas = await _convertNativeTokenToErc20Token(chainId, token, gas, signer);
    return erc20Gas.add(erc20Gas.div(5));
  } catch (error) {
    console.error(error);
    return gas.add(gas.div(5));
  }
}

export async function getGasPriceByInfura(chainId: number) {
  try {
    const response = await axios.get(`${RELAYER_BASE_URL}/suggestedGasFees/${chainId}`, {});
    let maxFeePerGas;
    if (response.data.result.maxFeePerGas) {
      maxFeePerGas = response.data.result.maxFeePerGas.hex;
    } else if (response.data.result.gasPrice) {
      maxFeePerGas = response.data.result.gasPrice.hex;
    }
    return BigNumber.from(maxFeePerGas);
  } catch (error) {
    console.error(error);
  }
}

async function _convertNativeTokenToErc20Token(chainId: number, token: string, amount: BigNumber, signer: JsonRpcSigner): Promise<BigNumber> {
  const aggregatorV3InterfaceABI = [
    {
      inputs: [],
      name: "decimals",
      outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [],
      name: "latestRoundData",
      outputs: [
        { internalType: "uint80", name: "roundId", type: "uint80" },
        { internalType: "int256", name: "answer", type: "int256" },
        { internalType: "uint256", name: "startedAt", type: "uint256" },
        { internalType: "uint256", name: "updatedAt", type: "uint256" },
        { internalType: "uint80", name: "answeredInRound", type: "uint80" },
      ],
      stateMutability: "view",
      type: "function",
    },
  ];
  const priceFeedList = ChainlinkFeed[chainId][token];
  if (!priceFeedList) {
    throw new Error("Token not supported");
  }
  const tokenContract = new Contract(token, ["function decimals() view returns (uint8)"], signer);
  const tokenDecimals = await tokenContract.decimals();

  // We need div native token decimal and then mul target ERC20 token decimal
  // We do the mul here first to increase precision
  let amountERC20 = parseUnits(amount.toString(), tokenDecimals); // parseUnits is equivelent to mul decimals

  for (const priceFeed of priceFeedList) {
    const priceFeedContract = new Contract(priceFeed.feedAddress, aggregatorV3InterfaceABI, signer);
    const latestRoundData = await priceFeedContract.latestRoundData();
    const decimals = await priceFeedContract.decimals();
    if (priceFeed.feedOperator === "mul") {
      // amount * price
      amountERC20 = amountERC20.mul(BigNumber.from(latestRoundData.answer)).div(BigNumber.from(parseUnits("1", decimals)));
    } else if (priceFeed.feedOperator === "div") {
      // amount / price
      amountERC20 = amountERC20.mul(BigNumber.from(parseUnits("1", decimals))).div(BigNumber.from(latestRoundData.answer));
    } else {
      throw new Error("Wrong operator in price feed");
    }
  }
  // We need div native token decimal and then mul target ERC20 token decimal
  // We do the mul here first to increase precision
  amountERC20 = amountERC20.div(BigNumber.from(parseUnits("1", 18)));
  console.log("ERC20 token amount:", formatUnits(amountERC20.toString(), tokenDecimals));
  return amountERC20;
}

export async function maxFeePerGasBySigner(signer: JsonRpcSigner) {
  const feeData = await signer.getFeeData();
  return feeData?.maxFeePerGas || feeData?.gasPrice;
}

export async function rpcRollback<T>(rpc: string, fn: Function) {
  if (typeof fn !== "function") {
    throw new Error("The param must be a function");
  }
  const rpcList = rpc.split(",");
  const providers = rpcList.map((url) => new StaticJsonRpcProvider(url));
  let finalError;
  for (const provider of providers) {
    try {
      return await fn(provider);
    } catch (error) {
      finalError = error;
    }
  }
  throw new Error(JSON.stringify(finalError));
}

export function getFallbackProvider(rpc: string) {
  const rpcList = rpc.split(",");
  const providers = rpcList.map((url) => new JsonRpcProvider(url));
  return new FallbackProvider(providers);
}
