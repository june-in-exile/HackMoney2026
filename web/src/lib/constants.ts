/**
 * Octopus Frontend Constants
 */

// Deployed contract addresses (testnet)
// Updated 2026-02-01: Redeployed with transfer support ✅
export const PACKAGE_ID = "0xbdfa6e285a327879c9ec3006a4992885ff21809c4d5f22a3b3f65a5228aafe61";
export const POOL_ID = "0xe4b8527f84a141c508250c7f7eba512def477e8c6d60a36e896c6b80c3762a31";

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
