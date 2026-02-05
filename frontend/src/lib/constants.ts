/**
 * Octopus Frontend Constants
 */

// Deployed contract addresses (from environment variables)
export const PACKAGE_ID = "0x44ab3164acc0ff5a09aafed10f75829d9fabef23da18667dd6f99d72b23f00d6";
export const POOL_ID = "0x1a1ff24c1f50aa4b768d2efcdc2c5f3df353817da790ea0e8fe0f9b21a5de6d9";

// Token type for SUI
export const SUI_COIN_TYPE = "0x2::sui::SUI";

// Network configuration
export const NETWORK = (process.env.NEXT_PUBLIC_NETWORK || "testnet") as "testnet" | "mainnet" | "devnet" | "localnet";
export const RPC_URL = "https://fullnode.testnet.sui.io:443";

// LocalStorage keys
export const STORAGE_KEYS = {
  KEYPAIR: "octopus_keypair",
  NOTES: "octopus_notes",
} as const;

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
