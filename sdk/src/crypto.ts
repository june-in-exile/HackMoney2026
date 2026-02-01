/**
 * Railgun on Sui - Cryptographic Utilities
 *
 * Implements Poseidon hashing and key derivation following Railgun protocol.
 */

import { buildPoseidon, type Poseidon } from "circomlibjs";
import { x25519 } from "@noble/curves/ed25519.js";
import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
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
 * Derive X25519 viewing keypair from spending key
 *
 * This creates a separate keypair for encryption/decryption that is
 * deterministically derived from the spending key.
 */
function deriveViewingKeypair(spendingKey: bigint): {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
} {
  // Hash spending key to get viewing private key seed
  const seed = sha256(bigIntToBytes(spendingKey));

  // Ensure seed is a valid X25519 scalar by taking modulo
  // X25519 uses Curve25519 which has order 2^252 + ...
  const privateKey = new Uint8Array(32);
  privateKey.set(seed);

  // Clamp the private key as per X25519 spec
  privateKey[0] &= 248;
  privateKey[31] &= 127;
  privateKey[31] |= 64;

  const publicKey = x25519.getPublicKey(privateKey);

  return { privateKey, publicKey };
}

/**
 * Derive X25519 viewing public key from MPK
 *
 * Since MPK is derived from spending key, and viewing keypair is derived
 * from spending key, we need the actual spending key to get the viewing public key.
 * For encryption, sender must know recipient's viewing public key somehow.
 *
 * In practice, recipient shares their MPK, and we derive viewing PK from spending key.
 * This helper reconstructs the viewing public key from the MPK's source.
 */
export function deriveViewingPublicKey(spendingKey: bigint): Uint8Array {
  return deriveViewingKeypair(spendingKey).publicKey;
}

/**
 * TEMPORARY: Derive viewing public key from MPK (for MVP testing only)
 *
 * ⚠️ WARNING: This is NOT secure for production use!
 * This function deterministically derives a viewing public key from MPK.
 * The problem is that anyone with MPK can compute this public key, but only
 * the owner (with spending key) can derive the matching private key to decrypt.
 *
 * For production, recipients should explicitly share their viewing public key.
 * This function exists only to enable MVP testing without complex key sharing.
 *
 * @deprecated Use proper viewing public key sharing instead
 */
export function mpkToViewingPublicKeyUnsafe(mpk: bigint): Uint8Array {
  // Hash MPK to create a deterministic seed
  const seed = sha256(bigIntToBytes(mpk));

  // Treat seed as X25519 private scalar
  const privateKey = new Uint8Array(32);
  privateKey.set(seed);

  // Clamp to valid X25519 scalar
  privateKey[0] &= 248;
  privateKey[31] &= 127;
  privateKey[31] |= 64;

  return x25519.getPublicKey(privateKey);
}

/**
 * Encrypt note data for recipient using ECDH + ChaCha20-Poly1305
 *
 * Encryption scheme:
 * 1. Generate ephemeral X25519 keypair
 * 2. Compute shared secret via ECDH with recipient's viewing public key
 * 3. Derive encryption key using HKDF-SHA256
 * 4. Encrypt note data with ChaCha20-Poly1305
 * 5. Output: ephemeral_pk (32) || nonce (12) || ciphertext || tag (16)
 *
 * @param note - The note to encrypt
 * @param recipientViewingPk - Recipient's X25519 viewing public key (32 bytes)
 * @returns Encrypted note data
 */
