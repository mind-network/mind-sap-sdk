import { JsonRpcSigner, TransactionReceipt } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";

export interface ISend {
  send(): Promise<TransactionReceipt>;
  estimateRelayerFee(): Promise<string>;
  estimateGasFee(): Promise<string>;
}
