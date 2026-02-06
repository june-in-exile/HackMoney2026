/**
 * Octopus SDK - ZK Proof Generation
 *
 * Generates Groth16 proofs for unshield operations using snarkjs.
 */

import * as snarkjs from "snarkjs";
import {
  type UnshieldInput,
  type UnshieldCircuitInput,
  type SuiUnshieldProof,
  type TransferInput,
  type TransferCircuitInput,
  type SuiTransferProof,
  type SwapInput,
  type SwapCircuitInput,
  type SuiSwapProof,
  type Note,
  MERKLE_TREE_DEPTH,
} from "./types.js";
import {
  computeNullifier,
  computeMerkleRoot,
  poseidonHash,
  randomFieldElement,
  encryptNote,
} from "./crypto.js";
import {
  serializeProof,
  serializePublicInputs,
} from "./utils/proof-compression.js";

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

/** Load file in Node.js environment */
async function loadFileNode(filePath: string): Promise<Buffer> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return fs.readFileSync(filePath);
}

/** Load file in browser environment via fetch */
async function loadFileBrowser(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return await response.arrayBuffer();
}

/**
 * Prover configuration
 */
export interface ProverConfig {
  wasmPath?: string;
  zkeyPath?: string;
  vkPath?: string;
}

// ============ Unshield Proof Functions ============

/** Get default paths to unshield circuit artifacts */
function getUnshieldCircuitPaths() {
  if (isNodeEnvironment()) {
    // Node.js: Load from filesystem
    if (!fs) {
      fs = require('fs');
      path = require('path');
      url = require('url');
    }

    const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

    return {
      wasmPath: path.resolve(__dirname, "../../circuits/build/unshield_js/unshield.wasm"),
      zkeyPath: path.resolve(__dirname, "../../circuits/build/unshield_final.zkey"),
      vkPath: path.resolve(__dirname, "../../circuits/build/unshield_vk.json"),
    };
  } else {
    // Browser: Load from public directory via fetch
    return {
      wasmPath: "/circuits/unshield_js/unshield.wasm",
      zkeyPath: "/circuits/unshield_final.zkey",
      vkPath: "/circuits/unshield_vk.json",
    };
  }
}

/**
 * Build circuit input for unshield proof with change support
 */
export function buildUnshieldInput(unshieldInput: UnshieldInput): { circuitInput: UnshieldCircuitInput; changeNote: Note | null; changeRandom: bigint } {
  const { note, leafIndex, pathElements, keypair, unshieldAmount } = unshieldInput;

  // Verify path elements length
  if (pathElements.length !== MERKLE_TREE_DEPTH) {
    throw new Error(
      `Invalid path elements length: ${pathElements.length}, expected ${MERKLE_TREE_DEPTH}`
    );
  }

  // Verify unshield amount is valid
  if (unshieldAmount <= 0n) {
    throw new Error(`Unshield amount must be positive, got: ${unshieldAmount}`);
  }
  if (unshieldAmount > note.value) {
    throw new Error(
      `Unshield amount (${unshieldAmount}) exceeds note value (${note.value})`
    );
  }

  // Compute MPK (master public key) - needed for change note
  const mpk = poseidonHash([keypair.spendingKey, keypair.nullifyingKey]);

  // Calculate change amount
  const changeValue = note.value - unshieldAmount;

  // Generate random for change note
  const changeRandom = randomFieldElement();

  // Compute change NSK and commitment
  const changeNpk = poseidonHash([mpk, changeRandom]);
  const changeCommitment = changeValue > 0n
    ? poseidonHash([changeNpk, note.token, changeValue])
    : 0n;

  // Create change note object (if any)
  const changeNote = changeValue > 0n ? {
    nsk: changeNpk,
    token: note.token,
    value: changeValue,
    random: changeRandom,
    commitment: changeCommitment,
  } : null;

  const circuitInput: UnshieldCircuitInput = {
    // Private inputs (matching new circuit field names)
    spending_key: keypair.spendingKey.toString(),
    nullifying_key: keypair.nullifyingKey.toString(),
    random: note.random.toString(),              // Changed from input_random
    value: note.value.toString(),                // Changed from input_value
    token: note.token.toString(),
    leaf_index: leafIndex.toString(),            // Changed from input_leaf_index
    path_elements: pathElements.map((e) => e.toString()), // Changed from input_path_elements
    change_random: changeRandom.toString(),
    // Public input
    unshield_amount: unshieldAmount.toString(),
    // Note: merkle_root, nullifier, change_commitment are computed by the circuit
  };

  return { circuitInput, changeNote, changeRandom };
}

