/**
 * Octopus Frontend Constants
 */

// Deployed contract addresses (testnet)
// Updated 2026-02-02: Redeployed with swapped assertion order (proof check before root check) ✅
export const PACKAGE_ID = "0x9c01494d8616465b314bd372325d0911df664e52632c4448b1bd231f1f77c0a0";
export const POOL_ID = "0xbba5cfb8f48abdd10b59b31ab17c65b35899f6ae2ce4114f2c8a419a94d2a49a";

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
