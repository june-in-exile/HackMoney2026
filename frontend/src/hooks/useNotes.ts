"use client";

import { useState, useEffect } from "react";
import { useSuiClient } from "@mysten/dapp-kit";
import type { OctopusKeypair } from "./useLocalKeypair";
import type { Note } from "@octopus/sdk";
import { PACKAGE_ID, POOL_ID } from "@/lib/constants";
import { bigIntToBytes } from "@octopus/sdk";
import { getWorkerManager } from "@/lib/workerManager";

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
export function useNotes(keypair: OctopusKeypair | null) {
  const client = useSuiClient();
  const [notes, setNotes] = useState<OwnedNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Manual refresh function
  const refresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  useEffect(() => {
    if (!keypair) {
      setNotes([]);
      return;
    }

    let isCancelled = false;

    async function scanNotesWithWorker() {
      if (!keypair) return; // TypeScript null check

      setLoading(true);
      setError(null);

      // Ensure loading state is visible for at least 500ms
      const startTime = Date.now();

      try {
        const worker = getWorkerManager();

        // Scan notes using Worker (GraphQL + decrypt + Merkle tree in background)
        const scannedNotes = await worker.scanNotes(
          "https://graphql.testnet.sui.io/graphql",
          PACKAGE_ID,
          POOL_ID,
          keypair.spendingKey,
          keypair.nullifyingKey,
          keypair.masterPublicKey
        );

        if (isCancelled) return;

        // Check spent status for each note (Main thread - requires RPC)
        const ownedNotes: OwnedNote[] = [];
        for (const scanned of scannedNotes) {
          // Deserialize note
          const note: Note = {
            npk: BigInt(scanned.note.npk),
            token: BigInt(scanned.note.token),
            value: BigInt(scanned.note.value),
            random: BigInt(scanned.note.random),
            commitment: BigInt(scanned.note.commitment),
          };

          // Check if spent (Main thread RPC call)
          const spent = await isNullifierSpent(scanned.nullifier);

          ownedNotes.push({
            note,
            leafIndex: scanned.leafIndex,
            nullifier: scanned.nullifier,
            pathElements: scanned.pathElements,
            spent,
            txDigest: scanned.txDigest,
          });
        }

        if (!isCancelled) {
          setNotes(ownedNotes);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : "Failed to scan notes");
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
          const nullifierBytes = Array.from(bigIntToBytes(nullifier));

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

  return { notes, loading, error, refresh };
}

