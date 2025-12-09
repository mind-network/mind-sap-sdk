import { ISigner } from "@core/interfaces/ISigner";
import { BaseContract } from "./BaseContract";
import { StealthAddressVaultABI, StealthAddressVaultStartBock } from "./config/StealthAddressVault";

export default class StealthAddressVaultContract extends BaseContract {
  constructor(address: string, chainId: number, signer?: ISigner) {
    super(address, chainId, StealthAddressVaultABI, signer);
  }

  get startBlock() {
    return StealthAddressVaultStartBock[this.chaiId];
  }
}
