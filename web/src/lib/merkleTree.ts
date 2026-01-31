/**
 * Local Merkle tree reconstruction for proof generation
 *
 * This rebuilds the tree from Shield events to generate accurate proofs
 */

import type { SuiClient } from "@mysten/sui/client";
import { poseidonHash, initPoseidon } from "@octopus/sdk";

const TREE_DEPTH = 16;

// Ensure Poseidon is initialized
let poseidonInitialized = false;
async function ensurePoseidonInit() {
  if (!poseidonInitialized) {
    await initPoseidon();
    poseidonInitialized = true;
  }
}

/**
 * Fetch all commitments from Shield events
 */
export async function fetchAllCommitments(client: SuiClient, packageId: string): Promise<bigint[]> {
  await ensurePoseidonInit();

  const events = await client.queryEvents({
    query: {
      MoveEventType: `${packageId}::pool::ShieldEvent`,
    },
  });

  // Sort by position to ensure correct order
  const sortedEvents = events.data.sort((a, b) => {
    const posA = parseInt((a.parsedJson as any).position);
    const posB = parseInt((b.parsedJson as any).position);
    return posA - posB;
  });

  const commitments: bigint[] = [];
  for (const event of sortedEvents) {
    const eventData = event.parsedJson as {
      position: string;
      commitment: number[];
      encrypted_note: number[];
    };

    // Convert commitment bytes to BigInt (big-endian)
    let commitment = 0n;
    for (const byte of eventData.commitment) {
      commitment = (commitment << 8n) | BigInt(byte);
    }
    commitments.push(commitment);
  }

  return commitments;
}

/**
 * Compute zero hashes for empty nodes
 */
function computeZeroHashes(): bigint[] {
  const zeros: bigint[] = new Array(TREE_DEPTH + 1);
  zeros[0] = 0n; // Empty leaf

  for (let i = 1; i <= TREE_DEPTH; i++) {
    zeros[i] = poseidonHash([zeros[i - 1], zeros[i - 1]]);
  }

  return zeros;
}

/**
 * Build Merkle proof for a leaf at given position
 *
 * @param commitments - All commitments in insertion order
 * @param leafIndex - Position of the leaf to prove
 * @returns Merkle proof path elements (16 sibling hashes)
 */
export function buildMerkleProof(
  commitments: bigint[],
  leafIndex: number
): bigint[] {
  if (leafIndex >= commitments.length) {
    throw new Error(`Leaf index ${leafIndex} out of range (max: ${commitments.length - 1})`);
  }

  const zeros = computeZeroHashes();
  const pathElements: bigint[] = [];

  // Build the tree level by level
  let currentLevel = commitments.slice(); // Copy commitments array

  for (let level = 0; level < TREE_DEPTH; level++) {
    const nodeIndex = leafIndex >> level; // Index at this level
    const isLeftChild = (nodeIndex % 2) === 0;

    let sibling: bigint;

    if (isLeftChild) {
      // Current node is on left, need right sibling
      const siblingIndex = nodeIndex + 1;
      if (siblingIndex < currentLevel.length) {
        sibling = currentLevel[siblingIndex];
      } else {
        sibling = zeros[level];
      }
    } else {
      // Current node is on right, need left sibling
      sibling = currentLevel[nodeIndex - 1];
    }

    pathElements.push(sibling);

    // Build next level
    const nextLevel: bigint[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : zeros[level];
      nextLevel.push(poseidonHash([left, right]));
    }

    currentLevel = nextLevel;
  }

  return pathElements;
}

/**
 * Compute Merkle root from commitments
 */
export function computeRootFromCommitments(commitments: bigint[]): bigint {
  if (commitments.length === 0) {
    return computeZeroHashes()[TREE_DEPTH];
  }

  const zeros = computeZeroHashes();
  let currentLevel = commitments.slice();

  for (let level = 0; level < TREE_DEPTH; level++) {
    const nextLevel: bigint[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : zeros[level];
      nextLevel.push(poseidonHash([left, right]));
    }
    currentLevel = nextLevel;
  }

  return currentLevel[0];
}
