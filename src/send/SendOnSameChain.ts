import { JsonRpcSigner, TransactionReceipt } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
import { RelayerParamSAtoEOA, RelayerParamSAtoSA, SendPayload } from "../types";
import { ISend } from "./ISend";
import BaseSend from "./BaseSend";
import { ACTION_SET, SEND_SCENES } from "../utils/constants";
import {
  createSA,
  estimateGasLimitSAtoEOA,
  estimateGasLimitSAtoSA,
  getGasPriceByInfura,
  maxFeePerGasBySigner,
  signMessage,
  verifySA,
} from "../utils/utilSap";
import { BigNumber } from "@ethersproject/bignumber";
import { getTimestamp, isNativeToken, parseChainConfig } from "../utils";
import { getAddress } from "@ethersproject/address";
import axios from "axios";
import { formatUnits } from "@ethersproject/units";
import { RELAYER_BASE_URL } from "../config";
import { CHAIN_OTHER_CONFIG } from "../contracts/config";

export default class SendOnSameChain extends BaseSend implements ISend {
  constructor(signer: JsonRpcSigner | Wallet, payload: SendPayload) {
    super(signer, payload);
  }
  async estimateGasFee(): Promise<string> {
    return (await this._EOATOEOASA(true)) as unknown as string;
  }

  async estimateRelayerFee(): Promise<string> {
    const {
      from,
      cipherText,
      receive: { createSA },
    } = this.payload;
    if (!from || !cipherText) {
      throw new Error("Invalid from or ciphertext parameter");
    }

    if (createSA) {
      return (await this._SATOEOASA(true)) as unknown as string;
    }
    return (await this._SATOEOA(true)) as unknown as string;
  }

  async send(): Promise<TransactionReceipt> {
    const scenes = await this.scenes();
    switch (scenes) {
      case SEND_SCENES.EOATOEOASA:
        return await this._EOATOEOASA();
      case SEND_SCENES.SATOEOA:
        return await this._SATOEOA();
      case SEND_SCENES.SATOEOASA:
        return await this._SATOEOASA();
    }
    throw new Error("This scenario is not supported for now");
  }

  async _EOATOEOASA(estimate?: boolean): Promise<TransactionReceipt> {
    const receipt = this.payload.receive.receipt;
    const { stealthKeyPair, skCipher } = await createSA(receipt);
    const saDest = stealthKeyPair.address;
    const amount = this.payload.amount as BigNumber;
    const token = this.payload.token.address;
    const erc20client = await this.getERC20Client();
    const chain = await this.signer.getChainId();
    if (!isNativeToken(token)) {
      await this.approveERC20Token();
    }

    let transactionGas = BigNumber.from(0);
    try {
      const gasLimit = await erc20client.estimateGas.transferEOAtoSA(
        saDest,
        token,
        amount,
        skCipher,
        isNativeToken(token) ? { value: amount.add(this.fee) } : {}
      );

      let maxFeePerGas;
      if (CHAIN_OTHER_CONFIG[chain]?.gasPrice) {
        maxFeePerGas = CHAIN_OTHER_CONFIG[chain]?.gasPrice;
      } else {
        maxFeePerGas = await getGasPriceByInfura(chain);
        if (!maxFeePerGas) {
          maxFeePerGas = await maxFeePerGasBySigner(this.signer as JsonRpcSigner);
        }
      }

      transactionGas = gasLimit.add(gasLimit.div(10)).mul(maxFeePerGas as BigNumber);

      if (estimate) {
        //@ts-ignore
        return transactionGas;
      }

      const res = await erc20client.transferEOAtoSA(saDest, token, amount, skCipher, isNativeToken(token) ? { value: amount.add(this.fee) } : {});
      const from = await this.signer.getAddress();

      await this.transactionHistory.save(from, {
        txnHash: res.hash,
        from,
        fromType: "EOA",
        to: this.payload.receive.receipt,
        sa: saDest,
        chain,
        token,
        value: formatUnits(amount, this.payload.token.decimal),
        time: new Date().getTime(),
        type: "Transfer",
      });

      return res;
    } catch (error) {
      let message = "";
      if (transactionGas.gt(0)) {
        message = message + "transactionGas: " + formatUnits(transactionGas, 18);
      }
      throw new Error(JSON.stringify(error) + "\n" + message);
    }
  }

