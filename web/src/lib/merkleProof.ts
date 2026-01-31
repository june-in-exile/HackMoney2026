/**
 * Merkle Proof Extraction Utility
 *
 * Queries on-chain Merkle tree state and reconstructs proof paths for notes.
 */

import type { SuiClient } from "@mysten/sui/client";
import { fetchAllCommitments, buildMerkleProof, computeRootFromCommitments } from "./merkleTree";
import { PACKAGE_ID } from "./constants";

export interface MerkleProofData {
  pathElements: bigint[];  // 16 sibling hashes
  merkleRoot: bigint;      // Current root
}

/**
 * Query Merkle proof path by rebuilding tree from Shield events
 *
 * @param client - Sui client instance
 * @param leafIndex - Position of the note in the tree (0-65535)
 * @returns Merkle proof with 16 sibling hashes and current root
 */
export async function getMerkleProofForNote(
  client: SuiClient,
  leafIndex: number
): Promise<MerkleProofData> {
  // 1. Fetch all commitments from Shield events
  const commitments = await fetchAllCommitments(client, PACKAGE_ID);

  // Validate leaf index
  if (leafIndex < 0 || leafIndex >= commitments.length) {
    throw new Error(`Invalid leaf index: ${leafIndex} (tree has ${commitments.length} leaves)`);
  }

  // 2. Build Merkle proof from commitments
  const pathElements = buildMerkleProof(commitments, leafIndex);

  // 3. Compute current root
  const merkleRoot = computeRootFromCommitments(commitments);

  console.log("Merkle proof generated:");
  console.log("- Commitments:", commitments.length);
  console.log("- Leaf index:", leafIndex);
  console.log("- Root:", "0x" + merkleRoot.toString(16).padStart(64, "0"));

  return { pathElements, merkleRoot };
}

