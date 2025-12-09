import { ISigner } from "@core/interfaces/ISigner";
import { BaseContract } from "./BaseContract";
import { SAPBridgeABI, SAPBridgeAddress } from "./config/SAPBridge";

export default class SAPBridgeContract extends BaseContract {
  constructor(chainId: number, signer?: ISigner) {
    const address = SAPBridgeAddress[chainId];
    super(address, chainId, SAPBridgeABI, signer);
  }
}
