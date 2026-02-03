/**
 * Octopus Frontend Constants
 */

// Deployed contract addresses (from environment variables)
export const PACKAGE_ID = "0xd107825d22a404491a284b0ccd23c7ce9b627691e2d4371149fa3bbb0096cbaf";
export const POOL_ID = "0x07d8ffb4720526371f73f032d1f5b77050ffb36a90513715b8edf0aad76c68fb";

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
