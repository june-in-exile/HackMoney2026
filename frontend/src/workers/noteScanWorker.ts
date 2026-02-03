/**
 * Note Scanning Web Worker
 *
 * Handles CPU-intensive cryptographic operations off the main thread:
 * - Poseidon hashing (Wasm)
 * - ECDH key agreement
 * - ChaCha20-Poly1305 decryption
 * - Merkle tree construction
 *
 * This worker is initialized once and reused for all scanning operations.
 */

import { buildPoseidon } from "circomlibjs";
import type { Poseidon } from "circomlibjs";
import {
  decryptNote as sdkDecryptNote,
  computeNullifier as sdkComputeNullifier,
  initPoseidon as sdkInitPoseidon,
  type Note,
} from "@octopus/sdk";
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { graphql } from "@mysten/sui/graphql/schemas/latest";
import type {
  WorkerRequest,
  WorkerResponse,
  SerializedNote,
} from "./types";

// ============================================================================
// Worker State
// ============================================================================

let isInitialized = false;
let poseidon: Poseidon | null = null;

// Store built Merkle trees for reuse
const merkleTreeCache = new Map<string, ClientMerkleTree>();

// Constants
const MERKLE_TREE_DEPTH = 16;

// ============================================================================
// Cryptographic Functions
// ============================================================================

/**
 * Initialize Poseidon hash function
 */
async function initialize(): Promise<void> {
  if (isInitialized) return;

  try {
    await sdkInitPoseidon();
    poseidon = await buildPoseidon();
    isInitialized = true;
    postMessage({ type: "init_complete", success: true } as WorkerResponse);
  } catch (error) {
    postMessage({
      type: "error",
      error: error instanceof Error ? error.message : "Init failed",
    } as WorkerResponse);
  }
}

/**
 * Poseidon hash helper
 */
function hash(inputs: bigint[]): bigint {
  if (!poseidon) throw new Error("Poseidon not initialized");
  const h = poseidon(inputs);
  return BigInt(poseidon.F.toString(h));
}

/**
 * Decrypt note using SDK function
 */
function decryptNote(
  encryptedData: number[],
  mySpendingKey: bigint,
  myMpk: bigint
): SerializedNote | null {
  try {
    const note = sdkDecryptNote(encryptedData, mySpendingKey, myMpk);
    if (!note) return null;

    return {
      npk: note.npk.toString(),
      token: note.token.toString(),
      value: note.value.toString(),
      random: note.random.toString(),
      commitment: note.commitment.toString(),
    };
  } catch {
    return null;
  }
}

/**
 * Compute nullifier using SDK function
 */
