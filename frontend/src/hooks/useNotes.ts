"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSuiClient } from "@mysten/dapp-kit";
import type { OctopusKeypair } from "./useLocalKeypair";
import type { Note } from "@octopus/sdk";
import { PACKAGE_ID, POOL_ID } from "@/lib/constants";
import { bigIntToBE32 } from "@octopus/sdk";
import { getWorkerManager } from "@/lib/workerManager";
import {
  loadScanState,
  saveScanState,
  createEmptyScanState,
  clearScanState,
} from "@/lib/scanState";

/**
 * Owned note with metadata for selection and spending
 */
export interface OwnedNote {
  /** The note itself */
  note: Note;
  /** Position in the Merkle tree */
  leafIndex: number;
  /** Merkle proof path elements (fetched lazily when needed) */
  pathElements?: bigint[];
  /** Computed nullifier for double-spend checking */
  nullifier: bigint;
  /** Whether this note has been spent */
  spent: boolean;
  /** Transaction digest where this note was created */
  txDigest: string;
}

/**
 * Hook to scan blockchain events and track user's owned notes.
 *
 * Scans:
 * - ShieldEvents: Public → Private deposits
 * - TransferEvents: Private → Private transfers
 *
 * For each event, attempts to decrypt the note using the user's MPK.
 * If successful, the note belongs to this user.
 */
// Helper to get localStorage key for spent nullifiers
function getSpentNullifiersKey(mpk: bigint): string {
  return `octopus_spent_nullifiers_${mpk.toString()}`;
}

// Load spent nullifiers from localStorage
function loadSpentNullifiers(mpk: bigint): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const key = getSpentNullifiersKey(mpk);
    const stored = localStorage.getItem(key);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

// Save spent nullifiers to localStorage
function saveSpentNullifiers(mpk: bigint, nullifiers: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    const key = getSpentNullifiersKey(mpk);
    localStorage.setItem(key, JSON.stringify(Array.from(nullifiers)));
  } catch (err) {
    console.error("Failed to save spent nullifiers:", err);
  }
}

