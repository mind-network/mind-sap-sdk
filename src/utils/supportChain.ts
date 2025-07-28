import { SupportChainInfo } from "../types";
import { ETH_ADDRESS } from "./constants";

export const SUPPORT_CHAIN: Array<SupportChainInfo> = [
  {
    name: "Sepolia",
    chainId: 11155111,
    tokens: [
      {
        name: "SepoliaETH",
        address: ETH_ADDRESS,
        decimal: 18,
      },
      {
        address: "0xFd57b4ddBf88a4e07fF4e34C487b99af2Fe82a05",
        name: "CCIP-BnM",
        decimal: 18,
      },
    ],
  },
];
