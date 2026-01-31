/**
 * Diagnostic script to debug unshield Merkle root mismatch
 * Run with: node diagnose_unshield.mjs
 */

import { SuiClient } from '@mysten/sui/client';

const POOL_ID = "0x032f9f9fb7f79afe60ceb9bd22e31b5cbbc06f6c68c1608bd677886efc1f23d3";
const RPC_URL = "https://fullnode.testnet.sui.io:443";

async function main() {
  const client = new SuiClient({ url: RPC_URL });

  // 1. Fetch pool state
  console.log("=== Fetching Pool State ===");
  const poolObject = await client.getObject({
    id: POOL_ID,
    options: { showContent: true },
  });

  if (!poolObject.data?.content || poolObject.data.content.dataType !== "moveObject") {
    throw new Error("Failed to fetch pool object");
  }

  const poolFields = poolObject.data.content.fields;
  const merkleTreeFields = poolFields.merkle_tree.fields;

  console.log("Pool ID:", POOL_ID);
  console.log("Note count:", merkleTreeFields.next_index);

  // Convert root bytes to hex
  const rootBytes = merkleTreeFields.root;
  const rootHex = "0x" + rootBytes.map(b => b.toString(16).padStart(2, "0")).join("");
  console.log("Current root:", rootHex);
  console.log("Root bytes:", JSON.stringify(rootBytes));

  // 2. Fetch Shield events
  console.log("\n=== Fetching Shield Events ===");
  const events = await client.queryEvents({
    query: {
      MoveEventType: `0xb2ab082080abf37b3e0a1130db3f656eba53c7aa6e847ae3f9d1d5112248a080::pool::ShieldEvent`,
    },
  });

  console.log(`Found ${events.data.length} shield events`);

  for (const event of events.data) {
    const eventData = event.parsedJson;
    const commitmentHex = "0x" + eventData.commitment.map(b => b.toString(16).padStart(2, "0")).join("");

    console.log(`\nEvent at position ${eventData.position}:`);
    console.log("  Commitment:", commitmentHex);
    console.log("  TX:", event.id.txDigest);
  }

  // 3. Display Merkle tree state
  console.log("\n=== Merkle Tree State ===");
  console.log("filled_subtrees length:", merkleTreeFields.filled_subtrees.length);
  for (let i = 0; i < merkleTreeFields.filled_subtrees.length; i++) {
    const subtree = merkleTreeFields.filled_subtrees[i];
    const hex = "0x" + subtree.map(b => b.toString(16).padStart(2, "0")).join("");
    console.log(`  Level ${i}:`, hex);
  }

  console.log("\nzeros length:", merkleTreeFields.zeros.length);
  for (let i = 0; i < Math.min(3, merkleTreeFields.zeros.length); i++) {
    const zero = merkleTreeFields.zeros[i];
    const hex = "0x" + zero.map(b => b.toString(16).padStart(2, "0")).join("");
    console.log(`  Level ${i}:`, hex);
  }
}

main().catch(console.error);
