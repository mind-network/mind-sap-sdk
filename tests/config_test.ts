import { StaticJsonRpcProvider } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
import { INFURA_ID } from "../src/config";

export const ALICE_WALLET_PRIVATEKEY = "xxxx";

export const BOB_WALLET_PRIVATEKEY = "xxxx";
export const BOB_WALLET_ADDRESS = "xxxx";

export const CHARLIE_WALLET_ADDRESS = "xxxx";

export const BOB_SA_Address = "xxxx";
export const BOB_SA_CipherText = "xxxx";

export const TOKEN_ADDRESS_SEPOLIA = "0xFd57b4ddBf88a4e07fF4e34C487b99af2Fe82a05";
export const TOKEN_ADDRESS_MUMBAI = "0xf1E3A5842EeEF51F2967b3F05D45DD4f4205FF40";

export const GOERLI_INRFUA = `https://goerli.infura.io/v3/${INFURA_ID}`;
export const MUMBAI_INFUA = `https://polygon-mumbai.infura.io/v3/${INFURA_ID}`;
export const SEPOLIA_INFUA = `https://sepolia.infura.io/v3/${INFURA_ID}`;

export const POLYGONSCAN_MUMBAI = "https://mumbai.polygonscan.com/";
export const ETHSCAN_SEPOLIA = "https://sepolia.etherscan.io/";
export const CCIP_explorer = "https://ccip.chain.link/";

export function getSigner(privateKey: string, url: string) {
  const wallet = new Wallet(privateKey, new StaticJsonRpcProvider(url));
  return wallet;
}
