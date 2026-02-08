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

export const SUI_POOL_ID: string = (() => {
  const id = process.env.NEXT_PUBLIC_SUI_POOL_ID;
  if (!id) {
    throw new Error("NEXT_PUBLIC_SUI_POOL_ID is not defined in environment variables");
  }
  return id;
})();

export const USDC_POOL_ID: string = (() => {
  const id = process.env.NEXT_PUBLIC_USDC_POOL_ID;
  if (!id) {
    throw new Error("NEXT_PUBLIC_USDC_POOL_ID is not defined in environment variables");
  }
  return id;
})();

// Token types
export const SUI_COIN_TYPE = "0x2::sui::SUI";

export const USDC_COIN_TYPE: string = (() => {
  const t = process.env.NEXT_PUBLIC_USDC_TYPE;
  if (!t) {
    throw new Error("NEXT_PUBLIC_USDC_TYPE is not defined in environment variables");
  }
  return t;
})();

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
  SWAP: {
    WASM: "/circuits/swap_js/swap.wasm",
    ZKEY: "/circuits/swap_final.zkey",
    VK: "/circuits/swap_vk.json",
  },
} as const;

// DeepBook V3 configuration
export const DEEPBOOK_PACKAGE_ID = "0x2c8d603bc51326b8c13cef9dd07031a408a48dddb541963357661df5d3204809";

// Token configurations
export interface TokenConfig {
  type: string;
  symbol: string;
  decimals: number;
  poolId: string;
}

export const TOKENS: Record<string, TokenConfig> = {
  SUI: {
    type: SUI_COIN_TYPE,
    symbol: "SUI",
    decimals: 9,
    poolId: SUI_POOL_ID,
  },
  USDC: {
    type: USDC_COIN_TYPE,
    symbol: "USDC",
    decimals: 6,
    poolId: USDC_POOL_ID,
  },
};

// DeepBook pool mappings (SUI/USDC pair)
export const DEEPBOOK_POOLS: Record<string, string> = {
  SUI_USDC: process.env.NEXT_PUBLIC_DEEPBOOK_SUI_USDC || "0x...",
  USDC_SUI: process.env.NEXT_PUBLIC_DEEPBOOK_SUI_USDC || "0x...", // Same pool, reverse direction
};
