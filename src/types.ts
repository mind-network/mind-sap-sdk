import { JsonRpcSigner, StaticJsonRpcProvider, Web3Provider } from "@ethersproject/providers";
import { BRIDGE_PRTOTOCOL } from "./utils/constants";
import { BigNumber } from "@ethersproject/bignumber";

export interface ChainConfig {
  chainId: number; // Chain ID of the deployed contract
  ERC20ClientAddress: string; // address of Umbra contract
  SAPBridgeAddress: string; //
  startBlock: number; // block Umbra contract was deployed at
}

export type BridgeChainConfig = {};

export type ResultType = {
  code: number; // 0 is success
  message?: string;
  result?: any;
};

export type EthersProvider = Web3Provider | StaticJsonRpcProvider;

export type Bridge = {
  chain: number;
  protocol: BRIDGE_PRTOTOCOL;
  token?: string;
};

export type Receive = {
  receipt: string; // address or ENS or CNS or SA SA publicKey
  createSA?: boolean; // default: true; if receipt is SA ignor this parameter
};

export type Token = {
  address: string;
  decimal?: number; //if ERC20Token need set ERC20Token's decimal
};

export type SendPayload = {
  from?: string; // SA
  cipherText?: string; //
  fee?: number | string; //
  relayerGas?: string; //
  amount: number | BigNumber | string; //
  token: Token; //if ERC20Token need set token address and decimal ETH
  receive: Receive;
  bridge?: Bridge; //
};

export type KeypairECCPayload = {
  publickey?: string;
  privateKey?: string;
};

export type KeypairPhePayload = {
  publickey?: string;
  privateKey?: string;
};

export type StealthRegistryPayload = {
  signerOrProvider: JsonRpcSigner | EthersProvider;
  chainConfig: ChainConfig | number;
};

export type SetStealthKeysPayload = {
  spendingPublicKey: string;
  viewingPublicKey: string;
};

// Type for storing compressed public keys
export type CompressedPublicKey = {
  prefix: number;
  pubKeyXCoordinate: string; // has 0x prefix
};

export type GetStealthKeysResponse = {
  spendingPublicKey: string;
  viewingPublicKey: string;
};

export type EncryptedPayload = {
  ephemeralPublicKey: string; // hex string with 0x04 prefix
  ciphertext: string; // hex string with 0x prefix
};

export type ScanPayload = {
  startBlock?: number;
  endBlock?: number;
  pkgSize?: number;
  txHash?: string;
};

export type TransferEOATOSAPayload = {
  saDest: string;
  token: string;
  amount: number;
  skCipher: Buffer;
};

export type ScanResonse = {
  block?: string;
  ciphertext: string;
  from?: string;
  timestamp?: string;
  txHash: string;
  sa: string;
  amount: BigNumber;
  token: string;
  event?: any;
  type?: string;
};

export type RelayerParamSAtoEOA = {
  chainId: number;
  stealthAddr: string;
  destination: string;
  token: string;
  amount: string;
  nonce: string;
  signature: string;
  relayerGas: string;
  expireTime: number;
};

export type RelayerParamSAtoSA = {
  chainId: number;
  stealthAddr: string;
  destination: string;
  token: string;
  amount: string;
  skCipher: string;
  nonce: string;
  signature: string;
  relayerGas?: string;
  expireTime: number;
};

export type RelayerParamSAtoHandler = {
  chainId: number;
  stealthAddr: string;
  destination: string;
  actionId: string;
  token: string;
  amount: string;
  paramData: string;
  nonce: string;
  signature: string;
  relayerGas: string;
  additionalFee: string;
  expireTime: number;
};

export type SupportChainInfo = {
  chainId: number;
  name: string;
  tokens: Array<{
    address: string;
    name: string;
    decimal: number;
  }>;
};

export type TransactionHistory = {
  txnHash?: string;
  chain?: number;
  time: number;
  from?: string;
  fromType?: string;
  sa?: string;
  to?: string;
  value?: string;
  token?: string;
  type: string;
  status?: number;
};

export type PagePayload = {
  pageSize: number;
  current: number;
};

export type QueryTransactionHistoryPayload = {
  type?: "All" | "Transfer" | "Bridge";
  orderBy?: {
    time?: "asc" | "desc";
  };
} & PagePayload;

export type SignMessagePayload = {
  chainId: number;
  contractAddress: string;
  receive: string;
  actionId: bigint;
  tokenAddress: string;
  amount: BigNumber;
  paramData?: string;
  nonce: number;
  relayerWalletAddress?: string;
  relayerGas: string;
  expireTime: number;
};