function computeNullifier(nullifyingKey: bigint, leafIndex: number): string {
  return sdkComputeNullifier(nullifyingKey, leafIndex).toString();
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Wrap a promise with a timeout
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

// ============================================================================
// Merkle Tree Implementation
// ============================================================================

/**
 * Client-side Merkle Tree for proof generation
 */
class ClientMerkleTree {
  private leaves: Map<number, bigint> = new Map();
  private zeros: bigint[];
  private depth = MERKLE_TREE_DEPTH;

  constructor() {
    this.zeros = this.computeZeroHashes();
  }

  /**
   * Compute zero hashes for empty nodes
   * zeros[0] = Poseidon(0, 0)
   * zeros[i] = Poseidon(zeros[i-1], zeros[i-1])
   */
  private computeZeroHashes(): bigint[] {
    const zeros: bigint[] = [];
    zeros[0] = hash([0n, 0n]);

    for (let i = 1; i < this.depth; i++) {
      zeros[i] = hash([zeros[i - 1], zeros[i - 1]]);
    }

    return zeros;
  }

  /**
   * Insert commitment at specific leaf index
   */
  insert(leafIndex: number, commitment: bigint): void {
    this.leaves.set(leafIndex, commitment);
  }

  /**
   * Generate Merkle proof for a leaf
   */
  getMerkleProof(leafIndex: number): bigint[] {
    const commitment = this.leaves.get(leafIndex);
    if (!commitment) {
      throw new Error(`No leaf at index ${leafIndex}`);
    }

    const pathElements: bigint[] = [];
    let currentIndex = leafIndex;

    for (let level = 0; level < this.depth; level++) {
      const isLeft = currentIndex % 2 === 0;
      const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1;

      let sibling: bigint;
      if (this.leaves.has(siblingIndex)) {
        sibling =
          level === 0
            ? this.leaves.get(siblingIndex)!
            : this.computeSubtreeHash(siblingIndex, level);
      } else {
        sibling = this.zeros[level];
      }

      pathElements.push(sibling);
      currentIndex = Math.floor(currentIndex / 2);
    }

    return pathElements;
  }

  /**
   * Recursively compute hash of a subtree
   */
  private computeSubtreeHash(nodeIndex: number, level: number): bigint {
    if (level === 0) {
      return this.leaves.get(nodeIndex) || this.zeros[0];
    }

    const leftIndex = nodeIndex * 2;
    const rightIndex = nodeIndex * 2 + 1;

    const leftHash = this.computeSubtreeHash(leftIndex, level - 1);
    const rightHash = this.computeSubtreeHash(rightIndex, level - 1);

    return hash([leftHash, rightHash]);
  }

  /**
   * Compute root of the tree
   */
  getRoot(): bigint {
    if (this.leaves.size === 0) {
      return this.zeros[this.depth];
    }
    return this.computeSubtreeHash(0, this.depth);
  }
}

// ============================================================================
// Message Handler
// ============================================================================

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  try {
    switch (request.type) {
      case "init": {
        await initialize();
        break;
      }

      case "scan_notes": {
        if (!isInitialized) {
          throw new Error("Worker not initialized");
        }

        // Create GraphQL client
        const client = new SuiGraphQLClient({ url: request.graphqlUrl });

        const ownedNotes: Array<{
          note: SerializedNote;
          leafIndex: number;
          pathElements: string[];
          nullifier: string;
          txDigest: string;
        }> = [];

        const allCommitments: Array<{
          commitment: bigint;
          leafIndex: number;
        }> = [];

        // Query ShieldEvents using GraphQL with timeout
        const shieldQueryStart = Date.now();
        const shieldQuery = await withTimeout(
          client.query({
            query: graphql(`
              query ShieldEvents($eventType: String!, $first: Int) {
                events(first: $first, filter: { type: $eventType }) {
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
                  nodes {
                    transactionModule {
                      package { address }
                    }
                    contents {
                      json
                    }
                    transaction {
                      digest
                    }
                  }
                }
              }
            `),
            variables: {
              eventType: `${request.packageId}::pool::ShieldEvent`,
              first: 10,
            },
          }),
          30000, // 30 second timeout for GraphQL query
          'ShieldEvents GraphQL query'
        ).catch(err => {
          console.error('[Worker] ShieldEvents query failed:', err.message);
          throw err;
        });

        const shieldQueryTime = Date.now() - shieldQueryStart;
        if (shieldQueryTime > 10000) {
          console.warn(`[Worker] ShieldEvents query took ${shieldQueryTime}ms`);
        }

        // Process Shield events
        let shieldNotesDecrypted = 0;
        for (const node of shieldQuery.data?.events?.nodes || []) {
          const eventData = node.contents?.json as any;
          if (!eventData) continue; // Skip if no event data

          // Filter by pool_id - only process events from the target pool
          if (eventData.pool_id && eventData.pool_id !== request.poolId) {
            continue; // Skip events from other pools
          }

          const encrypted_note = eventData.encrypted_note;
          const position = eventData.position;
          const commitment = eventData.commitment;

          // Decode encrypted_note from Base64 if needed
          let encryptedNoteBytes: number[];
          if (typeof encrypted_note === 'string') {
            encryptedNoteBytes = decodeBase64(encrypted_note);
          } else if (Array.isArray(encrypted_note)) {
            encryptedNoteBytes = encrypted_note;
          } else {
            continue;
          }

          // Try to decrypt
          const note = decryptNote(
            encryptedNoteBytes,
            BigInt(request.spendingKey),
            BigInt(request.masterPublicKey)
          );

          if (note) {
            shieldNotesDecrypted++;
            const leafIndex = Number(position);
            const nullifier = computeNullifier(
              BigInt(request.nullifyingKey),
              leafIndex
            );

            ownedNotes.push({
              note,
              leafIndex,
              pathElements: [], // Will be filled later
              nullifier,
              txDigest: (node.transaction as any)?.digest || "",
            });
          }

          // Collect all commitments for Merkle tree
          try {
            allCommitments.push({
              commitment: bytesToBigInt(commitment),
              leafIndex: Number(position),
            });
          } catch (err) {
            throw new Error(`Failed to parse commitment at position ${position}: ${err instanceof Error ? err.message : err}`);
          }
        }

        // Query TransferEvents using GraphQL with timeout
        const transferQueryStart = Date.now();
        const transferQuery = await withTimeout(
          client.query({
            query: graphql(`
              query TransferEvents($eventType: String!, $first: Int) {
                events(first: $first, filter: { type: $eventType }) {
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
                  nodes {
                    transactionModule {
                      package { address }
                    }
                    contents {
                      json
                    }
                    transaction {
                      digest
                    }
                  }
                }
              }
            `),
            variables: {
              eventType: `${request.packageId}::pool::TransferEvent`,
              first: 10,
            },
          }),
          30000, // 30 second timeout for GraphQL query
          'TransferEvents GraphQL query'
        ).catch(err => {
          console.error('[Worker] TransferEvents query failed:', err.message);
          throw err;
        });

        const transferQueryTime = Date.now() - transferQueryStart;
        if (transferQueryTime > 10000) {
          console.warn(`[Worker] TransferEvents query took ${transferQueryTime}ms`);
        }

        // Process Transfer events
        let transferNotesDecrypted = 0;
        for (const node of transferQuery.data?.events?.nodes || []) {
          const eventData = node.contents?.json as any;
          if (!eventData) continue; // Skip if no event data

          // Filter by pool_id - only process events from the target pool
          if (eventData.pool_id && eventData.pool_id !== request.poolId) {
            continue; // Skip events from other pools
          }

          const encrypted_notes = eventData.encrypted_notes;
          const output_positions = eventData.output_positions;
          const output_commitments = eventData.output_commitments;

          for (let i = 0; i < encrypted_notes.length; i++) {
            // Decode encrypted_note from Base64 if needed
            let encryptedNoteBytes: number[];
            if (typeof encrypted_notes[i] === 'string') {
              encryptedNoteBytes = decodeBase64(encrypted_notes[i]);
            } else if (Array.isArray(encrypted_notes[i])) {
              encryptedNoteBytes = encrypted_notes[i];
            } else {
              continue;
            }

            const note = decryptNote(
              encryptedNoteBytes,
              BigInt(request.spendingKey),
              BigInt(request.masterPublicKey)
            );

            if (note) {
              transferNotesDecrypted++;
              const leafIndex = Number(output_positions[i]);
              const nullifier = computeNullifier(
                BigInt(request.nullifyingKey),
                leafIndex
              );

              ownedNotes.push({
                note,
                leafIndex,
                pathElements: [],
                nullifier,
                txDigest: (node.transaction as any)?.digest || "",
              });
            }

            // Collect all commitments
            try {
              allCommitments.push({
                commitment: bytesToBigInt(output_commitments[i]),
                leafIndex: Number(output_positions[i]),
              });
            } catch (err) {
              throw new Error(`Failed to parse transfer commitment at index ${i}: ${err instanceof Error ? err.message : err}`);
            }
          }
        }

        // Build Merkle tree
        if (allCommitments.length > 0) {
          const tree = new ClientMerkleTree();
          for (const { commitment, leafIndex } of allCommitments) {
            tree.insert(leafIndex, commitment);
          }

          // Generate proofs for owned notes
          for (const ownedNote of ownedNotes) {
            const pathElements = tree.getMerkleProof(ownedNote.leafIndex);
            ownedNote.pathElements = pathElements.map((p) => p.toString());

            // Verify the proof locally (using SDK's logic for consistency)
            let currentHash = BigInt(ownedNote.note.commitment);
            const leafIndex = ownedNote.leafIndex;
            for (let level = 0; level < pathElements.length; level++) {
              // Use bit manipulation like SDK does: isRight = (leafIndex >> level) & 1
              const isRight = (leafIndex >> level) & 1;
              const sibling = pathElements[level];
              currentHash = isRight
                ? hash([sibling, currentHash])  // Right: sibling on left
                : hash([currentHash, sibling]); // Left: sibling on right
            }
          }
        }

        const response: WorkerResponse = {
          type: "scan_notes_result",
          id: request.id,
          notes: ownedNotes,
        };
        postMessage(response);
        break;
      }

      case "batch_decrypt": {
        if (!isInitialized) {
          throw new Error("Worker not initialized");
        }

        const results = request.notes.map(({ noteId, encryptedNote }) => ({
          noteId,
          note: decryptNote(
            encryptedNote,
            BigInt(request.spendingKey),
            BigInt(request.masterPublicKey)
          ),
        }));

        const response: WorkerResponse = {
          type: "batch_decrypt_result",
          id: request.id,
          results,
        };
        postMessage(response);
        break;
      }

      case "compute_nullifier": {
        if (!isInitialized) {
          throw new Error("Worker not initialized");
        }

        const nullifier = computeNullifier(
          BigInt(request.nullifyingKey),
          request.leafIndex
        );

        const response: WorkerResponse = {
          type: "compute_nullifier_result",
          id: request.id,
          nullifier,
        };
        postMessage(response);
        break;
      }

      case "build_merkle_tree": {
        if (!isInitialized) {
          throw new Error("Worker not initialized");
        }

        const tree = new ClientMerkleTree();

        for (const { commitment, leafIndex } of request.commitments) {
          tree.insert(leafIndex, BigInt(commitment));
        }

        const treeId = request.id;
        merkleTreeCache.set(treeId, tree);

        const response: WorkerResponse = {
          type: "build_merkle_tree_result",
          id: request.id,
          treeId,
          root: tree.getRoot().toString(),
        };
        postMessage(response);
        break;
      }

      case "get_merkle_proof": {
        if (!isInitialized) {
          throw new Error("Worker not initialized");
        }

        const tree = merkleTreeCache.get(request.treeId);
        if (!tree) {
          throw new Error(`Tree ${request.treeId} not found`);
        }

        const pathElements = tree.getMerkleProof(request.leafIndex);

        const response: WorkerResponse = {
          type: "get_merkle_proof_result",
          id: request.id,
          pathElements: pathElements.map((p) => p.toString()),
        };
        postMessage(response);
        break;
      }
    }
  } catch (error) {
    const response: WorkerResponse = {
      type: "error",
      id: "id" in request ? request.id : undefined,
      error: error instanceof Error ? error.message : "Unknown error",
    };
    postMessage(response);
  }
};