/**
 * Generate unshield proof using snarkjs (with change support)
 */
export async function generateUnshieldProof(
  unshieldInput: UnshieldInput,
  config: ProverConfig = {}
): Promise<{ proof: snarkjs.Groth16Proof; publicSignals: string[]; changeNote: Note | null; changeRandom: bigint }> {
  const paths = getUnshieldCircuitPaths();
  const wasmPath = config.wasmPath ?? paths.wasmPath;
  const zkeyPath = config.zkeyPath ?? paths.zkeyPath;

  // Build circuit input
  const { circuitInput, changeNote, changeRandom } = buildUnshieldInput(unshieldInput);

  // Generate proof (snarkjs supports both Node.js and browser)
  if (isNodeEnvironment()) {
    // Node.js: Check if files exist, then use file paths directly
    if (!fs.existsSync(wasmPath)) {
      throw new Error(`Circuit WASM not found: ${wasmPath}`);
    }
    if (!fs.existsSync(zkeyPath)) {
      throw new Error(`ZKey not found: ${zkeyPath}`);
    }

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInput as unknown as snarkjs.CircuitSignals,
      wasmPath,
      zkeyPath
    );

    return { proof, publicSignals, changeNote, changeRandom };
  } else {
    const [wasmBuffer, zkeyBuffer] = await Promise.all([
      loadFileBrowser(wasmPath),
      loadFileBrowser(zkeyPath),
    ]);

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInput as unknown as snarkjs.CircuitSignals,
      new Uint8Array(wasmBuffer),
      new Uint8Array(zkeyBuffer)
    );

    return { proof, publicSignals, changeNote, changeRandom };
  }
}

/**
 * Convert snarkjs proof to Sui-compatible format (Arkworks compressed) with change note support
 *
 * Uses shared compression utilities for consistent serialization.
 */
export function convertUnshieldProofToSui(
  proof: snarkjs.Groth16Proof,
  publicSignals: string[],
  changeNote: Note | null,
  recipientViewingPk: Uint8Array
): SuiUnshieldProof {
  const proofBytes = serializeProof(proof as any);
  const publicInputsBytes = serializePublicInputs(publicSignals);

  // Encrypt change note if it exists (user sends change to themselves)
  const encryptedChangeNote = changeNote
    ? encryptNote(changeNote, recipientViewingPk)
    : new Uint8Array(0);

  return {
    proofBytes,
    publicInputsBytes,
    changeNote,
    encryptedChangeNote,
  };
}

// ============ Transfer Proof Functions ============

/** Get default paths to transfer circuit artifacts */
function getTransferCircuitPaths() {
  if (isNodeEnvironment()) {
    // Node.js: Load from filesystem
    if (!fs) {
      fs = require('fs');
      path = require('path');
      url = require('url');
    }

    const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

    return {
      wasmPath: path.resolve(__dirname, "../../circuits/build/transfer_js/transfer.wasm"),
      zkeyPath: path.resolve(__dirname, "../../circuits/build/transfer_final.zkey"),
    };
  } else {
    // Browser: Load from public directory via fetch
    return {
      wasmPath: "/circuits/transfer_js/transfer.wasm",
      zkeyPath: "/circuits/transfer_final.zkey",
    };
  }
}

/**
 * Build circuit input for transfer proof (2-input, 2-output)
 */
