"use client";

import { useState, useEffect } from "react";
import { useSuiClient } from "@mysten/dapp-kit";
import type { OctopusKeypair } from "./useLocalKeypair";
import type { Note } from "@octopus/sdk";
import { PACKAGE_ID, POOL_ID } from "@/lib/constants";
import {
  initPoseidon,
  computeNullifier,
  decryptNote as sdkDecryptNote,
  buildMerkleTreeFromEvents,
  bigIntToBytes,
} from "@octopus/sdk";

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

  useEffect(() => {
    if (!keypair) {
      setNotes([]);
      return;
    }

    let isCancelled = false;

    async function scanNotes() {
      if (!keypair) return; // TypeScript null check
      setLoading(true);
      setError(null);

      try {
        // Initialize Poseidon for cryptographic operations
        await initPoseidon();

        const ownedNotes: OwnedNote[] = [];

        // 1. Query ShieldEvents
        const shieldEvents = await client.queryEvents({
          query: {
            MoveEventType: `${PACKAGE_ID}::pool::ShieldEvent`,
          },
        });

        for (const event of shieldEvents.data) {
          if (isCancelled) return;

          const { position, commitment, encrypted_note } = event.parsedJson as {
            position: string;
            commitment: string;
            encrypted_note: number[];
          };

          // Attempt to decrypt note
          const decryptedNote = tryDecryptNote(
            encrypted_note,
            keypair.spendingKey,
            keypair.masterPublicKey
          );

          if (decryptedNote) {
            // Compute nullifier
            const nullifier = computeNullifier(
              keypair.nullifyingKey,
              Number(position)
            );

            // Check if spent
            const spent = await isNullifierSpent(nullifier);

            ownedNotes.push({
              note: decryptedNote,
              leafIndex: Number(position),
              nullifier,
              spent,
              txDigest: event.id.txDigest,
            });
          }
        }

        // 2. Query TransferEvents (for received notes)
        const transferEvents = await client.queryEvents({
          query: {
            MoveEventType: `${PACKAGE_ID}::pool::TransferEvent`,
          },
        });

        for (const event of transferEvents.data) {
          if (isCancelled) return;

          const { output_positions, encrypted_notes } = event.parsedJson as {
            output_positions: string[];
            encrypted_notes: number[][];
          };

          // Try to decrypt both output notes
          for (let i = 0; i < encrypted_notes.length; i++) {
            const decryptedNote = tryDecryptNote(
              encrypted_notes[i],
              keypair.spendingKey,
              keypair.masterPublicKey
            );

            if (decryptedNote) {
              const position = Number(output_positions[i]);
              const nullifier = computeNullifier(
                keypair.nullifyingKey,
                position
              );

              const spent = await isNullifierSpent(nullifier);

              ownedNotes.push({
                note: decryptedNote,
                leafIndex: position,
                nullifier,
                spent,
                txDigest: event.id.txDigest,
              });
            }
          }
        }

        // 3. Fetch Merkle proofs for all owned notes
        if (ownedNotes.length > 0) {
          const merkleTree = await buildMerkleTreeFromEvents(client, PACKAGE_ID);

          for (const ownedNote of ownedNotes) {
            try {
              const pathElements = merkleTree.getMerkleProof(ownedNote.leafIndex);
              ownedNote.pathElements = pathElements;
            } catch (err) {
              console.error(
                `Failed to generate Merkle proof for note at index ${ownedNote.leafIndex}:`,
                err
              );
            }
          }
        }

        if (!isCancelled) {
          setNotes(ownedNotes);
        }
      } catch (err) {
        console.error("[useNotes] Failed to scan notes:", err);
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : "Failed to scan notes");
        }
      } finally {
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

    scanNotes();

    return () => {
      isCancelled = true;
    };
  }, [keypair, client]);

  return { notes, loading, error };
}

/**
 * Attempt to decrypt an encrypted note using the user's keys.
 * Returns the note if decryption succeeds and we own it, null otherwise.
 *
 * Uses ChaCha20-Poly1305 with ECDH key agreement.
 */
function tryDecryptNote(
  encryptedNote: number[],
  spendingKey: bigint,
  mpk: bigint
): Note | null {
  try {
    // Use SDK's decryptNote function with ECDH + ChaCha20-Poly1305
    return sdkDecryptNote(encryptedNote, spendingKey, mpk);
  } catch (err) {
    // Decryption failed - not our note or corrupted data
    return null;
  }
}

