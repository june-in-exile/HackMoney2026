/**
 * Octopus Frontend Constants
 */

// Deployed contract addresses (from environment variables)
export const PACKAGE_ID = "0xf4c4f37ff7cb19a9ebabdae4c528d56deb53826ced98ef45b171cfe0266c0c0b";
export const POOL_ID = "0x58b93f340913c696f0b2682da634e3aaddaf2a66eb09b0c669dbae6619a7e966";

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
