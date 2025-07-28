const env = process.env.NODE_ENV || "dev";
console.log("🚀 ~ env:", env);

const config: Record<string, any> = {
  dev: {
    INFURA_ID: "your-infura-key-here",
    INFURA_ACTIVITY: "your-infura-key-here",
    GAS_INFURA_ID: "your-infura-key-here",
    RELAYER_BASE_URL: "https://saprelayer.mindnetwork.io",
    RELAYER_WALLET_ADDRESS: "0x2049dD70De3bDeE84481Bed742cA09746613c272",
  },
  prod: {
    INFURA_ID: "your-infura-key-here",
    INFURA_ACTIVITY: "your-infura-key-here",
    GAS_INFURA_ID: "your-infura-key-here",
    RELAYER_BASE_URL: "https://saprelayer.mindnetwork.xyz",
    RELAYER_WALLET_ADDRESS: "0xF28b323b2c839293519d36c9244ae17F1ba5f31b",
  },
  mainnet: {
    INFURA_ID: "your-infura-key-here",
    INFURA_ACTIVITY: "your-infura-key-here",
    GAS_INFURA_ID: "your-infura-key-here",
    RELAYER_BASE_URL: "https://saprelayer-mainnet.mindnetwork.xyz",
    RELAYER_WALLET_ADDRESS: "0xDb0B60ab7d987e719fAe55258FEaE2cb5b4FE0CD",
  },
  mainnetio: {
    INFURA_ID: "your-infura-key-here",
    INFURA_ACTIVITY: "your-infura-key-here",
    GAS_INFURA_ID: "your-infura-key-here",
    RELAYER_BASE_URL: "https://saprelayer-mainnet.mindnetwork.xyz",
    RELAYER_WALLET_ADDRESS: "0xDb0B60ab7d987e719fAe55258FEaE2cb5b4FE0CD",
  },
  test: {
    INFURA_ID: "your-infura-key-here",
    INFURA_ACTIVITY: "your-infura-key-here",
    GAS_INFURA_ID: "your-infura-key-here",
    RELAYER_BASE_URL: "https://saprelayer.mindnetwork.io",
    RELAYER_WALLET_ADDRESS: "0x2049dD70De3bDeE84481Bed742cA09746613c272",
  },
};

export const INFURA_ID = config[env].INFURA_ID;

export const GAS_INFURA_ID = config[env].GAS_INFURA_ID;

export const INFURA_ACTIVITY = config[env].INFURA_ACTIVITY;

export const RELAYER_BASE_URL = config[env].RELAYER_BASE_URL;

export const RELAYER_WALLET_ADDRESS = config[env].RELAYER_WALLET_ADDRESS;
