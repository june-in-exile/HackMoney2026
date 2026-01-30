/**
 * Octopus Frontend Constants
 */

// Deployed contract addresses (testnet)
// TODO: Update these after deploying the pool contract
export const PACKAGE_ID = "0x0";
export const POOL_ID = "0x0";

// Token type for SUI
export const SUI_COIN_TYPE = "0x2::sui::SUI";

// Network configuration
export const NETWORK = "testnet" as const;
export const RPC_URL = "https://fullnode.testnet.sui.io:443";

// LocalStorage keys
export const STORAGE_KEYS = {
  KEYPAIR: "octopus_keypair",
  NOTES: "octopus_notes",
} as const;

// Demo mode - set to true to use mock data without real contracts
export const DEMO_MODE = true;
