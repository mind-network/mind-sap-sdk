import { JsonRpcSigner, TransactionReceipt } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
import { BRIDGE_PRTOTOCOL, SEND_SCENES } from "../utils/constants";
import { RelayerParamSAtoHandler, SendPayload } from "../types";
import BaseSend from "./BaseSend";
import { ISend } from "./ISend";
import { createSA, estimateGasLimitSAtoHandle, getGasPriceByInfura, maxFeePerGasBySigner, signMessage, verifySA } from "../utils/utilSap";
import { BigNumber } from "@ethersproject/bignumber";
import SAPBridge from "../contracts/SAPBridge";
import { getTimestamp, isNativeToken, parseChainConfig } from "../utils";
import { defaultAbiCoder } from "@ethersproject/abi";
import { getAddress } from "@ethersproject/address";
import axios from "axios";
import { CCIPBridgeConfig, CHAIN_OTHER_CONFIG } from "../contracts/config";
import { formatUnits } from "@ethersproject/units";
import { RELAYER_BASE_URL } from "../config";

export default class SendOnCrossChain extends BaseSend implements ISend {
  constructor(signer: JsonRpcSigner | Wallet, payload: SendPayload) {
    super(signer, payload);
  }
  async estimateGasFee(): Promise<string> {
    return (await this._EOATOEOASA(true)) as unknown as string;
  }
  estimateRelayerFee(): Promise<string> {
    const {
      from,
      cipherText,
      receive: { createSA },
    } = this.payload;
    if (!from || !cipherText) {
      throw new Error("Invalid from or ciphertext parameter");
    }
    if (createSA) {
      return this._SATO(true, true);
    }
    return this._SATO(false, true);
  }

  async send(): Promise<TransactionReceipt> {
    const protocol = this.payload.bridge?.protocol;

    if (protocol !== BRIDGE_PRTOTOCOL.CCIP) {
      throw new Error("cross chain just supports Sepolia to Mumbai and token is USDC and protocal is CCIP for now");
    }

    const scenes = await this.scenes();
    switch (scenes) {
      case SEND_SCENES.EOATOEOASA:
        return await this._EOATOEOASA();
      case SEND_SCENES.SATOEOA:
        return await this._SATO();
      case SEND_SCENES.SATOEOASA:
        return await this._SATO(true);
    }
    throw new Error("This scenario is not supported for now");
  }

  async _EOATOEOASA(estimate?: boolean): Promise<TransactionReceipt> {
    const receipt = this.payload.receive.receipt;
    const { stealthKeyPair, skCipher } = await createSA(receipt);
    const saDest = stealthKeyPair.address;
    const amount = this.payload.amount as BigNumber;
    const token = this.payload.token.address;
    const user = await this.signer.getAddress();

    const destinationChainSelector = this.payload.bridge?.chain as number;

    const ccipbridge = CCIPBridgeConfig[destinationChainSelector];

    const chainId = await this.signer.getChainId();
    const from = await this.signer.getAddress();

    const chainConfig = parseChainConfig(chainId);

    if (!isNativeToken(this.payload.token.address)) {
      await this.approveERC20Token(chainConfig.SAPBridgeAddress);
    }
    const contract = SAPBridge.connect(chainConfig.SAPBridgeAddress, this.signer as JsonRpcSigner);

    const contractPayload = {
      destinationChainSelector: BigInt(ccipbridge.chainSelector),
      saDest,
      token,
      amount,
      skCipher,
    };
    const calcBridgeGas = (await contract.calcBridgeGas(
      contractPayload.destinationChainSelector,
      contractPayload.saDest,
      contractPayload.token,
      contractPayload.amount,
      contractPayload.skCipher
    )) as BigNumber;

    let transactionGas = BigNumber.from(0);
    try {
      const gasLimit = await contract.estimateGas.sendToSA(
        contractPayload.destinationChainSelector,
        contractPayload.saDest,
        contractPayload.token,
        contractPayload.amount,
        contractPayload.skCipher,
        {
          value: calcBridgeGas,
        }
      );

      let maxFeePerGas;
      if (CHAIN_OTHER_CONFIG[chainId]?.gasPrice) {
        maxFeePerGas = CHAIN_OTHER_CONFIG[chainId]?.gasPrice;
      } else {
        maxFeePerGas = await getGasPriceByInfura(chainId);
        if (!maxFeePerGas) {
          maxFeePerGas = await maxFeePerGasBySigner(this.signer as JsonRpcSigner);
        }
      }

      transactionGas = gasLimit.add(gasLimit.div(10)).mul(maxFeePerGas as BigNumber);

      if (estimate) {
        //@ts-ignore
        return { gas: transactionGas, ccipBridgeGas: calcBridgeGas };
      }

      const res = await contract.sendToSA(
        contractPayload.destinationChainSelector,
        contractPayload.saDest,
        contractPayload.token,
        contractPayload.amount,
        contractPayload.skCipher,
        {
          value: calcBridgeGas,
          gasLimit: gasLimit.add(gasLimit.div(10)),
        }
      );

      await this.transactionHistory.save(user, {
        txnHash: res.hash,
        from,
        fromType: "EOA",
        to: this.payload.receive.receipt,
        sa: saDest,
        chain: chainId,
        token,
        value: formatUnits(amount, this.payload.token.decimal),
        time: new Date().getTime(),
        type: "Bridge",
      });

      return res;
    } catch (error: any) {
      let message = "";
      if (calcBridgeGas.gt(0)) {
        message = message + "ccipBridgeGas: " + formatUnits(calcBridgeGas, 18) + "\n";
      }
      if (transactionGas.gt(0)) {
        message = message + "transactionGas: " + formatUnits(transactionGas, 18) + "\n";
      }
      throw new Error(JSON.stringify(error) + "\n" + message);
    }
  }