export function encryptNote(
  note: Note,
  recipientViewingPk: Uint8Array
): Uint8Array {
  // 1. Generate ephemeral keypair
  const ephemeralSk = crypto.getRandomValues(new Uint8Array(32));
  // Clamp ephemeral key
  ephemeralSk[0] &= 248;
  ephemeralSk[31] &= 127;
  ephemeralSk[31] |= 64;
  const ephemeralPk = x25519.getPublicKey(ephemeralSk);

  // 2. Perform ECDH to get shared secret
  const sharedSecret = x25519.getSharedSecret(ephemeralSk, recipientViewingPk);

  // 3. Derive encryption key using HKDF
  const info = new TextEncoder().encode("octopus-note-encryption-v1");
  const encryptionKey = hkdf(sha256, sharedSecret, undefined, info, 32);

  // 4. Serialize note data (npk || token || value || random, each 32 bytes)
  const noteData = new Uint8Array(128);
  noteData.set(bigIntToBytes(note.npk), 0);
  noteData.set(bigIntToBytes(note.token), 32);
  noteData.set(bigIntToBytes(note.value), 64);
  noteData.set(bigIntToBytes(note.random), 96);

  // 5. Generate nonce (12 bytes for ChaCha20-Poly1305)
  const nonce = crypto.getRandomValues(new Uint8Array(12));

  // 6. Encrypt with ChaCha20-Poly1305
  const cipher = chacha20poly1305(encryptionKey, nonce);
  const ciphertext = cipher.encrypt(noteData);

  // 7. Combine: ephemeralPk || nonce || ciphertext (includes 16-byte tag)
  const output = new Uint8Array(32 + 12 + ciphertext.length);
  output.set(ephemeralPk, 0);
  output.set(nonce, 32);
  output.set(ciphertext, 44);

  return output;
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

/**
 * Decrypt and verify note ownership using ECDH + ChaCha20-Poly1305
 *
 * Decryption scheme:
 * 1. Extract ephemeral public key from encrypted data
 * 2. Compute shared secret via ECDH with our viewing private key
 * 3. Derive decryption key using HKDF-SHA256
 * 4. Decrypt with ChaCha20-Poly1305
 * 5. Verify note ownership by recomputing NPK
 *
 * @param encryptedData - Encrypted note (ephemeral_pk || nonce || ciphertext)
 * @param mySpendingKey - Our spending key (to derive viewing private key)
 * @param myMpk - Our master public key (to verify ownership)
 * @returns Decrypted note if we own it, null otherwise
 */
export function decryptNote(
  encryptedData: Uint8Array | number[],
  mySpendingKey: bigint,
  myMpk: bigint
): Note | null {
  try {
    // Convert to Uint8Array if needed
    const data =
      encryptedData instanceof Uint8Array
        ? encryptedData
        : new Uint8Array(encryptedData);

    // Format: ephemeral_pk (32) || nonce (12) || ciphertext (128 + 16 tag)
    if (data.length !== 32 + 12 + 128 + 16) {
      return null;
    }

    // 1. Extract components
    const ephemeralPk = data.slice(0, 32);
    const nonce = data.slice(32, 44);
    const ciphertext = data.slice(44);

    // 2. Derive our viewing private key
    const { privateKey: myViewingSk } = deriveViewingKeypair(mySpendingKey);

    // 3. Perform ECDH to get shared secret
    const sharedSecret = x25519.getSharedSecret(myViewingSk, ephemeralPk);

    // 4. Derive decryption key using HKDF
    const info = new TextEncoder().encode("octopus-note-encryption-v1");
    const decryptionKey = hkdf(sha256, sharedSecret, undefined, info, 32);

    // 5. Decrypt with ChaCha20-Poly1305
    const cipher = chacha20poly1305(decryptionKey, nonce);
    const noteData = cipher.decrypt(ciphertext);

    // 6. Parse decrypted data
    const npk = bytesToBigInt(noteData.slice(0, 32));
    const token = bytesToBigInt(noteData.slice(32, 64));
    const value = bytesToBigInt(noteData.slice(64, 96));
    const random = bytesToBigInt(noteData.slice(96, 128));

    // 7. Verify ownership by recomputing NPK
    // If this note belongs to us, NPK should equal Poseidon(myMpk, random)
    const expectedNpk = poseidonHash([myMpk, random]);
    if (expectedNpk !== npk) {
      return null; // Not our note
    }

    // 8. Recompute commitment to verify data integrity
    const commitment = poseidonHash([npk, token, value]);

    return {
      npk,
      token,
      value,
      random,
      commitment,
    };
  } catch (err) {
    // Decryption failed (wrong key, corrupted data, etc.)
    return null;
  }
}
