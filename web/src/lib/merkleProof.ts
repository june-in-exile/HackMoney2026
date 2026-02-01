/**
 * Merkle Proof Extraction Utility
 *
 * Queries on-chain Merkle tree state and reconstructs proof paths for notes.
 */

import type { SuiClient } from "@mysten/sui/client";
import { fetchAllCommitments, buildMerkleProof, computeRootFromCommitments, buildProofFromOnChainState } from "./merkleTree";
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
 * @param poolId - Pool object ID to fetch on-chain root
 * @returns Merkle proof with 16 sibling hashes and current root
 */
export async function getMerkleProofForNote(
  client: SuiClient,
  leafIndex: number,
  poolId?: string
): Promise<MerkleProofData> {
  // 1. Fetch all commitments from Shield events
  const commitments = await fetchAllCommitments(client, PACKAGE_ID);

  console.log("=== Commitment Debug ===");
  console.log("Total commitments from events:", commitments.length);
  commitments.forEach((c, i) => {
    console.log(`  [${i}]: 0x${c.toString(16).padStart(64, '0')}`);
  });

  // Validate leaf index
  if (leafIndex < 0 || leafIndex >= commitments.length) {
    throw new Error(`Invalid leaf index: ${leafIndex} (tree has ${commitments.length} leaves)`);
  }

  // 2. Build Merkle proof from commitments OR use on-chain filled_subtrees
  let pathElements: bigint[];

  if (poolId) {
    // Get filled_subtrees from on-chain pool for accurate proofs
    const poolObj = await client.getObject({
      id: poolId,
      options: { showContent: true },
    });

    if (poolObj.data?.content && poolObj.data.content.dataType === "moveObject") {
      const fields = poolObj.data.content.fields as Record<string, unknown>;
      const merkleTree = fields.merkle_tree as Record<string, unknown>;
      const merkleTreeFields = merkleTree.fields as Record<string, unknown>;

      // Get filled_subtrees and zeros from on-chain state
      const filledSubtreesRaw = merkleTreeFields.filled_subtrees as any[];
      const zerosRaw = merkleTreeFields.zeros as any[];

      console.log("=== Using On-Chain Merkle Tree State ===");
      console.log("Filled subtrees count:", filledSubtreesRaw?.length || 0);
      console.log("Zeros count:", zerosRaw?.length || 0);

      // Build path elements using on-chain incremental tree logic
      pathElements = buildProofFromOnChainState(leafIndex, filledSubtreesRaw, zerosRaw);
    } else {
      // Fallback to local reconstruction
      pathElements = buildMerkleProof(commitments, leafIndex);
    }
  } else {
    pathElements = buildMerkleProof(commitments, leafIndex);
  }

  console.log("Path elements for leaf", leafIndex);
  pathElements.forEach((p, i) => {
    console.log(`  Level ${i}: 0x${p.toString(16).padStart(64, '0')}`);
  });

  // 3. Get merkle root from on-chain pool (preferred) or compute locally (fallback)
  let merkleRoot: bigint;

  if (poolId) {
    // CORRECT: Fetch on-chain root from pool object (like swap tests do)
    const poolObj = await client.getObject({
      id: poolId,
      options: { showContent: true },
    });

    if (!poolObj.data?.content || poolObj.data.content.dataType !== "moveObject") {
      throw new Error("Failed to fetch pool state");
    }

    const fields = poolObj.data.content.fields as Record<string, unknown>;

    // Access merkle_tree.fields.root (Sui wraps objects in a fields layer)
    const merkleTree = fields.merkle_tree as Record<string, unknown>;
    const merkleTreeFields = merkleTree.fields as Record<string, unknown>;
    const nextIndex = Number(merkleTreeFields.next_index || 0);
    const rootData = merkleTreeFields.root;

    console.log(`=== On-Chain Tree State ===`);
    console.log(`Next index (total commitments): ${nextIndex}`);
    console.log(`Event commitments count: ${commitments.length}`);

    if (nextIndex !== commitments.length) {
      console.warn(`⚠️  MISMATCH: On-chain has ${nextIndex} commitments, but events have ${commitments.length}`);
    }

    if (!rootData) {
      throw new Error(`merkleTree.fields.root is missing. Available keys: ${Object.keys(merkleTreeFields || {}).join(', ')}`);
    }

    // Handle both array and object formats (Sui returns arrays as objects sometimes)
    let rootBytes: number[];
    if (Array.isArray(rootData)) {
      rootBytes = rootData;
    } else if (typeof rootData === 'object' && rootData !== null) {
      // Convert object with numeric keys to array: {0: 1, 1: 2, ...} -> [1, 2, ...]
      rootBytes = Object.values(rootData as object).map(v => Number(v));
    } else if (typeof rootData === 'string') {
      // Handle hex string format
      const hex = rootData.startsWith('0x') ? rootData.slice(2) : rootData;
      rootBytes = [];
      for (let i = 0; i < hex.length; i += 2) {
        rootBytes.push(parseInt(hex.slice(i, i + 2), 16));
      }
    } else {
      throw new Error(`Unexpected root format: ${typeof rootData}`);
    }

    // Validate root length (should be 32 bytes)
    if (rootBytes.length !== 32) {
      console.warn(`Warning: Root has ${rootBytes.length} bytes, expected 32`);
    }

    // Convert bytes to BigInt (big-endian)
    merkleRoot = 0n;
    for (const byte of rootBytes) {
      merkleRoot = (merkleRoot << 8n) | BigInt(byte);
    }

    console.log("✅ Using on-chain merkle root from pool");
    console.log(`   Root bytes (first 8): [${rootBytes.slice(0, 8).join(', ')}...]`);
  } else {
    // DEPRECATED: Compute root locally (may be out of sync)
    merkleRoot = computeRootFromCommitments(commitments);
    console.log("⚠️  Using locally computed root (may be out of sync)");
  }

  console.log("Merkle proof generated:");
  console.log("- Commitments:", commitments.length);
  console.log("- Leaf index:", leafIndex);
  console.log("- Root:", "0x" + merkleRoot.toString(16).padStart(64, "0"));

  return { pathElements, merkleRoot };
}

