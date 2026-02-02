/**
 * Octopus Frontend Constants
 */

// Deployed contract addresses (testnet)
// Updated 2026-02-02: Redeployed with swapped assertion order (proof check before root check) ✅
export const PACKAGE_ID = "0xa28c94d54c043742f6322070b77ffffd935844c3ab5f3106c21dcd1c50115424";
export const POOL_ID = "0xbb0ffb1d57ffae497e62302c944e304cebdff923e84aeaa18f6c424be4b151df";

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
