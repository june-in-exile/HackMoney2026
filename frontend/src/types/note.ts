/**
 * Note types for frontend
 */

/**
 * A shielded note stored locally after scanning blockchain events
 */
export interface ShieldedNote {
  /** Note commitment */
  commitment: string;
  /** NSK (Note Secret Key) */
  nsk: string;
  /** Token identifier */
  token: string;
  /** Amount in the note */
  value: bigint;
  /** Random blinding factor */
  random: string;
  /** Position in the Merkle tree */
  position: number;
  /** Transaction digest where this note was created */
  txDigest: string;
  /** Whether this note has been spent (nullifier used) */
  spent: boolean;
}

/**
 * Simplified note for localStorage persistence
 */
export interface StoredNote {
  commitment: string;
  nsk: string;
  token: string;
  value: string; // Stored as string to avoid BigInt serialization issues
  random: string;
  position: number;
  txDigest: string;
  spent: boolean;
}

/**
 * Convert ShieldedNote to StoredNote for localStorage
 */
export function noteToStored(note: ShieldedNote): StoredNote {
  return {
    ...note,
    value: note.value.toString(),
  };
}

/**
 * Convert StoredNote from localStorage to ShieldedNote
 */
export function storedToNote(stored: StoredNote): ShieldedNote {
  return {
    ...stored,
    value: BigInt(stored.value),
  };
}
