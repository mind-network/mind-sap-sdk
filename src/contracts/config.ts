import { INFURA_ACTIVITY, INFURA_ID } from "../config";
import { ChainConfig } from "../types";
import data from "./deployments.json";
import devData from "./deployments-dev.json";
import mainData from "./deployments-mainnet.json";
import { BigNumberish, BigNumber } from "@ethersproject/bignumber";

const env = process.env.NODE_ENV || "dev";

console.info("🚀 ~ env:", env);

const deploymentData: Record<string, any> = {
  dev: devData,
  mainnet: mainData,
  mainnetio: mainData,
  test: data,
  prod: data,
};

type ChainInfo = Record<string, { chainId: number; contractAddress: string; startBlock?: number }>;

type CCIPInfo = {
  chainName: string;
  chainSelector: string;
  tokens: Array<{ name: string; address: string }>;
};

const { SAClientERC20, SAPBridge, SAPRegistry } = deploymentData[env];

const SAClientERC20_ABI = SAClientERC20.abi;
const SAPBridge_ABI = SAPBridge.abi;
const SAPRegistry_ABI = SAPRegistry.abi;

function getChainInfo() {
  const chainInfo = SAClientERC20.chainInfo as ChainInfo;
  const chainConfigs: Record<number, ChainConfig> = {};
  Object.keys(chainInfo).forEach((key) => {
    const chain = chainInfo[key];
    chainConfigs[chain.chainId] = {
      chainId: chain.chainId,
      ERC20ClientAddress: chain.contractAddress,
      SAPBridgeAddress: "",
      startBlock: chain.chainId == 56 ? 36380978 : chain.startBlock || 0,
    };
  });

  return getSAPBridgeConfig(chainConfigs);
}

function getSAPBridgeConfig(chainConfigs: Record<number, ChainConfig>) {
  const chainInfo = SAPBridge.chainInfo as ChainInfo;
  Object.keys(chainInfo).forEach((key) => {
    const chain = chainInfo[key];
    chainConfigs[chain.chainId] = {
      ...chainConfigs[chain.chainId],
      chainId: chain.chainId,
      SAPBridgeAddress: chain.contractAddress,
    };
  });
  return chainConfigs;
}

const chainConfigs = getChainInfo();
const registryConfig =
  env === "mainnet" || env === "mainnetio"
    ? {
        ...SAPRegistry.chainInfo["polygon"],
        rpc: `https://polygon-mainnet.infura.io/v3/${INFURA_ACTIVITY}`,
      }
    : {
        ...SAPRegistry.chainInfo["polygonamoy"],
        rpc: `https://polygon-amoy.infura.io/v3/${INFURA_ACTIVITY}`,
      };

const getRpcUrl = (chainId: BigNumberish, infuraId?: string) => {
  chainId = BigNumber.from(chainId).toNumber();
  infuraId = infuraId || INFURA_ID;
  if (chainId === 1 || chainId === 1337) return `https://mainnet.infura.io/v3/${infuraId}`;
  if (chainId === 10) return `https://optimism-mainnet.infura.io/v3/${infuraId}`;
  if (chainId === 5) return `https://goerli.infura.io/v3/${infuraId}`;
  if (chainId === 100) return "https://rpc.ankr.com/gnosis";
  if (chainId === 137) return `https://polygon-mainnet.infura.io/v3/${infuraId}`;
  if (chainId === 80002) return `https://rpc.ankr.com/polygon_amoy/`;
  if (chainId === 80085) return `https://rpc.ankr.com/berachain_testnet/`;
  if (chainId === 42161) return `https://arbitrum-mainnet.infura.io/v3/${infuraId}`;
  if (chainId === 421614) return `https://arbitrum-sepolia.infura.io/v3/${infuraId}`;
  if (chainId === 11155111) return `https://sepolia.infura.io/v3/${infuraId}`;
  if (chainId === 97) return `https://data-seed-prebsc-1-s1.bnbchain.org:8545`;
  if (chainId === 534351) return `https://rpc.ankr.com/scroll_sepolia_testnet/`;
  if (chainId === 56) return `https://rpc.ankr.com/bsc/`;
  if (chainId === 59140) return `https://linea-goerli.infura.io/v3/${infuraId}`;
  throw new Error(`No Infura URL for chainId ${chainId}.`);
};

const CCIPBridgeConfig: Record<number, CCIPInfo> = {
  11155111: {
    chainName: "sepolia",
    chainSelector: "16015286601757825753",
    tokens: [
      {
        name: "CCIP-BnM",
        address: "0xFd57b4ddBf88a4e07fF4e34C487b99af2Fe82a05",
      },
      {
        name: "CCIP-LnM",
        address: "0x466D489b6d36E7E3b824ef491C225F5830E81cC1",
      },
    ],
  },
  97: {
    chainName: "bnbtestnet",
    chainSelector: "13264668187771770619",
    tokens: [
      {
        name: "CCIP-BnM",
        address: "0xbfa2acd33ed6eec0ed3cc06bf1ac38d22b36b9e9",
      },
      {
        name: "CCIP-LnM",
        address: "0x79a4fc27f69323660f5bfc12dee21c3cc14f5901",
      },
    ],
  },
  421614: {
    chainName: "arbitrumsepolia",
    chainSelector: "3478487238524512106",
    tokens: [
      {
        name: "CCIP-BnM",
        address: "0xA8C0c11bf64AF62CDCA6f93D3769B88BdD7cb93D",
      },
      {
        name: "CCIP-LnM",
        address: "0x139E99f0ab4084E14e6bb7DacA289a91a2d92927",
      },
    ],
  },
  42161: {
    chainName: "arbitrum",
    chainSelector: "4949039107694359620",
    tokens: [
      {
        name: "USDC",
        address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      },
    ],
  },
  1: {
    chainName: "ethereum",
    chainSelector: "5009297550715157269",
    tokens: [{ name: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" }],
  },
  137: {
    chainName: "polygon",
    chainSelector: "4051577828743386545",
    tokens: [{ name: "USDC", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" }],
  },
  56: {
    chainName: "bnb",
    chainSelector: "11344663589394136015",
    tokens: [],
  },
};

export function getTargetTokenFromSource(sourceToken: string, sourceChainId: number, targetChainId: number) {
  const sourceTokenName = CCIPBridgeConfig[sourceChainId]?.tokens.find((t) => t.address.toLowerCase() === sourceToken.toLowerCase())?.name;
  const targetToken = CCIPBridgeConfig[targetChainId]?.tokens.find((t) => t.name === sourceTokenName);
  if (!targetToken?.address) throw new Error("Invalid target token address");
  return targetToken.address;
}

export const CHAIN_OTHER_CONFIG: Record<number, any> = {
  80001: {
    BLOCK_SPEED: 15,
  },
  11155111: {
    BLOCK_SPEED: 5,
  },
  97: {
    BLOCK_SPEED: 10,
    gasPrice: 5000000000,
  },
  42161: {
    BLOCK_SPEED: 108,
  },
  421614: {
    BLOCK_SPEED: 108,
  },
  56: {
    BLOCK_SPEED: 10,
    gasPrice: 3000000000,
  },
  137: {
    BLOCK_SPEED: 15,
  },
};

export { SAClientERC20_ABI, SAPBridge_ABI, SAPRegistry_ABI, chainConfigs, registryConfig, getRpcUrl, CCIPBridgeConfig };
