/**
 * Debug utility for diagnosing Merkle root mismatch issues
 */

import type { SuiClient } from "@mysten/sui/client";
import { POOL_ID } from "./constants";
import { computeMerkleRoot } from "@octopus/sdk";
import { getMerkleProofForNote } from "./merkleProof";

/**
 * Debug Merkle root computation for a given note
 * Compares on-chain root with locally computed root
 */
export async function debugMerkleRoot(
  client: SuiClient,
  commitment: bigint,
  leafIndex: number
): Promise<{
  onChainRoot: string;
  computedRoot: string;
  match: boolean;
  pathElements: bigint[];
}> {
  // 1. Fetch Merkle proof from on-chain
  const merkleProofData = await getMerkleProofForNote(client, leafIndex);

  // 2. Compute root off-chain using same path elements
  const computedRoot = computeMerkleRoot(
    commitment,
    merkleProofData.pathElements,
    leafIndex
  );

  // 3. Compare
  const match = merkleProofData.merkleRoot === computedRoot;

  const result = {
    onChainRoot: "0x" + merkleProofData.merkleRoot.toString(16).padStart(64, "0"),
    computedRoot: "0x" + computedRoot.toString(16).padStart(64, "0"),
    match,
    pathElements: merkleProofData.pathElements,
  };

  console.log("=== Merkle Root Debug ===");
  console.log("Commitment:", "0x" + commitment.toString(16).padStart(64, "0"));
  console.log("Leaf Index:", leafIndex);
  console.log("On-Chain Root:", result.onChainRoot);
  console.log("Computed Root:", result.computedRoot);
  console.log("Match:", match ? "✅" : "❌");
  console.log("Path Elements:", merkleProofData.pathElements.map(p =>
    "0x" + p.toString(16).padStart(64, "0")
  ));

  return result;
}

/**
 * Fetch and display current pool state
 */
export async function debugPoolState(client: SuiClient): Promise<void> {
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

  const { root, next_index } = poolFields.merkle_tree.fields;

  // Convert root bytes to hex
  const rootHex = "0x" + root.map(b => b.toString(16).padStart(2, "0")).join("");

  console.log("=== Pool State ===");
  console.log("Pool ID:", POOL_ID);
  console.log("Current Root:", rootHex);
  console.log("Note Count:", next_index);
}
