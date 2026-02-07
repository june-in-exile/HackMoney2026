import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format SUI amount from MIST (1 SUI = 10^9 MIST)
 */
export function formatSui(mist: bigint | number): string {
  // Handle invalid inputs gracefully
  if (mist === undefined || mist === null) {
    return "0";
  }

  // Convert to number safely
  const num = typeof mist === 'bigint' ? Number(mist) : mist;

  // Check for NaN or invalid numbers
  if (isNaN(num) || !isFinite(num)) {
    console.error("Invalid SUI amount:", mist);
    return "0";
  }

  const sui = num / 1e9;
  return sui.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 9,
  });
}

/**
 * Parse SUI amount to MIST
 */
export function parseSui(sui: string): bigint {
  const parsed = parseFloat(sui);
  if (isNaN(parsed) || parsed < 0) {
    throw new Error("Invalid SUI amount");
  }
  return BigInt(Math.floor(parsed * 1e9));
}

/**
 * Truncate address for display
 */
export function truncateAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Convert BigInt to hex string
 */
export function bigIntToHex(n: bigint): string {
  return "0x" + n.toString(16).padStart(64, "0");
}

/**
 * Convert hex string to BigInt
 */
export function hexToBigInt(hex: string): bigint {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  return BigInt("0x" + cleanHex);
}
