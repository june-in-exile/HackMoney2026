/**
 * Octopus Frontend Constants
 */

// Deployed contract addresses (from environment variables)
// Use IIFEs to validate and type as string
export const PACKAGE_ID: string = (() => {
  const id = process.env.NEXT_PUBLIC_PACKAGE_ID;
  if (!id) {
    throw new Error("NEXT_PUBLIC_PACKAGE_ID is not defined in environment variables");
  }
  return id;
})();

export const POOL_ID: string = (() => {
  const id = process.env.NEXT_PUBLIC_POOL_ID;
  if (!id) {
    throw new Error("NEXT_PUBLIC_POOL_ID is not defined in environment variables");
  }
  return id;
})();

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
