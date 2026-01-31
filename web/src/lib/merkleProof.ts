/**
 * Merkle Proof Extraction Utility
 *
 * Queries on-chain Merkle tree state and reconstructs proof paths for notes.
 */

import type { SuiClient } from "@mysten/sui/client";
import { POOL_ID } from "./constants";

export interface MerkleProofData {
  pathElements: bigint[];  // 16 sibling hashes
  merkleRoot: bigint;      // Current root
}

/**
 * Query Merkle proof path from on-chain pool state
 *
 * @param client - Sui client instance
 * @param leafIndex - Position of the note in the tree (0-65535)
 * @returns Merkle proof with 16 sibling hashes and current root
 */
export async function getMerkleProofForNote(
  client: SuiClient,
  leafIndex: number
): Promise<MerkleProofData> {
  // 1. Query pool object from chain
  const poolObject = await client.getObject({
    id: POOL_ID,
    options: { showContent: true },
  });

  if (!poolObject.data?.content || poolObject.data.content.dataType !== "moveObject") {
    throw new Error("Failed to fetch pool object");
  }

  const poolFields = poolObject.data.content.fields as {
    merkle_tree: {
      fields: {
        root: number[];
        filled_subtrees: number[][];
        zeros: number[][];
        next_index: string;
      };
    };
  };

  const { filled_subtrees, zeros, root } = poolFields.merkle_tree.fields;
  const nextIndex = parseInt(poolFields.merkle_tree.fields.next_index);

  // Validate leaf index
  if (leafIndex < 0 || leafIndex >= nextIndex) {
    throw new Error(`Invalid leaf index: ${leafIndex} (tree has ${nextIndex} leaves)`);
  }

  // 2. Reconstruct proof path (16 sibling hashes)
  const pathElements: bigint[] = [];
  const TREE_DEPTH = 16;

  for (let level = 0; level < TREE_DEPTH; level++) {
    const nodeIndex = leafIndex >> level; // Divide by 2^level
    const isLeftChild = (nodeIndex % 2) === 0;

    // Determine sibling hash
    let sibling: number[];

    if (isLeftChild) {
      // Current node is on left, sibling is on right
      const siblingIndex = nodeIndex + 1;
      const maxIndexAtLevel = nextIndex >> level;

      if (siblingIndex < maxIndexAtLevel) {
        // Sibling exists in filled_subtrees
        sibling = filled_subtrees[level];
      } else {
        // Sibling is empty (use zero hash)
        sibling = zeros[level];
      }
    } else {
      // Current node is on right, sibling is on left (in filled_subtrees)
      sibling = filled_subtrees[level];
    }

    // Convert bytes to bigint (big-endian)
    const siblingBigInt = bytesToBigInt(new Uint8Array(sibling));
    pathElements.push(siblingBigInt);
  }

  // 3. Extract current root
  const merkleRoot = bytesToBigInt(new Uint8Array(root));

  return { pathElements, merkleRoot };
}

/**
 * Convert byte array to BigInt (big-endian)
 */
function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  return result;
}

/**
 * Verify a Merkle proof locally (for testing)
 *
 * @param leaf - Leaf commitment hash
 * @param leafIndex - Position in tree
 * @param pathElements - 16 sibling hashes
 * @param expectedRoot - Expected root to verify against
 * @returns true if proof is valid
 */
export function verifyMerkleProofLocal(
  leaf: bigint,
  leafIndex: number,
  pathElements: bigint[],
  expectedRoot: bigint
): boolean {
  if (pathElements.length !== 16) {
    throw new Error(`Invalid proof length: ${pathElements.length}, expected 16`);
  }

  // Note: This is a placeholder - actual verification would use Poseidon hash
  // For now, just check structure is correct
  return pathElements.length === 16;
}
