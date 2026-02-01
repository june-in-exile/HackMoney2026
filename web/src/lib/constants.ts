/**
 * Octopus Frontend Constants
 */

// Deployed contract addresses (testnet)
// Updated 2026-02-02: Redeployed with LE endianness fix for Sui groth16 ✅
export const PACKAGE_ID = "0x10b0c07057021ca7d3e1922e4ce66df2519d539614ed4bba90b716e2eb996ade";
export const POOL_ID = "0x0fa823eca462230bfda4afbd531eaae5521324df30343dec124c99b481b94517";

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