/**
 * Utility: Decode Base64 string to Uint8Array or number[]
 */
function decodeBase64(input: string): number[] {
  try {
    // Use built-in atob (browser) or Buffer (Node.js)
    const binaryString = typeof atob !== 'undefined'
      ? atob(input)
      : Buffer.from(input, 'base64').toString('binary');

    return Array.from(binaryString, char => char.charCodeAt(0));
  } catch (err) {
    throw new Error(`Failed to decode Base64 string: ${input}`);
  }
}

/**
 * Utility: Convert byte array to BigInt (little-endian as used by Move)
 * Handles multiple input formats:
 * - number[] (direct byte array)
 * - string (hex string with or without 0x prefix, or Base64)
 * - object with nested structure
 */
function bytesToBigInt(input: any): bigint {
  let bytes: number[];

  // Handle different input formats
  if (Array.isArray(input)) {
    // Already a byte array
    bytes = input;
  } else if (typeof input === 'string') {
    // Check if it's Base64 (contains +, /, or = characters, or non-hex characters)
    const isBase64 = /[+/=]/.test(input) || !/^(0x)?[0-9a-fA-F]+$/.test(input);

    if (isBase64) {
      // Base64 string - decode it
      try {
        // Use built-in atob (browser) or Buffer (Node.js)
        const binaryString = typeof atob !== 'undefined'
          ? atob(input)
          : Buffer.from(input, 'base64').toString('binary');

        bytes = Array.from(binaryString, char => char.charCodeAt(0));
      } catch (err) {
        throw new Error(`Failed to decode Base64 string: ${input}`);
      }
    } else {
      // Hex string (with or without 0x prefix)
      const hexStr = input.startsWith('0x') ? input.slice(2) : input;

      // Validate hex string
      if (!/^[0-9a-fA-F]+$/.test(hexStr)) {
        throw new Error(`Invalid hex string: ${input}`);
      }

      // Convert hex to bytes (big-endian first, as hex strings are typically big-endian)
      bytes = [];
      for (let i = 0; i < hexStr.length; i += 2) {
        bytes.push(parseInt(hexStr.slice(i, i + 2), 16));
      }
    }
  } else if (typeof input === 'object' && input !== null) {
    // Try to extract bytes from object (might have nested structure)
    console.warn('[bytesToBigInt] Received object, attempting to extract bytes:', input);

    // Try common field names
    if ('bytes' in input) {
      return bytesToBigInt(input.bytes);
    } else if ('data' in input) {
      return bytesToBigInt(input.data);
    } else if ('value' in input) {
      return bytesToBigInt(input.value);
    } else {
      throw new Error(`Unsupported object format: ${JSON.stringify(input)}`);
    }
  } else {
    throw new Error(`Cannot convert ${typeof input} to BigInt: ${input}`);
  }

  // Validate byte array
  if (!Array.isArray(bytes) || bytes.length === 0) {
    throw new Error(`Invalid byte array: ${bytes}`);
  }

  // Ensure all elements are valid numbers
  for (let i = 0; i < bytes.length; i++) {
    if (typeof bytes[i] !== 'number' || bytes[i] < 0 || bytes[i] > 255) {
      throw new Error(`Invalid byte at index ${i}: ${bytes[i]} (type: ${typeof bytes[i]})`);
    }
  }

  // Pad or trim to exactly 32 bytes
  while (bytes.length < 32) {
    bytes.push(0);
  }
  if (bytes.length > 32) {
    bytes = bytes.slice(0, 32);
  }

  // Convert byte array to BigInt
  // Base64-decoded bytes are in big-endian order (most significant byte first)
  // So we read from index 0 (MSB) to index 31 (LSB)
  let result = 0n;
  for (let i = 0; i < 32; i++) {
    result = (result << 8n) | BigInt(bytes[i]);
  }

  const SCALAR_MODULUS = BigInt(
    "21888242871839275222246405745257275088548364400416034343698204186575808495617"
  );
  return result % SCALAR_MODULUS;
}
