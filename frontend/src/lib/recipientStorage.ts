/**
 * Recipient Profile Storage
 *
 * Manages saving and loading recipient profiles (MPK + viewing public key)
 * to/from browser localStorage.
 */

import type { RecipientProfileStored } from "@octopus/sdk";

const STORAGE_KEY_PREFIX = "octopus_recipients";

/**
 * Get storage key for a specific wallet address
 */
function getStorageKey(walletAddress: string): string {
  return `${STORAGE_KEY_PREFIX}_${walletAddress}`;
}

/**
 * Save a recipient profile to localStorage
 *
 * If a recipient with the same MPK already exists, it will be updated.
 * Otherwise, a new recipient will be added.
 *
 * @param walletAddress - Current user's wallet address
 * @param recipient - Recipient profile to save
 */
export function saveRecipient(
  walletAddress: string,
  recipient: RecipientProfileStored
): void {
  const key = getStorageKey(walletAddress);
  const existing = getRecipients(walletAddress);

  // Remove existing entry with same MPK (if any)
  const filtered = existing.filter((r) => r.mpk !== recipient.mpk);

  // Add the new/updated recipient
  filtered.push({
    ...recipient,
    addedAt: recipient.addedAt || Date.now(),
  });

  localStorage.setItem(key, JSON.stringify(filtered));
}

/**
 * Get all saved recipients for a wallet address
 *
 * @param walletAddress - Current user's wallet address
 * @returns Array of saved recipient profiles
 */
export function getRecipients(
  walletAddress: string
): RecipientProfileStored[] {
  const key = getStorageKey(walletAddress);
  const data = localStorage.getItem(key);

  if (!data) {
    return [];
  }

  try {
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Failed to parse recipients from localStorage:", error);
    return [];
  }
}

/**
 * Delete a recipient from localStorage
 *
 * @param walletAddress - Current user's wallet address
 * @param mpk - Master Public Key of the recipient to delete
 */
export function deleteRecipient(walletAddress: string, mpk: string): void {
  const key = getStorageKey(walletAddress);
  const existing = getRecipients(walletAddress);
  const filtered = existing.filter((r) => r.mpk !== mpk);

  if (filtered.length === 0) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, JSON.stringify(filtered));
  }
}

/**
 * Find a recipient by MPK
 *
 * @param walletAddress - Current user's wallet address
 * @param mpk - Master Public Key to search for
 * @returns Recipient profile if found, null otherwise
 */
export function findRecipient(
  walletAddress: string,
  mpk: string
): RecipientProfileStored | null {
  const recipients = getRecipients(walletAddress);
  return recipients.find((r) => r.mpk === mpk) || null;
}

/**
 * Clear all saved recipients for a wallet address
 *
 * @param walletAddress - Current user's wallet address
 */
export function clearAllRecipients(walletAddress: string): void {
  const key = getStorageKey(walletAddress);
  localStorage.removeItem(key);
}
