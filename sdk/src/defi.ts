/**
 * Octopus SDK - DeFi Operations (Private Swaps)
 *
 * Provides functionality for private token swaps through external DEXs.
 */

import * as snarkjs from "snarkjs";
import { poseidonHash } from "./crypto.js";
import {
  type Note,
  type OctopusKeypair,
  MERKLE_TREE_DEPTH,
} from "./types.js";

// Lazy-loaded Node.js modules (only used in Node.js environment)
let fs: any;
let path: any;
let url: any;

/** Check if running in Node.js environment */
function isNodeEnvironment(): boolean {
  return typeof process !== 'undefined' &&
         process.versions != null &&
         process.versions.node != null;
}

/**
 * Swap transaction parameters
 */
export interface SwapParams {
  /** Input token type (e.g., SUI) */
  tokenIn: bigint;
  /** Output token type (e.g., USDC) */
  tokenOut: bigint;
  /** Exact amount to swap */
  amountIn: bigint;
  /** Minimum output amount (slippage protection) */
  minAmountOut: bigint;
  /** DEX pool identifier hash */
  dexPoolId: bigint;
  /** Slippage tolerance in basis points (e.g., 50 = 0.5%) */
  slippageBps: number;
}

/**
 * Input for generating a swap proof
 */
export interface SwapInput {
  /** Sender's keypair */
  keypair: OctopusKeypair;
  /** Input notes to spend (same token type as tokenIn) */
  inputNotes: Note[];
  /** Leaf indices for input notes */
  inputLeafIndices: number[];
  /** Merkle proof paths for input notes */
  inputPathElements: bigint[][];
  /** Swap parameters */
  swapParams: SwapParams;
  /** Output note recipient's NPK */
  outputNPK: bigint;
  /** Random blinding factor for output note */
  outputRandom: bigint;
  /** Expected output amount from DEX */
  outputValue: bigint;
  /** Change note recipient's NPK (usually sender's own NPK) */
  changeNPK: bigint;
  /** Random blinding factor for change note */
  changeRandom: bigint;
  /** Change amount (excess input) */
  changeValue: bigint;
}

/**
 * Circuit input for swap proof generation
 */
export interface SwapCircuitInput {
  // Private inputs - Keypair
  spending_key: string;
  nullifying_key: string;

  // Private inputs - Input notes
  input_npks: string[];
  input_values: string[];
  input_randoms: string[];
  input_leaf_indices: string[];
  input_path_elements: string[][];

  // Private inputs - Swap parameters
  token_in: string;
  token_out: string;
  amount_in: string;
  min_amount_out: string;
  dex_pool_id: string;

  // Private inputs - Output note
  output_npk: string;
  output_value: string;
  output_random: string;

  // Private inputs - Change note
  change_npk: string;
  change_value: string;
  change_random: string;

  // Public inputs
  merkle_root: string;
  input_nullifiers: string[];
  output_commitment: string;
  change_commitment: string;
  swap_data_hash: string;
}

/**
 * Swap proof in Sui-compatible format
 */
export interface SuiSwapProof {
  /** Proof points (128 bytes: A || B || C) */
  proofBytes: Uint8Array;
  /** Public inputs (192 bytes: root || nullifiers[2] || output_commitment || change_commitment || swap_data_hash) */
  publicInputsBytes: Uint8Array;
}

/**
 * Build circuit input for swap proof
 */
