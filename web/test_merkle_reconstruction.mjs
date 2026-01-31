/**
 * Test Merkle tree reconstruction
 */

import { SuiClient } from '@mysten/sui/client';
import { buildMerkleProof, computeRootFromCommitments, fetchAllCommitments } from './src/lib/merkleTree.ts';

const PACKAGE_ID = "0xb2ab082080abf37b3e0a1130db3f656eba53c7aa6e847ae3f9d1d5112248a080";
const POOL_ID = "0x032f9f9fb7f79afe60ceb9bd22e31b5cbbc06f6c68c1608bd677886efc1f23d3";
const RPC_URL = "https://fullnode.testnet.sui.io:443";

async function main() {
  const client = new SuiClient({ url: RPC_URL });

  console.log("=== Testing Merkle Tree Reconstruction ===\n");

  // 1. Fetch on-chain root
  const poolObject = await client.getObject({
    id: POOL_ID,
    options: { showContent: true },
  });

  const poolFields = poolObject.data.content.fields;
  const onChainRootBytes = poolFields.merkle_tree.fields.root;

  // Convert to hex
  const onChainRootHex = "0x" + onChainRootBytes.map(b => b.toString(16).padStart(2, "0")).join("");
  console.log("On-chain root:", onChainRootHex);

  // 2. Fetch all commitments and rebuild tree
  console.log("\n=== Fetching commitments ===");
  const commitments = await fetchAllCommitments(client, PACKAGE_ID);
  console.log("Total commitments:", commitments.length);

  for (let i = 0; i < commitments.length; i++) {
    console.log(`  [${i}]:`, "0x" + commitments[i].toString(16).padStart(64, "0"));
  }

  // 3. Compute root from commitments
  console.log("\n=== Computing root from commitments ===");
  const computedRoot = computeRootFromCommitments(commitments);
  const computedRootHex = "0x" + computedRoot.toString(16).padStart(64, "0");
  console.log("Computed root:", computedRootHex);

  // 4. Compare
  console.log("\n=== Comparison ===");
  console.log("On-chain:  ", onChainRootHex);
  console.log("Computed:  ", computedRootHex);
  console.log("Match:     ", onChainRootHex === computedRootHex ? "✅ YES" : "❌ NO");

  // 5. Test proof generation
  if (commitments.length > 0) {
    console.log("\n=== Testing Proof Generation ===");
    for (let i = 0; i < commitments.length; i++) {
      try {
        const proof = buildMerkleProof(commitments, i);
        console.log(`Proof for leaf ${i}: ${proof.length} path elements ✓`);
      } catch (err) {
        console.log(`Proof for leaf ${i}: ERROR -`, err.message);
      }
    }
  }
}

main().catch(console.error);