export function buildTransferInput(transferInput: TransferInput): TransferCircuitInput {
  const { keypair, inputNotes, inputLeafIndices, inputPathElements, outputNotes, token } = transferInput;

  // Validate inputs
  if (inputNotes.length < 1 || inputNotes.length > 2) {
    throw new Error("Transfer requires 1 or 2 input notes");
  }
  if (outputNotes.length !== 2) {
    throw new Error("Transfer requires exactly 2 output notes");
  }
  if (inputPathElements.length !== inputNotes.length) {
    throw new Error("Path elements must match input notes count");
  }

  // Verify all path elements have correct length
  for (const paths of inputPathElements) {
    if (paths.length !== MERKLE_TREE_DEPTH) {
      throw new Error(
        `Invalid path elements length: ${paths.length}, expected ${MERKLE_TREE_DEPTH}`
      );
    }
  }

  // Pad to 2 inputs if only 1 provided (use dummy note with value=0)
  const paddedInputs = [...inputNotes];
  const paddedIndices = [...inputLeafIndices];
  const paddedPaths = [...inputPathElements];

  if (paddedInputs.length === 1) {
    // Create a dummy note with value=0 to pad to 2 inputs.
    // The circuit uses conditional constraints (enabled flag based on value):
    //   - When value=0: Merkle proof check and root equality are bypassed
    //   - Nullifier is still computed: Poseidon(nullifying_key, leaf_index)
    //
    // Key requirements for dummy note:
    // 1. value = 0 (triggers Merkle proof bypass in circuit line 110)
    // 2. token = same as transfer token (circuit requires all notes use same token)
    // 3. NSK = Poseidon(MPK, random) (circuit verifies this at line 82)
    // 4. commitment = Poseidon(NSK, token, value)
    // 5. Unique leaf index (to avoid duplicate nullifiers with real note)

    // Compute MPK from keypair (same as circuit does at line 53-56)
    const mpk = poseidonHash([keypair.spendingKey, keypair.nullifyingKey]);

    // Generate valid NSK for dummy note
    const dummyRandom = 0n;  // Can be any value, using 0 for simplicity
    const dummyNpk = poseidonHash([mpk, dummyRandom]);

    const dummyNote: Note = {
      nsk: dummyNpk,           // Valid NSK = Poseidon(MPK, random)
      token: token,            // Must match transfer token
      value: 0n,               // Triggers Merkle bypass
      random: dummyRandom,     // Matches NSK computation
      commitment: poseidonHash([dummyNpk, token, 0n])  // Use computed NSK
    };

    paddedInputs.push(dummyNote);

    // Use a unique leaf index for the dummy note to avoid nullifier collision.
    // If the real note is at index 0, we use 1 for the dummy. Otherwise, 0 is safe.
    const dummyIndex = inputLeafIndices[0] === 0 ? 1 : 0;
    paddedIndices.push(dummyIndex);

    // For a dummy/zero input, the path elements should all be zero.
    // The circuit bypasses Merkle proof verification when value=0.
    paddedPaths.push(Array(MERKLE_TREE_DEPTH).fill(0n));
  }

  // Compute nullifiers for both inputs
  const inputNullifiers = paddedIndices.map((index) =>
    computeNullifier(keypair.nullifyingKey, index)
  );

  // Compute merkle root from first input
  const merkleRoot = computeMerkleRoot(
    paddedInputs[0].commitment,
    paddedPaths[0],
    paddedIndices[0]
  );

  // CRITICAL VALIDATION: Verify second input (if non-dummy) has same root
  // This prevents circuit constraint failure at line 103
  if (paddedInputs.length === 2 && paddedInputs[1].value > 0n) {
    const root2 = computeMerkleRoot(
      paddedInputs[1].commitment,
      paddedPaths[1],
      paddedIndices[1]
    );

    if (root2 !== merkleRoot) {
      throw new Error(
        `Merkle root mismatch! This will cause circuit failure at line 103.\n` +
        `Input 0: leafIndex=${paddedIndices[0]}, root=${merkleRoot.toString()}\n` +
        `Input 1: leafIndex=${paddedIndices[1]}, root=${root2.toString()}\n` +
        `Reason: Notes were created at different tree states.\n` +
        `Solution: Refresh your notes to get the latest Merkle proofs and try again.`
      );
    }
  }

  return {
    // Private inputs
    spending_key: keypair.spendingKey.toString(),
    nullifying_key: keypair.nullifyingKey.toString(),
    input_nsks: paddedInputs.map((n) => n.nsk.toString()),
    input_values: paddedInputs.map((n) => n.value.toString()),
    input_randoms: paddedInputs.map((n) => n.random.toString()),
    input_leaf_indices: paddedIndices.map((idx) => idx.toString()),
    input_path_elements: paddedPaths.map((path) => path.map((e) => e.toString())),
    output_nsks: outputNotes.map((n) => n.nsk.toString()),
    output_values: outputNotes.map((n) => n.value.toString()),
    output_randoms: outputNotes.map((n) => n.random.toString()),
    token: token.toString(),
    // Public inputs
    merkle_root: merkleRoot.toString(),
    input_nullifiers: inputNullifiers.map((n) => n.toString()),
    output_commitments: outputNotes.map((n) => n.commitment.toString()),
  };
}

