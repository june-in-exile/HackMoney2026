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

        console.log('[Worker] Starting note scan...');
        console.log('[Worker] Package ID:', request.packageId);
        console.log('[Worker] Master Public Key:', BigInt(request.masterPublicKey).toString(16).slice(0, 16) + '...');

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

        // Query ShieldEvents using GraphQL
        console.log('[Worker] Querying ShieldEvents...');
        const shieldQuery = await client.query({
          query: graphql(`
            query ShieldEvents($eventType: String!) {
              events(filter: { eventType: $eventType }) {
                nodes {
                  sendingModule {
                    package { address }
                  }
                  contents {
                    json
                  }
                  transactionBlock {
                    digest
                  }
                }
              }
            }
          `),
          variables: {
            eventType: `${request.packageId}::pool::ShieldEvent`,
          },
        });

        console.log('[Worker] ShieldEvents query result:', shieldQuery.data?.events?.nodes?.length || 0, 'events found');

        // Process Shield events
        let shieldEventsProcessed = 0;
        let shieldNotesDecrypted = 0;
        for (const node of shieldQuery.data?.events?.nodes || []) {
          shieldEventsProcessed++;
          const eventData = node.contents?.json as any;
          if (!eventData) continue; // Skip if no event data

          const encrypted_note = eventData.encrypted_note;
          const position = eventData.position;
          const commitment = eventData.commitment;

          // Try to decrypt
          const note = decryptNote(
            encrypted_note,
            BigInt(request.spendingKey),
            BigInt(request.masterPublicKey)
          );

          if (note) {
            shieldNotesDecrypted++;
            console.log('[Worker] Successfully decrypted ShieldEvent note at position:', position);
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
              txDigest: node.transactionBlock?.digest || "",
            });
          }

          // Collect all commitments for Merkle tree
          allCommitments.push({
            commitment: bytesToBigInt(commitment),
            leafIndex: Number(position),
          });
        }

        console.log('[Worker] ShieldEvents processed:', shieldEventsProcessed, '| Decrypted:', shieldNotesDecrypted);

        // Query TransferEvents using GraphQL
        console.log('[Worker] Querying TransferEvents...');
        const transferQuery = await client.query({
          query: graphql(`
            query TransferEvents($eventType: String!) {
              events(filter: { eventType: $eventType }) {
                nodes {
                  sendingModule {
                    package { address }
                  }
                  contents {
                    json
                  }
                  transactionBlock {
                    digest
                  }
                }
              }
            }
          `),
          variables: {
            eventType: `${request.packageId}::pool::TransferEvent`,
          },
        });

        console.log('[Worker] TransferEvents query result:', transferQuery.data?.events?.nodes?.length || 0, 'events found');

        // Process Transfer events
        let transferEventsProcessed = 0;
        let transferNotesDecrypted = 0;
        for (const node of transferQuery.data?.events?.nodes || []) {
          transferEventsProcessed++;
          const eventData = node.contents?.json as any;
          if (!eventData) continue; // Skip if no event data

          const encrypted_notes = eventData.encrypted_notes;
          const output_positions = eventData.output_positions;
          const output_commitments = eventData.output_commitments;

          for (let i = 0; i < encrypted_notes.length; i++) {
            const note = decryptNote(
              encrypted_notes[i],
              BigInt(request.spendingKey),
              BigInt(request.masterPublicKey)
            );

            if (note) {
              transferNotesDecrypted++;
              console.log('[Worker] Successfully decrypted TransferEvent note at position:', output_positions[i]);
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
                txDigest: node.transactionBlock?.digest || "",
              });
            }

            // Collect all commitments
            allCommitments.push({
              commitment: bytesToBigInt(output_commitments[i]),
              leafIndex: Number(output_positions[i]),
            });
          }
        }

        console.log('[Worker] TransferEvents processed:', transferEventsProcessed, '| Decrypted:', transferNotesDecrypted);
        console.log('[Worker] Total commitments collected:', allCommitments.length);
        console.log('[Worker] Total owned notes found:', ownedNotes.length);

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
 * Utility: Convert byte array to BigInt (little-endian as used by Move)
 */
function bytesToBigInt(bytes: number[]): bigint {
  let result = 0n;
  for (let i = 31; i >= 0; i--) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  const SCALAR_MODULUS = BigInt(
    "21888242871839275222246405745257275088548364400416034343698204186575808495617"
  );
  return result % SCALAR_MODULUS;
}
