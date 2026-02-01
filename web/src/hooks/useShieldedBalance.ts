/**
 * Hook to fetch and track shielded balance from on-chain events
 */

import { useState, useEffect, useCallback } from "react";
import { useSuiClient } from "@mysten/dapp-kit";
import { initPoseidon, decryptNote } from "@octopus/sdk";
import type { OctopusKeypair } from "@/hooks/useLocalKeypair";
import { PACKAGE_ID, POOL_ID, STORAGE_KEYS } from "@/lib/constants";
import type { ShieldedNote, StoredNote } from "@/types/note";
import { noteToStored, storedToNote } from "@/types/note";

interface UseShieldedBalanceResult {
  /** Total shielded balance */
  balance: bigint;
  /** Number of unspent notes */
  noteCount: number;
  /** All notes (spent and unspent) */
  notes: ShieldedNote[];
  /** Whether initial scan is loading */
  isLoading: boolean;
  /** Error message if scan failed */
  error: string | null;
  /** Manually refresh balance from chain */
  refresh: () => Promise<void>;
}

/**
 * Fetch and decrypt shielded notes from blockchain events
 */
export function useShieldedBalance(
  keypair: OctopusKeypair | null
): UseShieldedBalanceResult {
  const [notes, setNotes] = useState<ShieldedNote[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const client = useSuiClient();

  /**
   * Load notes from localStorage
   */
  const loadNotesFromStorage = useCallback(
    (mpk: string): ShieldedNote[] => {
      try {
        const key = `${STORAGE_KEYS.NOTES}_${mpk}`;
        const stored = localStorage.getItem(key);
        if (!stored) return [];

        const parsed = JSON.parse(stored) as StoredNote[];
        return parsed.map(storedToNote);
      } catch (err) {
        console.error("Failed to load notes from storage:", err);
        return [];
      }
    },
    []
  );

  /**
   * Save notes to localStorage
   */
  const saveNotesToStorage = useCallback((mpk: string, notes: ShieldedNote[]) => {
    try {
      const key = `${STORAGE_KEYS.NOTES}_${mpk}`;
      const stored = notes.map(noteToStored);
      localStorage.setItem(key, JSON.stringify(stored));
    } catch (err) {
      console.error("Failed to save notes to storage:", err);
    }
  }, []);

  /**
   * Scan blockchain for ShieldEvent emissions and decrypt notes
   */
  const scanShieldEvents = useCallback(
    async (spendingKey: bigint, mpk: bigint): Promise<ShieldedNote[]> => {
      try {
        // Initialize Poseidon if not already done
        await initPoseidon();

        // Query ShieldEvent events from the pool
        const events = await client.queryEvents({
          query: {
            MoveEventType: `${PACKAGE_ID}::pool::ShieldEvent`,
          },
        });

        const decryptedNotes: ShieldedNote[] = [];

        for (const event of events.data) {
          try {
            const eventData = event.parsedJson as {
              position: string;
              commitment: number[];
              encrypted_note: number[];
            };

            // Try to decrypt the note (requires spending key + MPK)
            const decrypted = decryptNote(
              eventData.encrypted_note,
              spendingKey,
              mpk
            );

            if (decrypted) {
              // This note belongs to us!
              decryptedNotes.push({
                commitment: Buffer.from(eventData.commitment).toString("hex"),
                npk: decrypted.npk.toString(),
                token: decrypted.token.toString(),
                value: decrypted.value,
                random: decrypted.random.toString(),
                position: parseInt(eventData.position),
                txDigest: event.id.txDigest,
                spent: false, // Will update this when we implement unshield tracking
              });
            }
          } catch (err) {
            // Failed to decrypt - not our note, skip silently
            continue;
          }
        }

        return decryptedNotes;
      } catch (err) {
        console.error("Failed to scan shield events:", err);
        throw err;
      }
    },
    [client]
  );

  /**
   * Refresh balance from blockchain
   */
  const refresh = useCallback(async () => {
    if (!keypair) {
      setNotes([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Scan blockchain for our notes
      const scannedNotes = await scanShieldEvents(
        keypair.spendingKey,
        keypair.masterPublicKey
      );

      // Merge with existing notes from storage to preserve spent status
      const mpkHex = keypair.masterPublicKey.toString();
      const storedNotes = loadNotesFromStorage(mpkHex);

      // Create a map of stored notes by commitment
      const storedMap = new Map(
        storedNotes.map((note) => [note.commitment, note])
      );

      // Merge: prefer stored spent status, but add new notes
      const mergedNotes = scannedNotes.map((scanned) => {
        const stored = storedMap.get(scanned.commitment);
        return stored || scanned;
      });

      setNotes(mergedNotes);
      saveNotesToStorage(mpkHex, mergedNotes);
    } catch (err) {
      console.error("Failed to refresh balance:", err);
      setError(err instanceof Error ? err.message : "Failed to load balance");
    } finally {
      setIsLoading(false);
    }
  }, [keypair, scanShieldEvents, loadNotesFromStorage, saveNotesToStorage]);

  /**
   * Initial load on keypair change
   */
  useEffect(() => {
    if (!keypair) {
      setNotes([]);
      return;
    }

    // Load from storage first for instant display
    const mpkHex = keypair.masterPublicKey.toString();
    const storedNotes = loadNotesFromStorage(mpkHex);
    if (storedNotes.length > 0) {
      setNotes(storedNotes);
    }

    // Then refresh from blockchain
    refresh();
  }, [keypair, refresh, loadNotesFromStorage]);

  // Calculate totals
  const unspentNotes = notes.filter((note) => !note.spent);
  const balance = unspentNotes.reduce((sum, note) => sum + note.value, 0n);

  return {
    balance,
    noteCount: unspentNotes.length,
    notes,
    isLoading,
    error,
    refresh,
  };
}
