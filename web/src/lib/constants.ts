/**
 * Octopus Frontend Constants
 */

// Deployed contract addresses (testnet)
export const PACKAGE_ID = "0x4f644f295c5120cff3d5393dcd8d9444bf0b28990b2eda950faee148b5370123";
export const POOL_ID = "0x1f6c240a5a891098c2acfd0e4302228f88da5be205a7d5224a8c59eb7bfac367";

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

// Demo mode - set to false to use real on-chain contracts
export const DEMO_MODE = false;
