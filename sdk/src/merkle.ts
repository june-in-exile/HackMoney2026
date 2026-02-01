/**
 * Merkle Tree Client-Side Reconstruction
 *
 * Rebuilds the Merkle tree from on-chain events to generate proofs
 * for spending notes.
 */

import { SuiClient } from "@mysten/sui/client";
import { poseidonHash, computeZeroHashes } from "./crypto.js";
import { MERKLE_TREE_DEPTH } from "./types.js";

/**
 * Commitment with its tree position
 */
export interface CommitmentLeaf {
  /** The commitment value */
  commitment: bigint;
  /** Position in the Merkle tree */
  leafIndex: number;
  /** Transaction digest where this commitment was added */
  txDigest: string;
}

/**
 * Client-side Merkle tree for generating proofs
 */
export class ClientMerkleTree {
  private leaves: Map<number, bigint>; // leafIndex -> commitment
  private zeros: bigint[];
  private depth: number;

  constructor(depth: number = MERKLE_TREE_DEPTH) {
    this.leaves = new Map();
    this.zeros = computeZeroHashes();
    this.depth = depth;
  }

  /**
   * Insert a commitment at a specific index
   */
  insert(leafIndex: number, commitment: bigint): void {
    this.leaves.set(leafIndex, commitment);
  }

  /**
   * Generate Merkle proof for a leaf at the given index
   *
   * @param leafIndex - Position of the leaf in the tree
   * @returns Array of 16 sibling hashes (path elements)
   */
  getMerkleProof(leafIndex: number): bigint[] {
    const commitment = this.leaves.get(leafIndex);
    if (!commitment) {
      throw new Error(`No leaf found at index ${leafIndex}`);
    }

    const pathElements: bigint[] = [];
    let currentIndex = leafIndex;

    for (let level = 0; level < this.depth; level++) {
      const isLeft = currentIndex % 2 === 0;
      const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1;

      // Get sibling hash
      let sibling: bigint;
      if (this.leaves.has(siblingIndex)) {
        // Sibling exists in the tree
        const siblingCommitment = this.leaves.get(siblingIndex)!;

        // If we're not at level 0, we need to compute the hash up to this level
        if (level === 0) {
          sibling = siblingCommitment;
        } else {
          // Compute the hash of the sibling subtree
          sibling = this.computeSubtreeHash(siblingIndex, level);
        }
      } else {
        // Sibling doesn't exist, use zero hash
        sibling = this.zeros[level];
      }

      pathElements.push(sibling);
      currentIndex = Math.floor(currentIndex / 2);
    }

    return pathElements;
  }

  /**
   * Compute the root hash of the tree
   */
  getRoot(): bigint {
    if (this.leaves.size === 0) {
      return this.zeros[this.depth];
    }

    // Find the maximum leaf index
    const maxIndex = Math.max(...this.leaves.keys());

    // Compute root by hashing from leaves to root
    return this.computeSubtreeHash(0, this.depth, 0, maxIndex + 1);
  }

  /**
   * Compute hash of a subtree
   *
   * @param nodeIndex - Index of the node at the given level
   * @param level - Current level (0 = leaf level, depth = root level)
   * @param rangeStart - Start of leaf range covered by this subtree
   * @param rangeEnd - End of leaf range (exclusive)
   */
  private computeSubtreeHash(
    nodeIndex: number,
    level: number,
    rangeStart: number = nodeIndex * (1 << level),
    rangeEnd: number = (nodeIndex + 1) * (1 << level)
  ): bigint {
    if (level === 0) {
      // Leaf level
      return this.leaves.get(nodeIndex) || this.zeros[0];
    }

    // Compute left and right children
    const leftIndex = nodeIndex * 2;
    const rightIndex = nodeIndex * 2 + 1;
    const midPoint = rangeStart + (rangeEnd - rangeStart) / 2;

    const leftHash = this.computeSubtreeHash(
      leftIndex,
      level - 1,
      rangeStart,
      midPoint
    );
    const rightHash = this.computeSubtreeHash(
      rightIndex,
      level - 1,
      midPoint,
      rangeEnd
    );

    return poseidonHash([leftHash, rightHash]);
  }

  /**
   * Get number of leaves in the tree
   */
  get size(): number {
    return this.leaves.size;
  }
}

/**
 * Fetch all commitments from on-chain events and build a Merkle tree
 *
 * @param client - Sui client instance
 * @param packageId - Railgun package ID
 * @returns Client-side Merkle tree with all commitments
 */
export async function buildMerkleTreeFromEvents(
  client: SuiClient,
  packageId: string
): Promise<ClientMerkleTree> {
  const tree = new ClientMerkleTree();
  const commitments: CommitmentLeaf[] = [];

  // 1. Query ShieldEvents
  const shieldEvents = await client.queryEvents({
    query: {
      MoveEventType: `${packageId}::pool::ShieldEvent`,
    },
  });

  for (const event of shieldEvents.data) {
    const { position, commitment } = event.parsedJson as {
      position: string;
      commitment: string;
    };

    commitments.push({
      commitment: BigInt(commitment),
      leafIndex: Number(position),
      txDigest: event.id.txDigest,
    });
  }

  // 2. Query TransferEvents (for output commitments)
  const transferEvents = await client.queryEvents({
    query: {
      MoveEventType: `${packageId}::pool::TransferEvent`,
    },
  });

  for (const event of transferEvents.data) {
    const { output_positions, output_commitments } = event.parsedJson as {
      output_positions: string[];
      output_commitments: string[];
    };

    for (let i = 0; i < output_commitments.length; i++) {
      commitments.push({
        commitment: BigInt(output_commitments[i]),
        leafIndex: Number(output_positions[i]),
        txDigest: event.id.txDigest,
      });
    }
  }

  // 3. Sort by leaf index and insert into tree
  commitments.sort((a, b) => a.leafIndex - b.leafIndex);

  for (const leaf of commitments) {
    tree.insert(leaf.leafIndex, leaf.commitment);
  }

  return tree;
}

/**
 * Get Merkle proof for a specific note
 *
 * @param client - Sui client instance
 * @param packageId - Railgun package ID
 * @param leafIndex - Position of the note in the tree
 * @returns Merkle proof (16 sibling hashes)
 */
export async function getMerkleProofForNote(
  client: SuiClient,
  packageId: string,
  leafIndex: number
): Promise<bigint[]> {
  const tree = await buildMerkleTreeFromEvents(client, packageId);
  return tree.getMerkleProof(leafIndex);
}
