import { Contract } from "@ethersproject/contracts";
import { JsonRpcSigner, Provider, StaticJsonRpcProvider, TransactionReceipt } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
import { isHexString } from "@ethersproject/bytes";
import { concatenateHexStrings, splitBuffer } from "../utils";
import { registryConfig, SAPRegistry_ABI } from "./config";
import { rpcRollback } from "../utils/utilSap";

const _abi = SAPRegistry_ABI;

export default class SAPRegistry {
  static connect(address: string, signerOrProvider: JsonRpcSigner | Wallet | Provider) {
    return new Contract(address, _abi, signerOrProvider);
  }
}

export async function getKeys(address: string): Promise<{ opPubKey: string; encPubKey: string; cipherText: string }> {
  const { opPubKey, encPubKey, cipherText } = await rpcRollback<any>(`${registryConfig.rpc}`, async (provider: JsonRpcSigner | Wallet | Provider) => {
    const contract = SAPRegistry.connect(registryConfig.contractAddress, provider);
    const res = await contract.getKeys(address);
    const opPubKeyArray = res[0];
    const encPubKeyArray = res[1];
    const ciphetTextArray = res[2];
    const opPubKey = concatenateHexStrings(opPubKeyArray).slice(0, 68);
    const encPubKey = concatenateHexStrings(encPubKeyArray);
    const cipherText = concatenateHexStrings(ciphetTextArray);
    return { opPubKey, encPubKey, cipherText };
  });
  return { opPubKey, encPubKey, cipherText };
}

export async function setKeys(
  signer: JsonRpcSigner,
  opPubKey: string,
  encPubKey: string, //n
  cipherText: string
): Promise<TransactionReceipt> {
  if (!isHexString(opPubKey) || !isHexString(encPubKey) || !isHexString(cipherText)) throw new Error("pubkey must be a hex string width 0x prefix");
  const opPubKeyBytes = Buffer.from(opPubKey.slice(2), "hex");
  const encPubKeyBytes = Buffer.from(encPubKey.slice(2), "hex");
  const cipherBytes = Buffer.from(cipherText.slice(2), "hex");
  const contract = SAPRegistry.connect(registryConfig.contractAddress, signer);
  const res = await contract.setKeys(splitBuffer(opPubKeyBytes, 32), splitBuffer(encPubKeyBytes, 32), splitBuffer(cipherBytes, 32));
  return await res.wait();
}

export async function getSetKeysEvent(address: string) {
  const provider = new StaticJsonRpcProvider(registryConfig.rpc);
  const contract = SAPRegistry.connect(registryConfig.contractAddress, provider);
  const filter = contract.filters.KeyChanged(address);
  const events = await contract.queryFilter(filter);
  const lastEvent = events.pop();
  return lastEvent;
}
