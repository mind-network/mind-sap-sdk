import { isHexString } from "@ethersproject/bytes";
import { computeAddress } from "@ethersproject/transactions";
import { getAddress } from "@ethersproject/address";
import { JsonRpcSigner } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
import { ETH_ADDRESS } from "./constants";
import ERC20Contract from "../contracts/ERC20";
import { ChainConfig } from "../types";
import { BigNumber } from "@ethersproject/bignumber";
import { AxiosRequestConfig } from "axios";
import { chainConfigs, registryConfig } from "../contracts/config";
import { getSetKeysEvent } from "../contracts/SAPRegistry";

export function assertSupportedAddress(receiver: string): string {
  //normal wallet address
  if (isHexString(receiver) && receiver.length === 42) {
    return getAddress(receiver);
  }

  //TODO: get normal address from ENS
  //TODO: get normal address from CNS

  throw new Error("not supported address");
}

export function getAddressFromENS(address: string) {}

export function getAddressFromCNS(address: string) {}

// The function below is exported for testing purposes only and should not be used outside of this file.
export async function assertSufficientBalance(signer: JsonRpcSigner | Wallet, token: string, tokenAmount: number) {
  // If applicable, check that sender has sufficient token balance. ETH balance is checked on send. The isEth
  // method also serves to validate the token input
  if (!isNativeToken(token)) {
    const tokenContract = ERC20Contract.connect(token, signer);
    const tokenBalance = await tokenContract.balanceOf(await signer.getAddress());
    if (tokenBalance.lt(tokenAmount)) {
      const providedAmount = tokenAmount.toString();
      const details = `Has ${tokenBalance.toString()} tokens, tried to send ${providedAmount} tokens.`;
      throw new Error(`Insufficient balance to complete transfer. ${details}`);
    }
  }
  return true;
}

export function isNativeToken(token: string): boolean {
  return getAddress(token) === ETH_ADDRESS; // throws if `token` is not a valid address
}

export const parseChainConfig = (chainConfig: ChainConfig | number) => {
  if (!chainConfig) {
    throw new Error("chainConfig not provided");
  }

  // If a number is provided, verify chainId value is value and pull config from `chainConfigs`
  if (typeof chainConfig === "number") {
    const validChainIds = Object.keys(chainConfigs);
    if (validChainIds.includes(String(chainConfig))) {
      return chainConfigs[chainConfig];
    }
    throw new Error("Unsupported chain ID provided");
  }

  // Otherwise verify the user's provided chain config is valid and return it
  const { chainId, startBlock, ERC20ClientAddress, SAPBridgeAddress } = chainConfig;
  const isValidStartBlock = typeof startBlock === "number" && startBlock >= 0;

  if (!isValidStartBlock) {
    throw new Error(`Invalid start block provided in chainConfig. Got '${startBlock}'`);
  }
  if (typeof chainId !== "number" || !Number.isInteger(chainId)) {
    throw new Error(`Invalid chainId provided in chainConfig. Got '${chainId}'`);
  }

  return {
    ERC20ClientAddress: getAddress(ERC20ClientAddress),
    startBlock,
    chainId,
    SAPBridgeAddress: getAddress(SAPBridgeAddress),
  } as ChainConfig;
};

export const isPublicKeyExist = (pubkey: string) => {
  if (!isHexString(pubkey)) throw new Error("Invalid public key, must be a hex string with 0x prefix");
  if (pubkey == "0x") return false;
  !BigNumber.from(pubkey).eq(BigNumber.from(0));
  return !BigNumber.from(pubkey).eq(BigNumber.from(0));
};

export function bigintTo32BytesHex(bigintValue: bigint): string {
  // Convert the bigint to a hex string without the "0x" prefix.
  let hexString = bigintValue.toString(16);

  // Calculate the padding necessary to make it 32 bytes (64 characters)
  const paddingSize = 64 - hexString.length;
  const padding = "0".repeat(paddingSize);

  // Prepend the padding to the hex string
  hexString = padding + hexString;

  return hexString;
}

export function axiosConfigToCurl(config: AxiosRequestConfig): string {
  const { method = "get", baseURL = "", url = "", params, headers, data } = config;

  let curlCommand = `curl -X ${method.toUpperCase()} ${baseURL}${url}`;

  if (params) {
    const queryString = Object.entries(params)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value as string)}`)
      .join("&");
    curlCommand += `?${queryString}`;
  }

  if (headers) {
    curlCommand += Object.entries(headers)
      .map(([key, value]) => `-H "${key}: ${value}"`)
      .join(" ");
  }

  if (data) {
    curlCommand += ` -d '${JSON.stringify(data)}'`;
  }

  return curlCommand;
}

export function splitBuffer(buffer: Buffer, groupSize: number): Buffer[] {
  const totalGroups = Math.ceil(buffer.length / groupSize);
  const result: Buffer[] = [];

  for (let i = 0; i < totalGroups; i++) {
    const start = i * groupSize;
    const end = start + groupSize;

    let group = buffer.slice(start, end);

    if (group.length < groupSize) {
      group = Buffer.concat([group, Buffer.alloc(groupSize - group.length, 0)]);
    }

    result.push(group);
  }

  return result;
}

export function concatenateHexStrings(hexStrings: string[]): string {
  if (hexStrings.length === 0) {
    return "0x";
  }

  const stringsWithoutPrefix = hexStrings.map((hexString) => (hexString.startsWith("0x") ? hexString.slice(2) : hexString));

  const concatenatedString = "0x" + stringsWithoutPrefix.join("");

  return concatenatedString;
}

export function removeTrailingZeros(hexString: string): string {
  const trimmedHexString = hexString.replace(/0+$/, "");
  return trimmedHexString === "" ? "0" : trimmedHexString;
}

export function isOddNumber(length: number): boolean {
  return length % 2 === 1;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getStartBlock(startBlock?: number, chainId?: number, walletAddress?: string) {
  console.log("getStartBlock:", startBlock, !!startBlock);
  if (startBlock) return startBlock;
  console.log(chainId, registryConfig.chainId, walletAddress);
  if (chainId === registryConfig.chainId && walletAddress) {
    const event = await getSetKeysEvent(walletAddress);
    return event?.blockNumber;
  }
  return chainId && chainConfigs[chainId].startBlock;
}

export function chunkArray<T>(arr: T[], chunkSize: number): T[][] {
  const result: T[][] = [];

  for (let i = 0; i < arr.length; i += chunkSize) {
    result.push(arr.slice(i, i + chunkSize));
  }

  return result;
}

export const isDev = process.env.NODE_ENV === "dev";

export function getTimestamp(mins: number = 30) {
  const currentTime = new Date();

  const futureTime = new Date(currentTime.getTime() + mins * 60 * 1000);

  const futureTimestampInSeconds = Math.floor(futureTime.getTime() / 1000);

  return futureTimestampInSeconds;
}

export function createIntervalArray(start: number, end: number, intervals: number): any[] {
  let startBlock = start;
  const gap = intervals;
  const resultArray = new Array();
  while (startBlock <= end) {
    const endBlock = startBlock + gap;
    if (endBlock > end) {
      resultArray.push({ startBlock, endBlock: end });
    } else {
      resultArray.push({ startBlock, endBlock: endBlock });
    }
    startBlock = endBlock + 1;
  }

  return resultArray;
}
