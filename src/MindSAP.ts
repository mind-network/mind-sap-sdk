import { ChainConfig, QueryTransactionHistoryPayload, ResultType, ScanPayload, ScanResonse, SendPayload } from "./types";
import { JsonRpcSigner, StaticJsonRpcProvider } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
import SendFactory from "./send/SendFactory";
import { assertSupportedAddress, chunkArray, getStartBlock, isNativeToken, isPublicKeyExist, parseChainConfig, sleep } from "./utils";
import Result from "./utils/result";
import { KEYPAIR_TYPE } from "./utils/constants";
import { getKeys, setKeys } from "./contracts/SAPRegistry";
import { formatUnits, parseUnits } from "@ethersproject/units";
import SAERC20Client from "./contracts/SAERC20Clients";
import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import ERC20 from "./contracts/ERC20";
import {
  generatePrivateKeys,
  getActionId,
  getEventsFromArseed,
  getRateCapFloor,
  isSAForUser,
  isValidSA,
  scanTransactionByTxnHash,
  sendPayloadCheck,
  waitForTransaction,
} from "./utils/utilSap";
import SAPBridge from "./contracts/SAPBridge";
import { CCIPBridgeConfig, getRpcUrl } from "./contracts/config";
import { ITransactionHistory } from "./storage/ITransactionHistory";
import StorageFactory from "./storage/StorageFactory";
import { queryTransactionFromBridgeChain, queryTransactionFromChain } from "./utils/transaction";

export class MindSAP {
  readonly stealthType: KEYPAIR_TYPE = KEYPAIR_TYPE.ECC;

  readonly transactionHistory: ITransactionHistory = StorageFactory.createTransactionHistory();

  constructor(stealthType?: KEYPAIR_TYPE) {
    if (stealthType) {
      this.stealthType = stealthType;
    }
  }

  /**
   * send transaction from signer
   * @param signer
   * @param payload
   * @returns
   */
  async send(signer: JsonRpcSigner | Wallet, payload: SendPayload): Promise<ResultType> {
    try {
      sendPayloadCheck(payload);
      // Check that recipient is valid and get normal wallet address.
      const receiverAddress = await assertSupportedAddress(payload.receive.receipt);
      payload.receive.receipt = receiverAddress;
      const sendInstance = await SendFactory.create(signer, payload);
      const result = await sendInstance.send();
      return Result.success(result);
    } catch (error) {
      console.error(error);
      return Result.fail(error);
    }
  }

  async getCalcFee(signer: JsonRpcSigner | Wallet, payload: SendPayload): Promise<ResultType> {
    try {
      sendPayloadCheck(payload);
      let actionId = getActionId(payload);
      const chainId = await signer.getChainId();
      const chain = parseChainConfig(chainId);
      const {
        from,
        cipherText,
        token: { address },
      } = payload;
      let result;
      let contractAddress = "0x0000000000000000000000000000000000000001";
      const bridgeChainId = payload.bridge?.chain;
      const provider = new StaticJsonRpcProvider(getRpcUrl(chainId));
      if (from && cipherText) {
        //SA send
        if (bridgeChainId) {
          //cross chain
          const ccipbridge = CCIPBridgeConfig[bridgeChainId];
          actionId = (BigInt(ccipbridge.chainSelector) << BigInt("8")) | BigInt(actionId);
          contractAddress = chain.SAPBridgeAddress;
        }
        result = (await SAERC20Client.connect(chain.ERC20ClientAddress, provider).calcFee(
          contractAddress,
          actionId,
          address,
          payload.amount
        )) as BigNumber;
      } else {
        //EOA send
        if (bridgeChainId) {
          //cross chain
          const ccipbridge = CCIPBridgeConfig[bridgeChainId];
          result = await SAPBridge.connect(chain.SAPBridgeAddress, provider).calcFee(
            BigInt(ccipbridge.chainSelector),
            actionId,
            address,
            payload.amount
          );
        } else {
          //same chain
          result = (await SAERC20Client.connect(chain.ERC20ClientAddress, provider).calcFee(
            contractAddress,
            actionId,
            address,
            payload.amount
          )) as BigNumber;
        }
      }

      const fee = formatUnits(result, payload.token.decimal);
      return Result.success(fee);
    } catch (error) {
      return Result.fail(error);
    }
  }

