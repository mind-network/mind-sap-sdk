import { BridgeChainConfig } from "../types";

export const ARSEEDING_NODE = "https://arseed.web3infra.dev/";
export const ARSEEDING_ORDER_QUERY = "https://arseed.web3infra.dev/bundle/orders/";
interface WalletSet {
  [chainName: number]: string;
}
export const INDEX_WALLET_SET: WalletSet = {
  80001: "0xC2b68fe22622536b7DEF1Df02aae639773C1Ad23",
  11155111: "0x4F5f175d7626778DD48eE95409231868D7ACD39B",
};

export const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"; //

export enum KEYPAIR_TYPE {
  ECC,
}

export enum BRIDGE_PRTOTOCOL {
  CCIP,
}

export enum SEND_SCENES {
  EOATOEOASA,
  EOATOSA,
  SATOSA,
  SATOEOASA,
  SATOEOA,
}

export enum ACTION_SET {
  ACTION_EOAtoSA = 1,
  ACTION_SAtoEOA = 2,
  ACTION_SAtoSA = 3,
}

export const ACTION_SET_ADDRESS: Record<ACTION_SET, string> = {
  [ACTION_SET.ACTION_EOAtoSA]: "1",
  [ACTION_SET.ACTION_SAtoEOA]: "2",
  [ACTION_SET.ACTION_SAtoSA]: "3",
};

export const BRIDGE_CHAIN_CONFIG: Record<BRIDGE_PRTOTOCOL, BridgeChainConfig> = {
  [BRIDGE_PRTOTOCOL.CCIP]: {},
};

export const ChainlinkFeed: Record<number, any> = {
  56: {
    "0x55d398326f99059fF775485246999027B3197955": [
      { feedAddress: "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE", feedOperator: "mul" },
      { feedAddress: "0xB97Ad0E74fa7d920791E90258A6E2085088b4320", feedOperator: "div" },
    ],
    "0x2170Ed0880ac9A755fd29B2688956BD959F933F8": [
      { feedAddress: "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE", feedOperator: "mul" },
      { feedAddress: "0x9ef1B8c0E4F7dc8bF5719Ea496883DC6401d5b2e", feedOperator: "div" },
    ],
  },
  11155111: {
    "0xFd57b4ddBf88a4e07fF4e34C487b99af2Fe82a05": [
      { feedAddress: "0x694AA1769357215DE4FAC081bf1f309aDC325306", feedOperator: "mul" },
      { feedAddress: "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E", feedOperator: "div" },
    ],
  },
  421614: {
    // CCIP-BnM = GAS * ETH/USD / USDC/USD
    "0xA8C0c11bf64AF62CDCA6f93D3769B88BdD7cb93D": [
      { feedAddress: "0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165", feedOperator: "mul" },
      { feedAddress: "0x0153002d20B96532C639313c2d54c3dA09109309", feedOperator: "div" },
    ],
  },
  42161: {
    // USDC = USD = GAS * ETH/USD
    "0xaf88d065e77c8cC2239327C5EDb3A432268e5831": [{ feedAddress: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612", feedOperator: "mul" }],
  },
  1: {
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": [{ feedAddress: "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4", feedOperator: "div" }],
  },
  137: {
    "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619": [{ feedAddress: "0x327e23A4855b6F663a28c5161541d69Af8973302", feedOperator: "mul" }],
    "0xc2132D05D31c914a87C6611C10748AEb04B58e8F": [
      { feedAddress: "0xAB594600376Ec9fD91F8e885dADF0CE036862dE0", feedOperator: "mul" },
      { feedAddress: "0x0A6513e40db6EB1b165753AD52E80663aeA50545", feedOperator: "div" },
    ],
    "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359": [
      { feedAddress: "0xAB594600376Ec9fD91F8e885dADF0CE036862dE0", feedOperator: "mul" },
      { feedAddress: "0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7", feedOperator: "div" },
    ],
    "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39": [{ feedAddress: "0x5787BefDc0ECd210Dfa948264631CD53E68F7802", feedOperator: "div" }],
  },
};
