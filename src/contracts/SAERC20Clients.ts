import { Contract } from "@ethersproject/contracts";
import {
  JsonRpcSigner,
  Provider,
  StaticJsonRpcProvider,
} from "@ethersproject/providers";
import { SAClientERC20_ABI, getRpcUrl } from "./config";

const _abi = SAClientERC20_ABI;

export default class SAERC20Client {
  static connect(
    address: string,
    signerOrProvider: JsonRpcSigner | Provider | number
  ) {
    if (typeof signerOrProvider === "number") {
      const rpc = getRpcUrl(signerOrProvider);
      return new Contract(address, _abi, new StaticJsonRpcProvider(rpc));
    }
    return new Contract(address, _abi, signerOrProvider);
  }
}
