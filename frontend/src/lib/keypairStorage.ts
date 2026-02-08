/**
 * Storage utility for managing Privacy Keypairs organized by wallet address and pool ID
 */

import { NETWORK_CONFIG, NETWORK } from "./constants";

const DEFAULT_PACKAGE_ID =
  NETWORK_CONFIG[NETWORK as keyof typeof NETWORK_CONFIG]?.packageId ?? "octopus";

export interface StoredKeypair {
  spendingKey: string;
  nullifyingKey: string;
  masterPublicKey: string;
  timestamp: number; // When this keypair was created
  label?: string; // Optional user-defined label
}

export interface KeypairIdentifier {
  walletAddress: string;
  poolPackageId: string;
}

/**
 * Generate storage key for a specific wallet address and pool
 */
function getStorageKey(identifier: KeypairIdentifier): string {
  return `octopus_keypair_${identifier.walletAddress}_${identifier.poolPackageId}`;
}

/**
 * Get all saved keypairs for a specific wallet address and pool
 */
export function getSavedKeypairs(
  identifier: KeypairIdentifier
): StoredKeypair[] {
  if (typeof window === "undefined") return [];

  try {
    const key = getStorageKey(identifier);
    const stored = localStorage.getItem(key);
    if (!stored) return [];

    const keypairs = JSON.parse(stored);
    return Array.isArray(keypairs) ? keypairs : [];
  } catch (error) {
    console.error("Failed to load saved keypairs:", error);
    return [];
  }
}

/**
 * Save a new keypair for a specific wallet address and pool
 */
export function saveKeypair(
  identifier: KeypairIdentifier,
  keypair: StoredKeypair
): void {
  if (typeof window === "undefined") return;

  try {
    const key = getStorageKey(identifier);
    const existing = getSavedKeypairs(identifier);

    // Add timestamp if not present
    const keypairWithTimestamp: StoredKeypair = {
      ...keypair,
      timestamp: keypair.timestamp || Date.now(),
    };

    // Check if this keypair already exists (same masterPublicKey)
    const index = existing.findIndex(
      (kp) => kp.masterPublicKey === keypairWithTimestamp.masterPublicKey
    );

    if (index >= 0) {
      // Update existing keypair
      existing[index] = keypairWithTimestamp;
    } else {
      // Add new keypair
      existing.push(keypairWithTimestamp);
    }

    localStorage.setItem(key, JSON.stringify(existing));
  } catch (error) {
    console.error("Failed to save keypair:", error);
    throw error;
  }
}

/**
 * Delete a specific keypair for a wallet address and pool
 */
export function deleteKeypair(
  identifier: KeypairIdentifier,
  masterPublicKey: string
): void {
  if (typeof window === "undefined") return;

  try {
    const key = getStorageKey(identifier);
    const existing = getSavedKeypairs(identifier);
    const filtered = existing.filter(
      (kp) => kp.masterPublicKey !== masterPublicKey
    );
    localStorage.setItem(key, JSON.stringify(filtered));
  } catch (error) {
    console.error("Failed to delete keypair:", error);
    throw error;
  }
}

/**
 * Get current active keypair for a wallet address and pool
 */
export function getActiveKeypair(
  identifier: KeypairIdentifier
): StoredKeypair | null {
  if (typeof window === "undefined") return null;

  try {
    const activeKey = `${getStorageKey(identifier)}_active`;
    const stored = localStorage.getItem(activeKey);
    if (!stored) return null;

    return JSON.parse(stored);
  } catch (error) {
    console.error("Failed to load active keypair:", error);
    return null;
  }
}

/**
 * Set the active keypair for a wallet address and pool
 */
export function setActiveKeypair(
  identifier: KeypairIdentifier,
  keypair: StoredKeypair | null
): void {
  if (typeof window === "undefined") return;

  try {
    const activeKey = `${getStorageKey(identifier)}_active`;
    if (keypair === null) {
      localStorage.removeItem(activeKey);
    } else {
      localStorage.setItem(activeKey, JSON.stringify(keypair));
    }
  } catch (error) {
    console.error("Failed to set active keypair:", error);
    throw error;
  }
}

/**
 * Update the label of a specific keypair
 */
export function updateKeypairLabel(
  identifier: KeypairIdentifier,
  masterPublicKey: string,
  label: string
): void {
  if (typeof window === "undefined") return;

  try {
    const key = getStorageKey(identifier);
    const existing = getSavedKeypairs(identifier);
    const index = existing.findIndex((kp) => kp.masterPublicKey === masterPublicKey);

    if (index >= 0) {
      existing[index] = { ...existing[index], label };
      localStorage.setItem(key, JSON.stringify(existing));
    }
  } catch (error) {
    console.error("Failed to update keypair label:", error);
    throw error;
  }
}

/**
 * Clear active keypair for a wallet address and pool
 */
export function clearActiveKeypair(identifier: KeypairIdentifier): void {
  setActiveKeypair(identifier, null);
}

/**
 * Get default identifier using current pool package ID
 */
export function getDefaultIdentifier(walletAddress: string): KeypairIdentifier {
  return {
    walletAddress: walletAddress.toLowerCase(),
    poolPackageId: DEFAULT_PACKAGE_ID,
  };
}