/**
 * Generate transfer proof using snarkjs
 */
export async function generateTransferProof(
  transferInput: TransferInput,
  config: ProverConfig = {}
): Promise<{ proof: snarkjs.Groth16Proof; publicSignals: string[] }> {
  const paths = getTransferCircuitPaths();
  const wasmPath = config.wasmPath ?? paths.wasmPath;
  const zkeyPath = config.zkeyPath ?? paths.zkeyPath;

  // Build circuit input
  const input = buildTransferInput(transferInput);

  // Generate proof (snarkjs supports both Node.js and browser)
  if (isNodeEnvironment()) {
    // Node.js: Check if files exist, then use file paths directly
    if (!fs.existsSync(wasmPath)) {
      throw new Error(`Transfer circuit WASM not found: ${wasmPath}`);
    }
    if (!fs.existsSync(zkeyPath)) {
      throw new Error(`Transfer zkey not found: ${zkeyPath}`);
    }

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input as unknown as snarkjs.CircuitSignals,
      wasmPath,
      zkeyPath
    );

    return { proof, publicSignals };
  } else {
    const [wasmBuffer, zkeyBuffer] = await Promise.all([
      loadFileBrowser(wasmPath),
      loadFileBrowser(zkeyPath),
    ]);

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input as unknown as snarkjs.CircuitSignals,
      new Uint8Array(wasmBuffer),
      new Uint8Array(zkeyBuffer)
    );

    return { proof, publicSignals };
  }
}

/**
 * Convert transfer proof to Sui-compatible format (Arkworks compressed)
 *
 * Uses shared compression utilities for consistent serialization.
 * Transfer proofs have 5 public inputs (vs 3 for unshield).
 */
export function convertTransferProofToSui(
  proof: snarkjs.Groth16Proof,
  publicSignals: string[]
): SuiTransferProof {
  // Validate public signals count for transfer circuit
  if (publicSignals.length !== 5) {
    throw new Error(`Expected 5 public signals for transfer, got ${publicSignals.length}`);
  }

  const proofBytes = serializeProof(proof as any);
  const publicInputsBytes = serializePublicInputs(publicSignals);

  return { proofBytes, publicInputsBytes };
}


// ============ Swap Proof Functions ============

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
 * Build circuit input for swap proof
 */
