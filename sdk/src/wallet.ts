/**
 * Railgun on Sui - Wallet Utilities
 *
 * Note selection and UTXO management for private transfers.
 */

import type { Note, RailgunKeypair } from "./types.js";
import { createNote } from "./crypto.js";

/**
 * Note with metadata for selection
 */
export interface SelectableNote {
  note: Note;
  leafIndex: number;
  pathElements?: bigint[];
}

/**
 * Select optimal notes to cover transfer amount.
 *
 * Strategy:
 * 1. Try to find a single note >= amount (minimize inputs)
 * 2. If not found, try two notes (minimize total value to reduce change)
 * 3. If still not enough, throw error
 *
 * @param availableNotes - List of unspent notes owned by user
 * @param amount - Amount to transfer
 * @returns Selected notes (1 or 2)
 */
export function selectNotesForTransfer(
  availableNotes: SelectableNote[],
  amount: bigint
): SelectableNote[] {
  // Filter notes with non-zero value
  const validNotes = availableNotes.filter((n) => n.note.value > 0n);

  if (validNotes.length === 0) {
    throw new Error("No notes available");
  }

  if (amount <= 0n) {
    throw new Error("Transfer amount must be greater than 0");
  }

  // Strategy 1: Try single note (most efficient)
  const singleNote = validNotes.find((n) => n.note.value >= amount);
  if (singleNote) {
    return [singleNote];
  }

  // Strategy 2: Try two notes (minimize total value to reduce change)
  // Sort by value ascending
  const sorted = [...validNotes].sort((a, b) => {
    if (a.note.value < b.note.value) return -1;
    if (a.note.value > b.note.value) return 1;
    return 0;
  });

  // Find the smallest pair that covers the amount
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const total = sorted[i].note.value + sorted[j].note.value;
      if (total >= amount) {
        return [sorted[i], sorted[j]];
      }
    }
  }

  // Calculate total available balance
  const totalBalance = validNotes.reduce((sum, n) => sum + n.note.value, 0n);

  throw new Error(
    `Insufficient balance for transfer. Required: ${amount}, Available: ${totalBalance}`
  );
}

/**
 * Create output notes for transfer (recipient + change).
 *
 * @param recipientMpk - Recipient's master public key
 * @param senderMpk - Sender's master public key (for change note)
 * @param amount - Amount to send to recipient
 * @param inputTotal - Total value of input notes
 * @param token - Token type identifier
 * @returns Array of 2 output notes [recipient, change]
 */
export function createTransferOutputs(
  recipientMpk: bigint,
  senderMpk: bigint,
  amount: bigint,
  inputTotal: bigint,
  token: bigint
): [Note, Note] {
  if (amount > inputTotal) {
    throw new Error(
      `Amount (${amount}) exceeds input total (${inputTotal})`
    );
  }

  // Recipient note
  const recipientNote = createNote(recipientMpk, token, amount);

  // Change note (back to sender)
  const changeAmount = inputTotal - amount;
  const changeNote = createNote(senderMpk, token, changeAmount);

  return [recipientNote, changeNote];
}

/**
 * Validate transfer parameters before proof generation
 */
export function validateTransferParams(
  recipientMpk: bigint,
  amount: bigint,
  selectedNotes: SelectableNote[],
  token: bigint
): void {
  // Check recipient MPK is valid (non-zero)
  if (recipientMpk === 0n) {
    throw new Error("Invalid recipient MPK: cannot be zero");
  }

  // Check amount is positive
  if (amount <= 0n) {
    throw new Error("Transfer amount must be greater than 0");
  }

  // Check we have 1 or 2 notes
  if (selectedNotes.length < 1 || selectedNotes.length > 2) {
    throw new Error(`Invalid number of selected notes: ${selectedNotes.length}`);
  }

  // Check all notes have same token type
  for (const selectable of selectedNotes) {
    if (selectable.note.token !== token) {
      throw new Error(
        `Note token mismatch. Expected: ${token}, got: ${selectable.note.token}`
      );
    }
  }

  // Check total input value covers amount
  const inputTotal = selectedNotes.reduce((sum, n) => sum + n.note.value, 0n);
  if (inputTotal < amount) {
    throw new Error(
      `Insufficient input value. Required: ${amount}, Available: ${inputTotal}`
    );
  }

  // Check all notes have path elements (required for proof generation)
  for (let i = 0; i < selectedNotes.length; i++) {
    if (!selectedNotes[i].pathElements || selectedNotes[i].pathElements!.length === 0) {
      throw new Error(`Note ${i} missing Merkle path elements`);
    }
  }
}

/**
 * Build transfer input from selected notes and recipient info.
 * Convenience function that combines selection, validation, and output creation.
 *
 * @param keypair - Sender's keypair
 * @param selectedNotes - Selected input notes (1 or 2)
 * @param recipientMpk - Recipient's master public key
 * @param amount - Amount to transfer
 * @param token - Token type
 * @returns TransferInput ready for proof generation
 */
export function buildTransferFromSelection(
  keypair: RailgunKeypair,
  selectedNotes: SelectableNote[],
  recipientMpk: bigint,
  amount: bigint,
  token: bigint
): {
  inputNotes: Note[];
  inputLeafIndices: number[];
  inputPathElements: bigint[][];
  outputNotes: Note[];
} {
  // Validate
  validateTransferParams(recipientMpk, amount, selectedNotes, token);

  // Calculate input total
  const inputTotal = selectedNotes.reduce((sum, n) => sum + n.note.value, 0n);

  // Create output notes
  const [recipientNote, changeNote] = createTransferOutputs(
    recipientMpk,
    keypair.masterPublicKey,
    amount,
    inputTotal,
    token
  );

  return {
    inputNotes: selectedNotes.map((s) => s.note),
    inputLeafIndices: selectedNotes.map((s) => s.leafIndex),
    inputPathElements: selectedNotes.map((s) => s.pathElements!),
    outputNotes: [recipientNote, changeNote],
  };
}
