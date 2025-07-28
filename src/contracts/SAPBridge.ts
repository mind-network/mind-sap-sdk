import { JsonRpcSigner, Provider, StaticJsonRpcProvider } from "@ethersproject/providers";
import { Contract } from "@ethersproject/contracts";
import { SAPBridge_ABI, getRpcUrl } from "./config";

const _abi = SAPBridge_ABI;

export default class SAPBridge {
  static connect(address: string, signerOrProvider: JsonRpcSigner | Provider | number) {
    if (typeof signerOrProvider === "number") {
      const rpc = getRpcUrl(signerOrProvider);
      return new Contract(address, _abi, new StaticJsonRpcProvider(rpc));
    }
    return new Contract(address, _abi, signerOrProvider);
  }
}