  async getRelayerGasFee(signer: JsonRpcSigner | Wallet, payload: SendPayload) {
    try {
      sendPayloadCheck(payload);
      const sendInstance = await SendFactory.create(signer, {
        ...payload,
      });
      const fee = await sendInstance.estimateRelayerFee();
      return Result.success(fee);
    } catch (error) {
      console.error(error);
      return Result.fail(error);
    }
  }

  async getTransactionGasFee(signer: JsonRpcSigner | Wallet, payload: SendPayload) {
    try {
      sendPayloadCheck(payload);
      const sendInstance = await SendFactory.create(signer, payload);
      const fee = await sendInstance.estimateGasFee();
      return Result.success(fee);
    } catch (error) {
      console.error(error);
      return Result.fail(error);
    }
  }

  async registry(signer: JsonRpcSigner): Promise<ResultType> {
    try {
      const { opKeypair, encKeypair } = await generatePrivateKeys(signer);

      let cipherText: string = "";

      while (cipherText.length !== 1026) {
        cipherText = encKeypair.encrypt(opKeypair.privateKeyHex as string, 16) as string;
      }

      await setKeys(signer, opKeypair.publicKeyHex as string, encKeypair.nHex as string, cipherText);
      return Result.success(true);
    } catch (error) {
      console.error(error);
      return Result.fail(error);
    }
  }

  async isRegistry(signer: JsonRpcSigner | string): Promise<ResultType> {
    try {
      let address: string;
      if (typeof signer === "string") {
        address = signer;
      } else {
        address = await signer.getAddress();
      }
      const response = await getKeys(address);
      const flag = isPublicKeyExist(response.opPubKey);
      return Result.success(flag);
    } catch (error) {
      console.error(error);
      return Result.fail(error);
    }
  }

  async scan(signer: JsonRpcSigner | Wallet, payload: ScanPayload, callback: Function): Promise<ResultType> {
    try {
      await this.scanHandle(signer, payload, callback);
      return Result.success("end");
    } catch (error) {
      console.log("🚀 ~ MindSAP ~ scan ~ error:", error);
      callback(Result.fail(error));
      return Result.fail(error);
    }
  }

  async scanHandle(signer: JsonRpcSigner | Wallet, payload: ScanPayload, callback: Function) {
    const chainId = await signer.getChainId();
    const wallletAddress = await signer.getAddress();
    const chain = parseChainConfig(chainId);

    const provider = new StaticJsonRpcProvider(getRpcUrl(chainId));

    const contract = SAERC20Client.connect(chain.ERC20ClientAddress, provider);

    const { encKeypair } = await generatePrivateKeys(signer as JsonRpcSigner);

    //@ts-ignore
    const { total, startBlock, index, announcementListChain, chainBatch } = await scanTransactionByTxnHash(payload.txHash, chainId);
    if (total == 0) {
      callback({
        total: 0,
        data: [],
        current: 0,
        block: startBlock,
      });
      return;
    }
    let current = 0;

    for (const [idx, item] of index.entries()) {
      const { startBlcok, endBlock, sourceChain, targetChain } = item;
      let announcementList: any[] = [];
      let _provider = provider;
      if (sourceChain !== targetChain && targetChain) {
        //cross chain
        announcementList = await queryTransactionFromBridgeChain(sourceChain, startBlcok, endBlock, targetChain);
        _provider = new StaticJsonRpcProvider(getRpcUrl(Number(sourceChain)));
      } else {
        announcementList = await queryTransactionFromChain(sourceChain, startBlcok, endBlock);
      }
      current = idx + 1;
      await handleListTransaction(announcementList, current, _provider);
    }

    if (Array.isArray(chainBatch)) {
      for (const [idx, batch] of chainBatch.entries()) {
        const { startBlock, endBlock } = batch;
        const announcementList = await queryTransactionFromChain(chainId, startBlock, endBlock);
        current = current + 1;
        await handleListTransaction(announcementList, current, provider, endBlock);
      }
    }

    if (payload.txHash) {
      await handleListTransaction(announcementListChain, current + 1, provider);
    }

    async function handleListTransaction(list: any[], currentIndex: number, provider: any, endBlock?: number) {
      if (!list.length) {
        callback({
          total,
          data: [],
          current: currentIndex,
          block: endBlock || startBlock,
        });
        return;
      }
      const chunkSize = 20;
      let process = 0;
      const chunkAnnouncements = chunkArray(list, chunkSize);
      for (const currentAnnouncement of chunkAnnouncements) {
        await sleep(50);
        const { block, list } = await handlerAnnouncement(currentAnnouncement);
        process = process + 1;
        const callbackData = {
          total,
          data: list,
          current: currentIndex - 1 + process / chunkAnnouncements.length,
          block,
        };
        callback(callbackData);
      }

      async function handlerAnnouncement(announcementList: ScanResonse[]) {
        const resultList = new Array();
        let lastBlock;
        for (const [idx, announcement] of announcementList.entries()) {
          const { sa, ciphertext } = announcement;
          const stealthKeyPair = isSAForUser(encKeypair, {
            sa,
            ciphertext,
          });
          if (stealthKeyPair && BigNumber.from(sa).eq(BigNumber.from(stealthKeyPair?.address))) {
            const [_, balance] = await contract.getSA(announcement.sa, announcement.token);
            const [block, tx] = await Promise.all([provider.getBlock(announcement.block as string), provider.getTransaction(announcement.txHash)]);

            const result = {
              ...announcement,
              chainId,
              balance,
              from: tx.from,
              timestamp: String(block.timestamp),
            };
            if (payload.txHash) {
              result.txHash = payload.txHash;
            }
            resultList.push(result);
          }

          if (idx === announcementList.length - 1) {
            lastBlock = announcement.block;
          }
        }
        return { block: lastBlock, list: resultList };
      }
    }
  }