export function buildSwapInput(swapInput: SwapInput): SwapCircuitInput {
  const {
    keypair,
    inputNotes,
    inputLeafIndices,
    inputPathElements,
    swapParams,
    outputNSK,
    outputRandom,
    outputValue,
    changeNSK,
    changeRandom,
    changeValue,
  } = swapInput;

  // Ensure we have exactly 2 input notes (pad with dummy if needed)
  const notes = [...inputNotes];
  const leafIndices = [...inputLeafIndices];
  const pathElements = [...inputPathElements];

  while (notes.length < 2) {
    // Create dummy note with zero value
    // IMPORTANT: NSK must satisfy circuit constraint: NSK = Poseidon(MPK, random)
    // We use random=0 for simplicity, so NSK = Poseidon(MPK, 0)
    const dummyRandom = 0n;
    const dummyNSK = poseidonHash([keypair.masterPublicKey, dummyRandom]);
    const dummyNote: Note = {
      nsk: dummyNSK,  // Correctly derived NSK
      token: swapParams.tokenIn,
      value: 0n,
      random: dummyRandom,
      commitment: poseidonHash([dummyNSK, swapParams.tokenIn, 0n]),
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

  // Compute output commitment = Poseidon(NSK, token_out, output_value)
  const outputCommitment = poseidonHash([outputNSK, swapParams.tokenOut, outputValue]);

  // Compute change commitment = Poseidon(NSK, token_in, change_value)
  const changeCommitment = poseidonHash([changeNSK, swapParams.tokenIn, changeValue]);

  // Compute swap data hash = Poseidon(token_in, token_out, amount_in, min_amount_out, dex_pool_id)
  const swapDataHash = poseidonHash([
    swapParams.tokenIn,
    swapParams.tokenOut,
    swapParams.amountIn,
    swapParams.minAmountOut,
    swapParams.dexPoolId,
  ]);

  // Compute Merkle root from both input notes and verify they match
  const roots: bigint[] = [];

  for (let noteIdx = 0; noteIdx < 2; noteIdx++) {
    let root = notes[noteIdx].commitment;
    const indices = BigInt(leafIndices[noteIdx]);

    for (let level = 0; level < MERKLE_TREE_DEPTH; level++) {
      const sibling = pathElements[noteIdx][level];
      // Check if index bit is 0 or 1
      const isRight = (indices >> BigInt(level)) & 1n;
      if (isRight === 0n) {
        root = poseidonHash([root, sibling]);
      } else {
        root = poseidonHash([sibling, root]);
      }
    }

    roots.push(root);
  }

  // Verify both notes compute the same Merkle root
  if (roots[0] !== roots[1]) {
    throw new Error(
      `Merkle root mismatch! ` +
      `Note 0 (leafIndex=${leafIndices[0]}): ${roots[0].toString()} ` +
      `Note 1 (leafIndex=${leafIndices[1]}): ${roots[1].toString()}. ` +
      `This usually means the notes have stale Merkle proofs. Try refreshing your notes.`
    );
  }

  const root = roots[0];

  return {
    // Private inputs - Keypair
    spending_key: keypair.spendingKey.toString(),
    nullifying_key: keypair.nullifyingKey.toString(),

    // Private inputs - Input notes
    input_nsks: notes.map(n => n.nsk.toString()),
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
    output_nsk: outputNSK.toString(),
    output_value: outputValue.toString(),
    output_random: outputRandom.toString(),

    // Private inputs - Change note
    change_nsk: changeNSK.toString(),
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
 * Generate a swap proof using the swap circuit
 *
 * Returns raw proof and public signals. Use convertSwapProofToSui() to convert to Sui format.
 * This matches the pattern used in prover.ts for consistency.
 */
export async function generateSwapProof(
  swapInput: SwapInput,
  config?: { wasmPath?: string; zkeyPath?: string }
): Promise<{ proof: snarkjs.Groth16Proof; publicSignals: string[] }> {
  const paths = getSwapCircuitPaths();
  const wasmPath = config?.wasmPath ?? paths.wasmPath;
  const zkeyPath = config?.zkeyPath ?? paths.zkeyPath;

  // Build circuit input
  const circuitInput = buildSwapInput(swapInput);

  // Generate proof using snarkjs
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput as any,
    wasmPath,
    zkeyPath
  );

  return { proof, publicSignals };
}

/**
 * Convert swap proof to Sui-compatible format (Arkworks compressed)
 *
 * Uses shared compression utilities for consistent serialization.
 * This matches the pattern used in prover.ts for unshield and transfer proofs.
 */
export function convertSwapProofToSui(
  proof: snarkjs.Groth16Proof,
  publicSignals: string[]
): SuiSwapProof {
  // Validate public signals count for swap circuit
  // Expected: merkle_root, nullifier1, nullifier2, output_commitment, change_commitment, swap_data_hash
  if (publicSignals.length !== 6) {
    throw new Error(`Expected 6 public signals for swap, got ${publicSignals.length}`);
  }

  const proofBytes = serializeProof(proof as any);
  const publicInputsBytes = serializePublicInputs(publicSignals);

  return { proofBytes, publicInputsBytes };
}