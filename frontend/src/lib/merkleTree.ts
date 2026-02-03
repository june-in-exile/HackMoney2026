/**
 * Local Merkle tree reconstruction for proof generation
 *
 * This rebuilds the tree from Shield events to generate accurate proofs
 */

import type { SuiClient } from "@mysten/sui/client";
import { poseidonHash } from "@octopus/sdk";
import { initPoseidon } from "@/lib/poseidon";

const TREE_DEPTH = 16;

/**
 * Fetch all commitments from Shield events
 */
export async function fetchAllCommitments(client: SuiClient, packageId: string): Promise<bigint[]> {
  await initPoseidon();

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
 * Build Merkle proof from on-chain incremental tree state
 * This matches the Move contract's incremental Merkle tree logic
 */
export function buildProofFromOnChainState(
  leafIndex: number,
  filledSubtreesRaw: any[],
  zerosRaw: any[]
): bigint[] {
  const pathElements: bigint[] = [];

  // Convert filled_subtrees from raw format to bigint[]
  const filledSubtrees: bigint[] = filledSubtreesRaw.map(subtree => {
    if (Array.isArray(subtree)) {
      return bytesToBigInt(subtree);
    } else if (typeof subtree === 'object') {
      const bytes = Object.values(subtree as object).map(v => Number(v));
      return bytesToBigInt(bytes);
    }
    return 0n;
  });

  // Convert zeros from raw format to bigint[]
  const zeros: bigint[] = zerosRaw.map(zero => {
    if (Array.isArray(zero)) {
      return bytesToBigInt(zero);
    } else if (typeof zero === 'object') {
      const bytes = Object.values(zero as object).map(v => Number(v));
      return bytesToBigInt(bytes);
    }
    return 0n;
  });

  // Build proof using incremental tree logic (matching Move contract)
  let currentIndex = leafIndex;
  for (let level = 0; level < TREE_DEPTH; level++) {
    const isLeft = currentIndex % 2 === 0;

    if (isLeft) {
      // Left child: sibling is zero hash
      pathElements.push(zeros[level] || 0n);
    } else {
      // Right child: sibling is filled subtree at this level
      pathElements.push(filledSubtrees[level] || 0n);
    }

    currentIndex = Math.floor(currentIndex / 2);
  }

  return pathElements;
}

/**
 * Convert byte array to BigInt (big-endian)
 */
function bytesToBigInt(bytes: number[]): bigint {
  let result = 0n;
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}