export function useNotes(keypair: OctopusKeypair | null) {
  const client = useSuiClient();
  const [notes, setNotes] = useState<OwnedNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [scanProgress, setScanProgress] = useState<{
    current: number;
    total: number;
    message: string;
  } | null>(null);

  // Track current keypair to detect changes
  const currentKeypairRef = useRef<bigint | null>(null);

  // Initialize localSpentSet from localStorage
  const [localSpentSet, setLocalSpentSet] = useState<Set<string>>(() => {
    if (!keypair) return new Set();
    return loadSpentNullifiers(keypair.masterPublicKey);
  });

  // Load from localStorage when keypair changes
  useEffect(() => {
    if (!keypair) {
      setLocalSpentSet(new Set());
      return;
    }
    setLocalSpentSet(loadSpentNullifiers(keypair.masterPublicKey));
  }, [keypair?.masterPublicKey]);

  // Manual refresh function
  const refresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  // Mark a note as spent locally (optimistic update) and persist to localStorage
  const markNoteSpent = (nullifier: bigint) => {
    if (!keypair) return;

    setLocalSpentSet((prev) => {
      const newSet = new Set(prev).add(nullifier.toString());
      // Persist to localStorage
      saveSpentNullifiers(keypair.masterPublicKey, newSet);
      return newSet;
    });
  };

  // Batch check multiple nullifiers for spent status (more efficient than one-by-one)
  const batchCheckNullifierStatus = useCallback(
    async (nullifiers: bigint[]): Promise<Map<string, boolean>> => {
      if (nullifiers.length === 0) return new Map();

      try {
        // Get nullifier registry ID (only query once)
        const poolObject = await client.getObject({
          id: POOL_ID,
          options: { showContent: true },
        });

        if (
          poolObject.data?.content?.dataType !== "moveObject" ||
          !poolObject.data.content.fields
        ) {
          return new Map();
        }

        const fields = poolObject.data.content.fields as any;
        const nullifierRegistryId = fields.nullifiers.fields.id.id;

        // OPTIMIZATION: Batch query (increased from 10 to 50 for better performance)
        const batchSize = 50;
        const spentMap = new Map<string, boolean>();

        for (let i = 0; i < nullifiers.length; i += batchSize) {
          const batch = nullifiers.slice(i, i + batchSize);
          const results = await Promise.allSettled(
            batch.map((nullifier) =>
              client.getDynamicFieldObject({
                parentId: nullifierRegistryId,
                name: {
                  type: "vector<u8>",
                  value: Array.from(bigIntToBE32(nullifier)),
                },
              })
            )
          );

          batch.forEach((nullifier, idx) => {
            const result = results[idx];
            const spent =
              result.status === "fulfilled" &&
              result.value.data !== null &&
              result.value.data !== undefined;
            spentMap.set(nullifier.toString(), spent);
          });
        }

        return spentMap;
      } catch (err) {
        return new Map();
      }
    },
    [client]
  );

  useEffect(() => {
    if (!keypair) {
      setNotes([]);
      currentKeypairRef.current = null;
      return;
    }

    // Check if keypair changed by comparing with previous value
    const previousMPK = currentKeypairRef.current;
    const keypairChanged = previousMPK !== null &&
                          previousMPK !== keypair.masterPublicKey;

    if (keypairChanged) {
      // Keypair changed - clear notes immediately
      setNotes([]);
      // Clear scan state to force full rescan
      clearScanState(POOL_ID, keypair.masterPublicKey);
    }

    // Update ref to track current keypair
    currentKeypairRef.current = keypair.masterPublicKey;

    let isCancelled = false;

    async function scanNotesWithWorker() {
      if (!keypair) return; // TypeScript null check

      setLoading(true);
      setError(null);

      // Ensure loading state is visible for at least 500ms
      const startTime = Date.now();

      try {
        const worker = getWorkerManager();

        // PHASE 2 OPTIMIZATION: Load scan state for incremental scanning
        // Note: If keypair just changed, scan state was cleared above
        const scanState =
          loadScanState(POOL_ID, keypair.masterPublicKey) ||
          createEmptyScanState();

        // Scan notes using Worker (GraphQL + decrypt + Merkle tree in background)
        const result = await worker.scanNotes(
          "https://graphql.testnet.sui.io/graphql",
          PACKAGE_ID,
          POOL_ID,
          keypair.spendingKey,
          keypair.nullifyingKey,
          keypair.masterPublicKey,
          {
            // PHASE 2: Pass scan state for incremental scanning
            startShieldCursor: scanState.lastShieldCursor,
            startTransferCursor: scanState.lastTransferCursor,
            cachedCommitments: scanState.cachedCommitments,
            onProgress: (progress) => {
              // Update progress state
              setScanProgress(progress);
            },
          }
        );

        if (isCancelled) return;

        // Collect all nullifiers for batch checking
        const nullifiers = result.notes.map((s) => s.nullifier);

        // Batch check spent status (more efficient than one-by-one)
        const spentMap = await batchCheckNullifierStatus(nullifiers);

        // Build OwnedNote array with spent status from batch query
        const newOwnedNotes: OwnedNote[] = [];
        for (const scanned of result.notes) {
          // Deserialize note
          const note: Note = {
            npk: BigInt(scanned.note.npk),
            token: BigInt(scanned.note.token),
            value: BigInt(scanned.note.value),
            random: BigInt(scanned.note.random),
            commitment: BigInt(scanned.note.commitment),
          };

          // Get spent status from batch query result
          const spent = spentMap.get(scanned.nullifier.toString()) ?? false;

          newOwnedNotes.push({
            note,
            leafIndex: scanned.leafIndex,
            nullifier: scanned.nullifier,
            pathElements: scanned.pathElements,
            spent,
            txDigest: scanned.txDigest,
          });
        }

        if (!isCancelled) {
          // PHASE 2 FIX: Merge new notes with existing notes for incremental scanning
          // Only merge existing notes if this is the SAME keypair (not a fresh scan)
          // We use the saved keypairChanged flag from the start of useEffect
          const shouldMergeExisting = !keypairChanged;

          const notesMap = new Map<number, OwnedNote>();

          // Only merge existing notes if keypair hasn't changed
          if (shouldMergeExisting) {
            for (const existingNote of notes) {
              notesMap.set(existingNote.leafIndex, existingNote);
            }
          }

          // Add/update with new notes (new notes take precedence)
          for (const newNote of newOwnedNotes) {
            notesMap.set(newNote.leafIndex, newNote);
          }

          // Convert back to array and sort by leafIndex
          const mergedNotes = Array.from(notesMap.values()).sort(
            (a, b) => a.leafIndex - b.leafIndex
          );

          setNotes(mergedNotes);
          // Clear progress after completion
          setScanProgress(null);

          // PHASE 2 OPTIMIZATION: Save updated scan state for next incremental scan
          saveScanState(POOL_ID, keypair.masterPublicKey, {
            lastShieldCursor: result.lastShieldCursor,
            lastTransferCursor: result.lastTransferCursor,
            lastScanTime: Date.now(),
            cachedCommitments: result.allCommitments,
            version: 1,
          });
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : "Failed to scan notes");
          setScanProgress(null);
        }
      } finally {
        // Ensure minimum loading duration for better UX
        const elapsed = Date.now() - startTime;
        const minLoadingDuration = 500; // 500ms minimum

        if (elapsed < minLoadingDuration) {
          await new Promise(resolve => setTimeout(resolve, minLoadingDuration - elapsed));
        }

        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    // Check if nullifier is spent on-chain
    async function isNullifierSpent(nullifier: bigint): Promise<boolean> {
      try {
        // Query pool object to get nullifier registry ID
        const poolObject = await client.getObject({
          id: POOL_ID,
          options: { showContent: true },
        });

        if (
          poolObject.data?.content?.dataType === "moveObject" &&
          poolObject.data.content.fields
        ) {
          const fields = poolObject.data.content.fields as any;
          const nullifierRegistryId = fields.nullifiers.fields.id.id;

          // Convert nullifier to byte array (big-endian 32 bytes)
          const nullifierBytes = Array.from(bigIntToBE32(nullifier));

          // Query dynamic field directly from Table
          const dynamicField = await client.getDynamicFieldObject({
            parentId: nullifierRegistryId,
            name: {
              type: 'vector<u8>',
              value: nullifierBytes
            }
          });

          // If field exists (no error and has data), nullifier is spent
          return !dynamicField.error && dynamicField.data !== null && dynamicField.data !== undefined;
        }

        return false;
      } catch (err) {
        // If field not found, nullifier is NOT spent (expected for unspent notes)
        return false; // Assume not spent if check fails
      }
    }

    scanNotesWithWorker();

    return () => {
      isCancelled = true;
    };
  }, [keypair, client, refreshTrigger]);

  // Periodic reconciliation: re-check unspent notes to catch missed events
  useEffect(() => {
    if (!keypair || notes.length === 0) return;

    // Capture current keypair MPK to ensure we only update if keypair hasn't changed
    const currentMPK = keypair.masterPublicKey;

    const intervalId = setInterval(async () => {
      // Safety check: only reconcile if we're still on the same keypair
      if (currentKeypairRef.current !== currentMPK) {
        return;
      }

      // Only check notes marked as unspent
      const unspentNotes = notes.filter((n) => !n.spent);
      if (unspentNotes.length === 0) return;

      const nullifiers = unspentNotes.map((n) => n.nullifier);
      const spentMap = await batchCheckNullifierStatus(nullifiers);

      // Check if any status changed
      let hasChanges = false;
      const updatedNotes = notes.map((note) => {
        if (!note.spent) {
          const nowSpent = spentMap.get(note.nullifier.toString()) ?? false;
          if (nowSpent) {
            hasChanges = true;
            return { ...note, spent: true };
          }
        }
        return note;
      });

      if (hasChanges) {
        // Double-check keypair hasn't changed before updating
        if (currentKeypairRef.current === currentMPK) {
          setNotes(updatedNotes);
        }
      }
    }, 30000); // Every 30 seconds

    return () => clearInterval(intervalId);
  }, [keypair, notes, batchCheckNullifierStatus]);

  // Merge local spent status with on-chain spent status
  const notesWithLocalSpent = notes.map((note) => ({
    ...note,
    spent: note.spent || localSpentSet.has(note.nullifier.toString()),
  }));

  return {
    notes: notesWithLocalSpent,
    loading,
    error,
    refresh,
    markNoteSpent,
    scanProgress, // Include progress in return value
  };
}