  async _SATOEOA(estimate?: boolean): Promise<TransactionReceipt> {
    const {
      from,
      cipherText,
      receive: { receipt },
      token: { address, decimal },
      amount,
    } = this.payload;

    const { chainId, chainConfig: chain, address: user } = await this.getSignerInfo();

    const [stealthKeyPairFrom, wallet] = await verifySA(this.signer as JsonRpcSigner, from, cipherText);

    const nonce = await this.getNonce();

    const expireTime = getTimestamp();

    const signPayload = {
      chainId,
      contractAddress: chain.ERC20ClientAddress,
      receive: receipt,
      actionId: BigInt(ACTION_SET.ACTION_SAtoEOA),
      tokenAddress: address,
      amount: amount as BigNumber,
      nonce,
      relayerGas: BigNumber.from("1")._hex,
      expireTime,
    };

    const signature = await signMessage(signPayload, wallet);

    const postData: RelayerParamSAtoEOA = {
      chainId: chainId,
      stealthAddr: stealthKeyPairFrom.address,
      destination: getAddress(receipt),
      token: getAddress(address),
      amount: (amount as BigNumber)._hex,
      nonce: nonce,
      signature,
      relayerGas: "1",
      expireTime,
    };

    let gas;

    if (estimate) {
      const gas = await estimateGasLimitSAtoEOA(postData, this.signer as JsonRpcSigner);
      //@ts-ignore
      return formatUnits(gas, decimal);
    } else {
      gas = this.relayerGas;
    }

    signPayload.relayerGas = gas;

    const signatureEnd = await signMessage(signPayload, wallet);

    postData.relayerGas = gas;
    postData.signature = signatureEnd;

    const res = await axios.post(`${RELAYER_BASE_URL}/transferSAtoEOA`, postData);
    const data = await this.relayerResHandler(res.data);
    await this.transactionHistory.save(user, {
      txnHash: data.hash,
      from: stealthKeyPairFrom.address,
      fromType: "SA",
      to: this.payload.receive.receipt,
      sa: "",
      chain: chainId,
      token: address,
      value: formatUnits(amount, this.payload.token.decimal),
      time: new Date().getTime(),
      type: "Transfer",
    });
    return data;
  }

  async _SATOEOASA(estimate?: boolean): Promise<TransactionReceipt> {
    const {
      from,
      cipherText,
      receive: { receipt },
      token: { address, decimal },
      amount,
    } = this.payload;
    const { chainId, chainConfig: chain, address: user } = await this.getSignerInfo();

    const [stealthKeyPairFrom, wallet] = await verifySA(this.signer as JsonRpcSigner, from, cipherText);

    const { stealthKeyPair, skCipher } = await createSA(receipt);
    const nonce = await this.getNonce();

    const expireTime = getTimestamp();

    const signPayload = {
      chainId,
      contractAddress: chain.ERC20ClientAddress,
      receive: stealthKeyPair.address,
      actionId: BigInt(ACTION_SET.ACTION_SAtoSA),
      tokenAddress: address,
      amount: amount as BigNumber,
      nonce,
      relayerGas: BigNumber.from("1")._hex,
      expireTime,
      paramData: skCipher,
    };
    const signature = await signMessage(signPayload, wallet);
    const postData: RelayerParamSAtoSA = {
      chainId,
      stealthAddr: stealthKeyPairFrom.address,
      destination: stealthKeyPair.address,
      token: getAddress(address),
      amount: (amount as BigNumber)._hex,
      skCipher,
      nonce: nonce,
      signature,
      relayerGas: "1",
      expireTime,
    };

    let gas;

    if (estimate) {
      const gas = await estimateGasLimitSAtoSA(postData, this.signer as JsonRpcSigner);
      //@ts-ignore
      return formatUnits(gas, decimal);
    } else {
      gas = this.relayerGas;
    }
    signPayload.relayerGas = gas;

    const signatureEnd = await signMessage(signPayload, wallet);

    postData.relayerGas = gas;
    postData.signature = signatureEnd;

    const res = await axios.post(`${RELAYER_BASE_URL}/transferSAtoSA`, postData);
    const data = await this.relayerResHandler(res.data);

    await this.transactionHistory.save(user, {
      txnHash: data.hash,
      from: stealthKeyPairFrom.address,
      fromType: "SA",
      to: this.payload.receive.receipt,
      sa: stealthKeyPair.address,
      chain: chainId,
      token: address,
      value: formatUnits(amount, this.payload.token.decimal),
      time: new Date().getTime(),
      type: "Transfer",
    });
    return data;
  }
}
