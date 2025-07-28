import axios from "axios";
import { ARSEEDING_NODE, ARSEEDING_ORDER_QUERY, INDEX_WALLET_SET } from "./constants";
import { Contract } from "@ethersproject/contracts";
import { ScanResonse } from "../types";
import { BigNumber } from "@ethersproject/bignumber";
import { parseChainConfig } from ".";
import { StaticJsonRpcProvider } from "@ethersproject/providers";
import { CCIPBridgeConfig, getRpcUrl, getTargetTokenFromSource } from "../contracts/config";
import SAPBridge from "../contracts/SAPBridge";
import SAERC20Client from "../contracts/SAERC20Clients";

export async function queryIndexByHash(arHash: string) {
  try {
    const response = await axios.get(ARSEEDING_NODE + arHash);
    const index = response.data;
    return index;
  } catch (error) {
    console.error(error);
  }
}

export async function queryLatestIndexByAddress(chainId: number) {
  try {
    const response = await axios.get(ARSEEDING_ORDER_QUERY + INDEX_WALLET_SET[chainId]);
    const orders = response.data;
    const latestOrder = orders[0];
    const arHash = latestOrder["itemId"];
    return await queryIndexByHash(arHash);
  } catch (error) {}
}

export async function queryTotalTransactionIndex(chainId: number, startBlock?: number) {
  if (!startBlock) return { startBlock: undefined, index: [], total: 0 };

  const response = await queryLatestIndexByAddress(chainId);

  if (!response) return { startBlock, index: [], total: 0 };

  const { endBlockAll, indexList } = response;

  if (startBlock >= endBlockAll) return { startBlock, index: [], total: 0 };

  const index = indexList.filter((o: any) => startBlock <= o.endBlock) as any[];

  const total = index.reduce((pre, current) => pre + Number(current.count), 0);

  return { startBlock: Number(endBlockAll) + 1, index, total };
}

export async function queryTransactionFromChain(chainID: number, startBlock?: number, endBlock?: number) {
  const chain = parseChainConfig(Number(chainID));

  const provider = new StaticJsonRpcProvider(getRpcUrl(Number(chainID)));

  const contract = SAERC20Client.connect(chain.ERC20ClientAddress, provider);

  const filter = contract.filters.SATransaction(null, null, null, null);
  console.log("🚀 ~ queryTransactionFromChain ~ startBlock, endBlock:", startBlock, endBlock);
  const events = await contract.queryFilter(filter, startBlock, endBlock || "latest");

  const announcements = events.map((event: any) => {
    const { ciphertext, saDest, amount, token } = event.args;
    return {
      ciphertext,
      txHash: event.transactionHash,
      sa: saDest,
      amount,
      token,
      block: event.blockNumber,
      type: "Transfer",
    } as ScanResonse;
  });

  return announcements;
}

export async function queryTransactionFromBridgeChain(chainId: number, startBlock?: number, endBlock?: number, targetChainId?: number) {
  targetChainId = Number(targetChainId);
  chainId = Number(chainId);
  const chain = parseChainConfig(chainId);
  const provider = new StaticJsonRpcProvider(getRpcUrl(chainId));

  const contract = SAPBridge.connect(chain.SAPBridgeAddress, provider);

  const filter = contract.filters.SAMessageSent(null, null, null, null, null, null, null, null);
  const events = await contract.queryFilter(filter, Number(startBlock), Number(endBlock) || "latest");

  const announcements = events.map((event: any) => {
    const { ciphertext, destination: saDest, amount, token } = event.args;
    const targetToken = getTargetTokenFromSource(token, chainId, targetChainId!);
    return {
      ciphertext,
      txHash: event.transactionHash,
      sa: saDest,
      amount,
      token: targetToken,
      block: event.blockNumber,
      type: "Bridge",
    } as ScanResonse;
  });

  return announcements;
}
