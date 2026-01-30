/**
 * Railgun on Sui - Cryptographic Utilities
 *
 * Implements Poseidon hashing and key derivation following Railgun protocol.
 */

import { buildPoseidon, type Poseidon } from "circomlibjs";
import {
  SCALAR_MODULUS,
  MERKLE_TREE_DEPTH,
  type RailgunKeypair,
  type Note,
} from "./types.js";

let poseidonInstance: Poseidon | null = null;

/**
 * Initialize the Poseidon hash function (async, call once at startup)
 */
export async function initPoseidon(): Promise<void> {
  if (!poseidonInstance) {
    poseidonInstance = await buildPoseidon();
  }
}

/**
 * Get the initialized Poseidon instance
 */
function getPoseidon(): Poseidon {
  if (!poseidonInstance) {
    throw new Error("Poseidon not initialized. Call initPoseidon() first.");
  }
  return poseidonInstance;
}

/**
 * Compute Poseidon hash of inputs
 */
export function poseidonHash(inputs: bigint[]): bigint {
  const poseidon = getPoseidon();
  const hash = poseidon(inputs);
  return BigInt(poseidon.F.toString(hash));
}

/**
 * Generate a random field element
 */
export function randomFieldElement(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let value = BigInt(0);
  for (let i = 0; i < 32; i++) {
    value = (value << 8n) | BigInt(bytes[i]);
  }
  return value % SCALAR_MODULUS;
}

/**
 * Derive a Railgun keypair from a master spending key
 *
 * Following Railgun formula:
 * - nullifyingKey = spending_key (simplified for MVP)
 * - MPK = Poseidon(spendingKey, nullifyingKey)
 */
export function deriveKeypair(spendingKey: bigint): RailgunKeypair {
  // In production, nullifyingKey would be derived differently
  // For MVP, we use a hash of spending key
  const nullifyingKey = poseidonHash([spendingKey, 1n]);
  const masterPublicKey = poseidonHash([spendingKey, nullifyingKey]);

  return {
    spendingKey,
    nullifyingKey,
    masterPublicKey,
  };
}

/**
 * Generate a new random keypair
 */
export function generateKeypair(): RailgunKeypair {
  return deriveKeypair(randomFieldElement());
}

/**
 * Create a new note (UTXO)
 *
 * Following Railgun formula:
 * - NPK = Poseidon(MPK, random)
 * - commitment = Poseidon(NPK, token, value)
 */
export function createNote(
  recipientMpk: bigint,
  token: bigint,
  value: bigint,
  random?: bigint
): Note {
  const r = random ?? randomFieldElement();
  const npk = poseidonHash([recipientMpk, r]);
  const commitment = poseidonHash([npk, token, value]);

  return {
    npk,
    token,
    value,
    random: r,
    commitment,
  };
}

/**
 * Compute nullifier for a note
 *
 * Railgun formula: nullifier = Poseidon(nullifyingKey, leafIndex)
 */
export function computeNullifier(
  nullifyingKey: bigint,
  leafIndex: number
): bigint {
  return poseidonHash([nullifyingKey, BigInt(leafIndex)]);
}

/**
 * Compute zero hashes for empty Merkle tree nodes
 * zeros[0] = Poseidon(0, 0)
 * zeros[i] = Poseidon(zeros[i-1], zeros[i-1])
 */
export function computeZeroHashes(): bigint[] {
  const zeros: bigint[] = [];
  zeros[0] = poseidonHash([0n, 0n]);

  for (let i = 1; i < MERKLE_TREE_DEPTH; i++) {
    zeros[i] = poseidonHash([zeros[i - 1], zeros[i - 1]]);
  }

  return zeros;
}

/**
 * Compute Merkle root from a commitment and its proof path
 */
export function computeMerkleRoot(
  commitment: bigint,
  pathElements: bigint[],
  pathIndices: number
): bigint {
  let current = commitment;

  for (let i = 0; i < pathElements.length; i++) {
    const isRight = (pathIndices >> i) & 1;
    if (isRight) {
      current = poseidonHash([pathElements[i], current]);
    } else {
      current = poseidonHash([current, pathElements[i]]);
    }
  }

  return current;
}

/**
 * Build a Merkle proof for a single-leaf tree (for testing/demo)
 * When the tree has only one leaf at index 0, all siblings are zero hashes
 */
export function buildSingleLeafProof(commitment: bigint): {
  pathElements: bigint[];
  root: bigint;
} {
  const zeros = computeZeroHashes();
  const pathElements = zeros.slice(0, MERKLE_TREE_DEPTH);

  // Compute root: leaf is always on left at each level
  let current = commitment;
  for (let i = 0; i < MERKLE_TREE_DEPTH; i++) {
    current = poseidonHash([current, pathElements[i]]);
  }

  return {
    pathElements,
    root: current,
  };
}

/**
 * Encrypt note data for recipient (simplified XOR encryption for demo)
 * In production, use proper ECIES encryption with recipient's public key
 */
export function encryptNote(note: Note, recipientMpk: bigint): Uint8Array {
  // Simple encoding: npk || token || value || random (32 bytes each)
  const data = new Uint8Array(128);
  const view = new DataView(data.buffer);

  // For demo, just encode the values directly (not secure!)
  // In production, encrypt with recipient's viewing key
  const values = [note.npk, note.token, note.value, note.random];
  let offset = 0;

  for (const val of values) {
    const bytes = bigIntToBytes(val);
    data.set(bytes, offset);
    offset += 32;
  }

  return data;
}

/**
 * Convert BigInt to 32-byte big-endian Uint8Array
 */
export function bigIntToBytes(n: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  let val = n;
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(val & 0xffn);
    val >>= 8n;
  }
  return bytes;
}

/**
 * Convert 32-byte Uint8Array to BigInt (big-endian)
 */
export function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  return result;
}
