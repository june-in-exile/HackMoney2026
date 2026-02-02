/**
 * Octopus Frontend Constants
 */

// Deployed contract addresses (testnet)
// Updated 2026-02-02: Redeployed with swapped assertion order (proof check before root check) ✅
export const PACKAGE_ID = "0x6458f0cc338813b938f7f75cdf56ae8ffdd4872b6e32f4229ef9e68c43032649";
export const POOL_ID = "0x55fb89a925d2f7b45ea4a847c6fb893e300eadfdf1a1f783fe0ec4910bdb4847";

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

// Circuit artifact URLs
export const CIRCUIT_URLS = {
  UNSHIELD: {
    WASM: "/circuits/unshield_js/unshield.wasm",
    ZKEY: "/circuits/unshield_final.zkey",
    VK: "/circuits/unshield_vk.json",
  },
  TRANSFER: {
    WASM: "/circuits/transfer_js/transfer.wasm",
    ZKEY: "/circuits/transfer_final.zkey",
    VK: "/circuits/transfer_vk.json",
  },
} as const;