  async getBalance(signer: JsonRpcSigner, tokenAddress: string, SA?: string, chainId?: number): Promise<ResultType> {
    try {
      const address = await signer.getAddress();
      if (!chainId) {
        chainId = await signer.getChainId();
      }
      const chain = parseChainConfig(chainId);
      const provider = new StaticJsonRpcProvider(getRpcUrl(chainId));
      const nativeToken = !tokenAddress || isNativeToken(tokenAddress);
      if (!SA) {
        const balance = nativeToken ? await signer.getBalance() : await ERC20.connect(tokenAddress, provider).balanceOf(address);
        return Result.success(balance);
      }
      if (!(await isValidSA(SA, tokenAddress, chain))) throw new Error("Invalid SA address");
      const contract = SAERC20Client.connect(chain.ERC20ClientAddress, provider);
      const [_, balance] = await contract.getSA(SA, tokenAddress);
      return Result.success(balance);
    } catch (error) {
      return Result.fail(error);
    }
  }

  /**
   * balance = amount + gas + fee
		(1)= amount + gas + floor
		(2)= amount + gas + cap
		(3)= amount + gas + amount*feeRate = amount*(1+feeRate) + gas
    (1) amount_1 = balance - relayer_gas - floor
    (2) amount_2 = balance - relayer_gas - cap
    (3) amount_3 = (balance - relayer_gas) / (1+feeRate)  1=1000000
    (4) if (amount_1 <= floor) => amount_1
    (5) if (amount_2 >= cap) => amount_2
    (6) else => amount_3
   * @returns 
   */
  async getMaxBalance(signer: JsonRpcSigner | Wallet, payload: SendPayload): Promise<ResultType> {
    try {
      sendPayloadCheck(payload);
      const amount = payload.amount as BigNumber;
      const decimal = payload.token.decimal;
      const chainId = await signer.getChainId();
      const token = payload.token.address;

      const [rate, cap, floor] = await getRateCapFloor(payload, chainId);

      const bigRate = BigNumber.from(rate);

      const feeRate = BigNumber.from(1000000).add(bigRate);

      let ralayer_gas = BigNumber.from(0);
      let transaction_gas = BigNumber.from(0);
      let gas = BigNumber.from(0);
      let ccipBridgeGas = BigNumber.from(0);

      if (payload.from && payload.cipherText) {
        const relayerPayload = { ...payload, amount: formatUnits(10000, decimal) };
        const gasRes = await new MindSAP().getRelayerGasFee(signer, relayerPayload);
        if (gasRes.code === 0) {
          if (gasRes.result.gas) {
            ralayer_gas = parseUnits(gasRes.result.gas, decimal);
            gas = ralayer_gas;
            ccipBridgeGas = gasRes.result.ccipBridgeGas;
          } else {
            ralayer_gas = parseUnits(gasRes.result, decimal);
            gas = ralayer_gas;
          }
        } else {
          throw new Error(gasRes.message);
        }
      } else {
        const fee = floor.toBigInt();
        const gasFeePayload = { ...payload, amount: formatUnits(1, decimal), fee: formatUnits(fee, decimal) };
        const gasRes = await new MindSAP().getTransactionGasFee(signer, gasFeePayload);
        if (gasRes.code === 0) {
          if (gasRes.result.gas) {
            transaction_gas = gasRes.result.gas;
            if (isNativeToken(token)) {
              gas = gasRes.result.gas;
            }
            ccipBridgeGas = gasRes.result.ccipBridgeGas;
          } else {
            transaction_gas = gasRes.result;
            if (isNativeToken(token)) {
              gas = gasRes.result;
            }
          }
        } else {
          throw new Error(gasRes.message);
        }
      }

      const amount_1 = amount.sub(gas).sub(floor);
      const amount_2 = amount.sub(gas).sub(cap);
      const amount_3 = amount.sub(gas).div(feeRate).mul(BigNumber.from(1000000));

      const calcAmount1 = amount_1.mul(bigRate).div(BigNumber.from(1000000));

      let balance;
      if (amount_1.lte(BigNumber.from(0))) {
        balance = 0;
      } else if (calcAmount1.lte(floor)) {
        balance = formatUnits(amount_1, decimal);
      } else if (amount_2.mul(bigRate).div(BigNumber.from(1000000)).gte(cap)) {
        balance = formatUnits(amount_2, decimal);
      } else {
        balance = formatUnits(amount_3, decimal);
      }

      const result = { balance } as any;

      if (ralayer_gas.gt(0)) {
        result.relayerGas = formatUnits(ralayer_gas, decimal);
      }
      if (transaction_gas.gt(0)) {
        result.transactionGas = formatUnits(transaction_gas, 18);
      }
      if (ccipBridgeGas.gt(0)) {
        result.ccipBridgeGas = formatUnits(ccipBridgeGas, 18);
      }
      return Result.success(result);
    } catch (error) {
      console.error(error);
      return Result.fail(error);
    }
  }

