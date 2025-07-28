import { JsonRpcSigner } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
import { SendPayload } from "../types";
import { ISend } from "./ISend";
import SendOnCrossChain from "./SendOnCrossChain";
import SendOnSameChain from "./SendOnSameChain";

export default class SendFactory {
  static async create(
    signer: JsonRpcSigner | Wallet,
    payload: SendPayload
  ): Promise<ISend> {
    const currentChain = await signer.getChainId();

    const chain = payload.bridge?.chain;
    if (currentChain === chain || !chain) {
      //same chain
      return new SendOnSameChain(signer, payload);
    } else {
      return new SendOnCrossChain(signer, payload);
    }
  }
}