export function buildSwapInput(swapInput: SwapInput): SwapCircuitInput {
  const {
    keypair,
    inputNotes,
    inputLeafIndices,
    inputPathElements,
    swapParams,
    outputNPK,
    outputRandom,
    outputValue,
    changeNPK,
    changeRandom,
    changeValue,
  } = swapInput;

  // Ensure we have exactly 2 input notes (pad with dummy if needed)
  const notes = [...inputNotes];
  const leafIndices = [...inputLeafIndices];
  const pathElements = [...inputPathElements];

  while (notes.length < 2) {
    // Create dummy note with zero value
    const dummyNote: Note = {
      npk: 0n,
      token: swapParams.tokenIn,
      value: 0n,
      random: 0n,
      commitment: poseidonHash([0n, swapParams.tokenIn, 0n]),
    };
    notes.push(dummyNote);
    leafIndices.push(0);
    pathElements.push(new Array(MERKLE_TREE_DEPTH).fill(0n));
  }

  // Verify path elements length
  if (pathElements[0].length !== MERKLE_TREE_DEPTH) {
    throw new Error(
      `Invalid path elements length: ${pathElements[0].length}, expected ${MERKLE_TREE_DEPTH}`
    );
  }

  // Compute nullifiers for input notes
  const nullifier1 = poseidonHash([keypair.nullifyingKey, BigInt(leafIndices[0])]);
  const nullifier2 = poseidonHash([keypair.nullifyingKey, BigInt(leafIndices[1])]);

  // Compute output commitment = Poseidon(NPK, token_out, output_value)
  const outputCommitment = poseidonHash([outputNPK, swapParams.tokenOut, outputValue]);

  // Compute change commitment = Poseidon(NPK, token_in, change_value)
  const changeCommitment = poseidonHash([changeNPK, swapParams.tokenIn, changeValue]);

  // Compute swap data hash = Poseidon(token_in, token_out, amount_in, min_amount_out, dex_pool_id)
  const swapDataHash = poseidonHash([
    swapParams.tokenIn,
    swapParams.tokenOut,
    swapParams.amountIn,
    swapParams.minAmountOut,
    swapParams.dexPoolId,
  ]);

  // Compute Merkle root from first input note
  let root = notes[0].commitment;
  const indices0 = BigInt(leafIndices[0]);
  for (let i = 0; i < MERKLE_TREE_DEPTH; i++) {
    const sibling = pathElements[0][i];
    // Check if index bit is 0 or 1
    const isLeft = (indices0 >> BigInt(i)) & 1n;
    if (isLeft === 0n) {
      root = poseidonHash([root, sibling]);
    } else {
      root = poseidonHash([sibling, root]);
    }
  }

  return {
    // Private inputs - Keypair
    spending_key: keypair.spendingKey.toString(),
    nullifying_key: keypair.nullifyingKey.toString(),

    // Private inputs - Input notes
    input_npks: notes.map(n => n.npk.toString()),
    input_values: notes.map(n => n.value.toString()),
    input_randoms: notes.map(n => n.random.toString()),
    input_leaf_indices: leafIndices.map(i => i.toString()),
    input_path_elements: pathElements.map(path =>
      path.map(element => element.toString())
    ),

    // Private inputs - Swap parameters
    token_in: swapParams.tokenIn.toString(),
    token_out: swapParams.tokenOut.toString(),
    amount_in: swapParams.amountIn.toString(),
    min_amount_out: swapParams.minAmountOut.toString(),
    dex_pool_id: swapParams.dexPoolId.toString(),

    // Private inputs - Output note
    output_npk: outputNPK.toString(),
    output_value: outputValue.toString(),
    output_random: outputRandom.toString(),

    // Private inputs - Change note
    change_npk: changeNPK.toString(),
    change_value: changeValue.toString(),
    change_random: changeRandom.toString(),

    // Public inputs
    merkle_root: root.toString(),
    input_nullifiers: [nullifier1.toString(), nullifier2.toString()],
    output_commitment: outputCommitment.toString(),
    change_commitment: changeCommitment.toString(),
    swap_data_hash: swapDataHash.toString(),
  };
}

/**
 * Get default paths to swap circuit artifacts
 */