  async waitTransaction(chainId: number, txHash: string, timeout?: number): Promise<ResultType> {
    try {
      const res = await waitForTransaction(chainId, txHash, undefined, timeout);
      return Result.success(res);
    } catch (error) {
      console.error(error);
      return Result.fail(error);
    }
  }

  async listTransactionHistory(
    signer: JsonRpcSigner,
    payload: QueryTransactionHistoryPayload = {
      type: "All",
      pageSize: 10,
      current: 1,
    }
  ): Promise<ResultType> {
    try {
      const user = await signer.getAddress();
      const result = await this.transactionHistory.query(user, payload);
      return Result.success(result);
    } catch (error) {
      console.error(error);
      return Result.fail(error);
    }
  }

  /**
   * comming soon
   * @returns
   */
  async swap(): Promise<ResultType> {
    try {
      return Result.success(true);
    } catch (error) {
      console.error(error);
      return Result.fail(error);
    }
  }

  /**
   * comming soon
   * @returns
   */
  async stake(): Promise<ResultType> {
    try {
      return Result.success(true);
    } catch (error) {
      console.error(error);
      return Result.fail(error);
    }
  }

  //================inner functions =================//

  //===============static functions================================//
  static async scanFromChain(contract: Contract, chain: ChainConfig, payload: ScanPayload, walletAddress?: string): Promise<ScanResonse[]> {
    const startBlock = await getStartBlock(payload.startBlock, chain.chainId, walletAddress);
    const endBlock = payload.endBlock || "latest";

    const arseedData = await getEventsFromArseed(chain.chainId, startBlock);

    const preAnnouncements = arseedData.list.map((e) => ({
      ...e,
      ciphertext: e.cipher,
      sa: e.saDest,
      amount: BigNumber.from(e.amount),
    }));

    const filter = contract.filters.SATransaction(null, null, null, null);
    const events = await contract.queryFilter(filter, arseedData.startBlock, endBlock);

    const announcements = events.map((event: any) => {
      const { ciphertext, saDest, amount, token } = event.args;
      return {
        ciphertext,
        txHash: event.transactionHash,
        sa: saDest,
        amount,
        token,
        block: event.blockNumber,
      } as ScanResonse;
    });
    return preAnnouncements.concat(announcements);
  }
}
