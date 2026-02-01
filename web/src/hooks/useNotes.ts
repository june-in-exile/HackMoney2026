"use client";

import { useState, useEffect } from "react";
import { useSuiClient } from "@mysten/dapp-kit";
import type { RailgunKeypair } from "./useLocalKeypair";
import type { Note } from "@octopus/sdk";
import { PACKAGE_ID, POOL_ID } from "@/lib/constants";
import { initPoseidon, deriveNullifier } from "@octopus/sdk";

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
export function useNotes(keypair: RailgunKeypair | null) {
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
          const decryptedNote = await tryDecryptNote(
            encrypted_note,
            keypair.masterPublicKey
          );

          if (decryptedNote) {
            // Compute nullifier
            const nullifier = deriveNullifier(
              keypair.nullifyingKey,
              BigInt(position)
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
            const decryptedNote = await tryDecryptNote(
              encrypted_notes[i],
              keypair.masterPublicKey
            );

            if (decryptedNote) {
              const position = Number(output_positions[i]);
              const nullifier = deriveNullifier(
                keypair.nullifyingKey,
                BigInt(position)
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

        if (!isCancelled) {
          setNotes(ownedNotes);
        }
      } catch (err) {
        console.error("Failed to scan notes:", err);
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
        // Query pool object to check nullifier registry
        const poolObject = await client.getObject({
          id: POOL_ID,
          options: { showContent: true },
        });

        if (
          poolObject.data?.content?.dataType === "moveObject" &&
          poolObject.data.content.fields
        ) {
          const fields = poolObject.data.content.fields as any;
          const nullifiers = fields.nullifiers?.fields?.spent || [];

          // Nullifier is stored as 32-byte hex string
          const nullifierHex = bigIntToHex32(nullifier);

          // Check if nullifier exists in spent set
          return nullifiers.some((spent: string) => spent === nullifierHex);
        }

        return false;
      } catch (err) {
        console.error("Failed to check nullifier:", err);
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
 * Attempt to decrypt an encrypted note using the user's MPK.
 * Returns the note if decryption succeeds, null otherwise.
 *
 * Note: This is a simplified placeholder. In a real implementation,
 * you would need to implement the actual decryption algorithm
 * (e.g., ChaCha20-Poly1305 with shared secret from ECDH).
 */
async function tryDecryptNote(
  encryptedNote: number[],
  mpk: bigint
): Promise<Note | null> {
  try {
    // TODO: Implement actual note decryption
    // For now, this is a placeholder that always returns null
    //
    // Real implementation would:
    // 1. Derive shared secret from MPK and ephemeral public key
    // 2. Decrypt using ChaCha20-Poly1305
    // 3. Parse decrypted bytes into Note struct
    // 4. Verify commitment matches

    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Convert BigInt to 32-byte hex string (for nullifier comparison)
 */
function bigIntToHex32(value: bigint): string {
  let hex = value.toString(16);
  // Pad to 64 hex characters (32 bytes)
  while (hex.length < 64) {
    hex = "0" + hex;
  }
  return "0x" + hex;
}
