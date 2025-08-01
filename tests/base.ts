import { JsonRpcSigner, StaticJsonRpcProvider } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
import { ResultType } from "../src";
import logger from "./logger";

export function getSigner(privateKey: string, url: string) {
  const wallet = new Wallet(privateKey, new StaticJsonRpcProvider(url));
  return wallet as unknown as JsonRpcSigner;
}

export function assertResponse(response: ResultType, prefix?: string) {
  logger.info(`${prefix || "response"} >>> ` + JSON.stringify(response, undefined, 4));
  expect(response).toHaveProperty("code", 0);
}