  async _SATO(needCreateSA?: boolean, estimate?: boolean) {
    const {
      from,
      cipherText,
      receive: { receipt },
      token: { address, decimal },
      amount,
    } = this.payload;
    const { chainId, chainConfig, address: user } = await this.getSignerInfo();

    const [stealthKeyPairFrom, wallet] = await verifySA(this.signer as JsonRpcSigner, from, cipherText);

    const chain = this.payload.bridge?.chain as number;
    const token = address;
    const ccipbridge = CCIPBridgeConfig[chain];
    const destinationChainSelector = BigInt(ccipbridge.chainSelector);

    const contract = SAPBridge.connect(chainConfig.SAPBridgeAddress, this.signer as JsonRpcSigner);

    let dest = receipt,
      cipher;
    let paramData = defaultAbiCoder.encode(["address"], [receipt]);
    let actionId = (destinationChainSelector << BigInt("8")) | BigInt("2");

    if (needCreateSA) {
      const { stealthKeyPair, skCipher } = await createSA(receipt);
      dest = stealthKeyPair.address;
      cipher = skCipher;
      paramData = defaultAbiCoder.encode(["address", "bytes"], [dest, cipher]);
      actionId = (destinationChainSelector << BigInt("8")) | BigInt("3");
    }

    const calcBridgeGas = needCreateSA
      ? await contract.calcBridgeGas(destinationChainSelector, dest, token, amount, cipher)
      : await contract.calcBridgeGasToEOA(destinationChainSelector, dest, token, amount);

    const nonce = await this.getNonce();

    const expireTime = getTimestamp();

    const signPayload = {
      chainId,
      contractAddress: chainConfig.ERC20ClientAddress,
      receive: chainConfig.SAPBridgeAddress,
      actionId,
      tokenAddress: address,
      amount: amount as BigNumber,
      paramData,
      nonce,
      relayerGas: BigNumber.from("1")._hex,
      expireTime,
    };

    const signature = await signMessage(signPayload, wallet);

    const postData: RelayerParamSAtoHandler = {
      chainId,
      stealthAddr: stealthKeyPairFrom.address,
      destination: chainConfig.SAPBridgeAddress,
      actionId: "0x" + actionId.toString(16),
      token: getAddress(address),
      amount: (amount as BigNumber)._hex,
      paramData,
      nonce: nonce,
      signature,
      relayerGas: "1",
      additionalFee: calcBridgeGas._hex,
      expireTime,
    };

    let gas;
    try {
      if (estimate) {
        const gas = await estimateGasLimitSAtoHandle(postData, this.signer as JsonRpcSigner);
        return { gas: formatUnits(gas, decimal), ccipBridgeGas: calcBridgeGas };
      } else {
        gas = this.relayerGas;
      }

      signPayload.relayerGas = gas;

      const signatureEnd = await signMessage(signPayload, wallet);

      postData.relayerGas = gas;
      postData.signature = signatureEnd;

      const res = await axios.post(`${RELAYER_BASE_URL}/transferSAtoHandler`, postData);
      const data = await this.relayerResHandler(res.data);

      await this.transactionHistory.save(user, {
        txnHash: data.hash,
        from: stealthKeyPairFrom.address,
        fromType: "SA",
        to: this.payload.receive.receipt,
        sa: needCreateSA ? dest : "",
        chain: chainId,
        token: address,
        value: formatUnits(amount, this.payload.token.decimal),
        time: new Date().getTime(),
        type: "Bridge",
      });
      return data;
    } catch (error) {
      console.log(error);
      throw new Error(error + "ccipBridgeGas:" + formatUnits(calcBridgeGas, this.payload.token.decimal));
    }
  }
}