function getSwapCircuitPaths() {
  if (isNodeEnvironment()) {
    // Node.js: Load from filesystem
    if (!fs) {
      fs = require('fs');
      path = require('path');
      url = require('url');
    }

    const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

    return {
      wasmPath: path.resolve(__dirname, "../../circuits/build/swap_js/swap.wasm"),
      zkeyPath: path.resolve(__dirname, "../../circuits/build/swap_final.zkey"),
    };
  } else {
    // Browser: Load from public directory via fetch
    return {
      wasmPath: "/circuits/swap_js/swap.wasm",
      zkeyPath: "/circuits/swap_final.zkey",
    };
  }
}

/**
 * Generate a swap proof using the swap circuit
 */
export async function generateSwapProof(
  swapInput: SwapInput,
  config?: { wasmPath?: string; zkeyPath?: string }
): Promise<SuiSwapProof> {
  const paths = getSwapCircuitPaths();
  const wasmPath = config?.wasmPath ?? paths.wasmPath;
  const zkeyPath = config?.zkeyPath ?? paths.zkeyPath;

  // Build circuit input
  const circuitInput = buildSwapInput(swapInput);

  console.log("Generating swap proof...");
  console.log("Circuit input:", {
    merkle_root: circuitInput.merkle_root,
    input_nullifiers: circuitInput.input_nullifiers,
    output_commitment: circuitInput.output_commitment,
    change_commitment: circuitInput.change_commitment,
    swap_data_hash: circuitInput.swap_data_hash,
  });

  // Generate proof using snarkjs
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput as any,
    wasmPath,
    zkeyPath
  );

  console.log("Proof generated successfully");
  console.log("Public signals:", publicSignals);

  // Convert proof to Sui format (128 bytes: A || B || C)
  const proofBytes = new Uint8Array(128);

  // A (G1 point - 64 bytes)
  const aX = BigInt(proof.pi_a[0]);
  const aY = BigInt(proof.pi_a[1]);

  // B (G2 point - not directly used in Sui, but kept for compatibility)
  // We only use the first coordinate for compressed format

  // C (G1 point - 64 bytes)
  const cX = BigInt(proof.pi_c[0]);
  const cY = BigInt(proof.pi_c[1]);

  // Write A.x, A.y, C.x, C.y as 32-byte big-endian values
  writeBigInt(proofBytes, 0, aX);
  writeBigInt(proofBytes, 32, aY);
  writeBigInt(proofBytes, 64, cX);
  writeBigInt(proofBytes, 96, cY);

  // Convert public inputs to bytes (192 bytes: 6 field elements × 32 bytes)
  // Order: merkle_root, nullifier1, nullifier2, output_commitment, change_commitment, swap_data_hash
  const publicInputsBytes = new Uint8Array(192);
  for (let i = 0; i < 6; i++) {
    writeBigInt(publicInputsBytes, i * 32, BigInt(publicSignals[i]));
  }

  return {
    proofBytes,
    publicInputsBytes,
  };
}

/**
 * Calculate minimum output amount with slippage protection
 */
export function calculateMinAmountOut(
  expectedOutput: bigint,
  slippageBps: number
): bigint {
  return (expectedOutput * BigInt(10000 - slippageBps)) / 10000n;
}

/**
 * Estimate swap output (placeholder - requires DEX integration)
 *
 * TODO: Implement actual DEX price fetching
 * - Query Cetus pool state
 * - Calculate output using CLMM math
 * - Account for price impact
 */
export async function estimateSwapOutput(
  dexPoolId: string,
  tokenIn: bigint,
  tokenOut: bigint,
  amountIn: bigint
): Promise<{ amountOut: bigint; priceImpact: number }> {
  // Placeholder implementation (1:1 ratio for testing)
  console.warn("Using mock swap estimation (1:1 ratio). Implement real DEX integration.");

  return {
    amountOut: amountIn, // 1:1 ratio
    priceImpact: 0, // No price impact in mock
  };
}

/**
 * Helper: Write bigint to Uint8Array as big-endian 32-byte value
 */
function writeBigInt(arr: Uint8Array, offset: number, value: bigint) {
  const hex = value.toString(16).padStart(64, '0');
  for (let i = 0; i < 32; i++) {
    arr[offset + i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
}
