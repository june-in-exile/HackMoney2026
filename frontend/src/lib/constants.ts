/**
 * Octopus Frontend Constants
 */

// Deployed contract addresses (from environment variables)
export const PACKAGE_ID = "0x4e78bba09daefa2d22618523aae83d6f52ad143fdf4d989c9edfed4b6e8d918f";
export const POOL_ID = "0x98ea785c5142db3aaedcb8649f2223d5f7442c6096a5c57b8d6dc0fcd847c526";

// Token type for SUI
export const SUI_COIN_TYPE = "0x2::sui::SUI";

// Network configuration
export const NETWORK = (process.env.NEXT_PUBLIC_NETWORK || "testnet") as "testnet" | "mainnet" | "devnet" | "localnet";

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
