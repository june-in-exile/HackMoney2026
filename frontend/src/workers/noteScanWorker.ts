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
  bytesToBigIntLE_BN254,
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
      nsk: note.nsk.toString(),
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
   * MUST match Move contract logic (merkle_tree.move:compute_zeros)!
   *
   * zeros[0] = 0 (32 zero bytes, not a hash)
   * zeros[1] = Poseidon(0, 0)
   * zeros[i] = Poseidon(zeros[i-1], zeros[i-1]) for i = 2..depth
   *
   * Returns array of length depth + 1 (17 elements for depth 16)
   */
  private computeZeroHashes(): bigint[] {
    const zeros: bigint[] = [];

    // Level 0: empty leaf (32 zero bytes → 0)
    zeros[0] = 0n;

    // Compute hash for each level: zeros[1] to zeros[depth]
    for (let i = 1; i <= this.depth; i++) {
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

        // PHASE 2: Start with cached commitments from previous scan
        const allCommitments: Array<{
          commitment: bigint;
          leafIndex: number;
        }> = request.cachedCommitments
            ? request.cachedCommitments.map((c) => ({
              commitment: BigInt(c.commitment),
              leafIndex: c.leafIndex,
            }))
            : [];

        // ========================================================================
        // OPTIMIZATION 1: Parallel Query + Larger Page Size
        // Query Shield and Transfer events in parallel (50% faster)
        // ========================================================================
        const queryStart = Date.now();

        // Send initial progress
        postMessage({
          type: "progress",
          id: request.id,
          current: 0,
          total: 100,
          message: "Starting to scan blockchain events...",
        } as WorkerResponse);

        // Helper function to query events with pagination
        // PHASE 2: Now supports starting from a specific cursor for incremental scanning
        async function queryEvents(
          eventType: string,
          eventName: string,
          startCursor: string | null | undefined
        ): Promise<{ nodes: any[]; lastCursor: string | null }> {
          let allNodes: any[] = [];
          let hasNextPage = true;
          let cursor: string | null = startCursor || null;
          let pageCount = 0;

          while (hasNextPage) {
            pageCount++;
            const query: any = await withTimeout(
              client.query({
                query: graphql(`
                  query Events($eventType: String!, $first: Int, $after: String) {
                    events(first: $first, after: $after, filter: { type: $eventType }) {
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
                  eventType,
                  first: 50, // Maximum allowed by Sui GraphQL
                  after: cursor,
                },
              }),
              30000,
              `${eventName} GraphQL query`
            ).catch(err => {
              throw err;
            });

            const nodes = query.data?.events?.nodes || [];
            allNodes.push(...nodes);

            hasNextPage = query.data?.events?.pageInfo?.hasNextPage || false;
            cursor = query.data?.events?.pageInfo?.endCursor || null;

            // Safety limit: stop after 10 pages (500 events total)
            if (pageCount >= 10) {
              break;
            }
          }

          return { nodes: allNodes, lastCursor: cursor };
        }

        // PHASE 2 OPTIMIZATION: Parallel query of Shield and Transfer events with incremental support
        const [shieldResult, transferResult] = await Promise.all([
          queryEvents(
            `${request.packageId}::pool::ShieldEvent`,
            'ShieldEvents',
            request.startShieldCursor
          ),
          queryEvents(
            `${request.packageId}::pool::TransferEvent`,
            'TransferEvents',
            request.startTransferCursor
          ),
        ]);

        const allShieldNodes = shieldResult.nodes;
        const allTransferNodes = transferResult.nodes;
        const lastShieldCursor = shieldResult.lastCursor;
        const lastTransferCursor = transferResult.lastCursor;

        const queryTime = Date.now() - queryStart;

        // Progress: Query complete
        postMessage({
          type: "progress",
          id: request.id,
          current: 30,
          total: 100,
          message: `Found ${allShieldNodes.length + allTransferNodes.length} events, decrypting notes...`,
        } as WorkerResponse);

        const shieldQueryTime = queryTime; // For backward compatibility

        // ========================================================================
        // Process Shield events
        // ========================================================================
        const decryptStart = Date.now();
        let shieldNotesDecrypted = 0;
        let shieldNotesAttempted = 0;
        let shieldNotesSkippedNoData = 0;
        let shieldNotesSkippedWrongPool = 0;

        for (const node of allShieldNodes) {
          const eventData = node.contents?.json as any;
          if (!eventData) {
            shieldNotesSkippedNoData++;
            continue; // Skip if no event data
          }

          // Filter by pool_id - only process events from the target pool
          if (eventData.pool_id && eventData.pool_id !== request.poolId) {
            shieldNotesSkippedWrongPool++;
            continue; // Skip events from other pools
          }

          const encrypted_note = eventData.encrypted_note;
          const position = eventData.position;
          const commitment = eventData.commitment;

          shieldNotesAttempted++;

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
            // Decode commitment from Base64 (if string) and convert using LE + BN254 modulus
            const commitmentBytes = typeof commitment === 'string'
              ? Array.from(Buffer.from(commitment, 'base64'))
              : commitment;

            allCommitments.push({
              commitment: bytesToBigIntLE_BN254(commitmentBytes),
              leafIndex: Number(position),
            });
          } catch (err) {
            throw new Error(`Failed to parse commitment at position ${position}: ${err instanceof Error ? err.message : err}`);
          }
        }


        // Process Transfer events (already fetched in parallel above)
        let transferNotesDecrypted = 0;
        let transferNotesAttempted = 0;
        let transferNotesSkippedNoData = 0;
        let transferNotesSkippedWrongPool = 0;

        for (const node of allTransferNodes) {
          const eventData = node.contents?.json as any;
          if (!eventData) {
            transferNotesSkippedNoData++;
            continue; // Skip if no event data
          }

          // Filter by pool_id - only process events from the target pool
          if (eventData.pool_id && eventData.pool_id !== request.poolId) {
            transferNotesSkippedWrongPool++;
            continue; // Skip events from other pools
          }

          const encrypted_notes = eventData.encrypted_notes;
          const output_positions = eventData.output_positions;
          const output_commitments = eventData.output_commitments;

          for (let i = 0; i < encrypted_notes.length; i++) {
            transferNotesAttempted++;
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
              // Decode commitment from Base64 (if string) and convert using LE + BN254 modulus
              const commitmentBytes = typeof output_commitments[i] === 'string'
                ? Array.from(Buffer.from(output_commitments[i], 'base64'))
                : output_commitments[i];

              allCommitments.push({
                commitment: bytesToBigIntLE_BN254(commitmentBytes),
                leafIndex: Number(output_positions[i]),
              });
            } catch (err) {
              throw new Error(`Failed to parse transfer commitment at index ${i}: ${err instanceof Error ? err.message : err}`);
            }
          }
        }

        const decryptTime = Date.now() - decryptStart;

        // Progress: Decryption complete
        postMessage({
          type: "progress",
          id: request.id,
          current: 60,
          total: 100,
          message: `Decrypted ${ownedNotes.length} notes, building Merkle tree...`,
        } as WorkerResponse);

        // ========================================================================
        // Build Merkle tree
        // ========================================================================
        const merkleStart = Date.now();
        if (allCommitments.length > 0) {
          // Sort commitments by leafIndex to ensure proper insertion order
          allCommitments.sort((a, b) => a.leafIndex - b.leafIndex);

          const tree = new ClientMerkleTree();
          for (const { commitment, leafIndex } of allCommitments) {
            tree.insert(leafIndex, commitment);
          }

          const merkleRoot = tree.getRoot();

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

        // Progress: Complete
        postMessage({
          type: "progress",
          id: request.id,
          current: 100,
          total: 100,
          message: `Scan complete! Found ${ownedNotes.length} notes.`,
        } as WorkerResponse);

        // PHASE 2: Include cursors and all commitments for next incremental scan
        const response: WorkerResponse = {
          type: "scan_notes_result",
          id: request.id,
          notes: ownedNotes,
          lastShieldCursor,
          lastTransferCursor,
          allCommitments: allCommitments.map((c) => ({
            commitment: c.commitment.toString(),
            leafIndex: c.leafIndex,
          })),
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