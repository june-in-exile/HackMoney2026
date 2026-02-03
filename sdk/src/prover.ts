/**
 * Octopus SDK - ZK Proof Generation
 *
 * Generates Groth16 proofs for unshield operations using snarkjs.
 */

import * as snarkjs from "snarkjs";
import {
  type SpendInput,
  type UnshieldCircuitInput,
  type SuiProof,
  type SuiVerificationKey,
  type TransferInput,
  type TransferCircuitInput,
  type SuiTransferProof,
  type Note,
  MERKLE_TREE_DEPTH,
} from "./types.js";
import {
  computeNullifier,
  computeMerkleRoot,
  poseidonHash,
} from "./crypto.js";

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

/** Get default paths to circuit artifacts */
function getDefaultPaths() {
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

/**
 * Build circuit input for unshield proof
 */
export function buildUnshieldInput(spendInput: SpendInput): UnshieldCircuitInput {
  const { note, leafIndex, pathElements, keypair } = spendInput;

  // Verify path elements length
  if (pathElements.length !== MERKLE_TREE_DEPTH) {
    throw new Error(
      `Invalid path elements length: ${pathElements.length}, expected ${MERKLE_TREE_DEPTH}`
    );
  }

  // Compute nullifier
  const nullifier = computeNullifier(keypair.nullifyingKey, leafIndex);

  // Compute merkle root
  const merkleRoot = computeMerkleRoot(note.commitment, pathElements, leafIndex);

  return {
    // Private inputs
    spending_key: keypair.spendingKey.toString(),
    nullifying_key: keypair.nullifyingKey.toString(),
    random: note.random.toString(),
    value: note.value.toString(),
    token: note.token.toString(),
    path_elements: pathElements.map((e) => e.toString()),
    path_indices: leafIndex.toString(),
    // Public inputs
    merkle_root: merkleRoot.toString(),
    nullifier: nullifier.toString(),
    commitment: note.commitment.toString(),
  };
}

/**
 * Generate unshield proof using snarkjs
 */
export async function generateUnshieldProof(
  spendInput: SpendInput,
  config: ProverConfig = {}
): Promise<{ proof: snarkjs.Groth16Proof; publicSignals: string[] }> {
  const defaults = getDefaultPaths();
  const wasmPath = config.wasmPath ?? defaults.wasmPath;
  const zkeyPath = config.zkeyPath ?? defaults.zkeyPath;

  // Build circuit input
  const input = buildUnshieldInput(spendInput);

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
      input as unknown as snarkjs.CircuitSignals,
      wasmPath,
      zkeyPath
    );

    return { proof, publicSignals };
  } else {
    // Browser: Load files via fetch, then use snarkjs with buffers
    console.log(`Loading circuit artifacts from ${wasmPath} and ${zkeyPath}...`);

    const [wasmBuffer, zkeyBuffer] = await Promise.all([
      loadFileBrowser(wasmPath),
      loadFileBrowser(zkeyPath),
    ]);

    console.log(`Loaded WASM: ${wasmBuffer.byteLength} bytes, zkey: ${zkeyBuffer.byteLength} bytes`);

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input as unknown as snarkjs.CircuitSignals,
      new Uint8Array(wasmBuffer),
      new Uint8Array(zkeyBuffer)
    );

    return { proof, publicSignals };
  }
}

/**
 * Verify proof locally using snarkjs
 */
export async function verifyProofLocal(
  proof: snarkjs.Groth16Proof,
  publicSignals: string[],
  config: ProverConfig = {}
): Promise<boolean> {
  const defaults = getDefaultPaths();
  const vkPath = config.vkPath ?? defaults.vkPath;

  let vk: any;

  if (isNodeEnvironment()) {
    // Node.js: Load from filesystem
    if (!fs.existsSync(vkPath)) {
      throw new Error(`Verification key not found: ${vkPath}`);
    }
    vk = JSON.parse(fs.readFileSync(vkPath, "utf-8"));
  } else {
    // Browser: Load via fetch
    const response = await fetch(vkPath);
    if (!response.ok) {
      throw new Error(`Failed to fetch verification key: ${response.status}`);
    }
    vk = await response.json();
  }

  return await snarkjs.groth16.verify(vk, publicSignals, proof);
}

/**
 * Convert snarkjs proof to Sui-compatible format (Arkworks compressed)
 */
export function convertProofToSui(
  proof: snarkjs.Groth16Proof,
  publicSignals: string[]
): SuiProof {
  // Compress G1 point: x-coordinate with sign bit
  const compressG1 = (point: string[]): Uint8Array => {
    const x = BigInt(point[0]);
    const y = BigInt(point[1]);

    const buf = bigIntToLE32(x);

    // Set sign bit if y > p/2
    const FIELD_MODULUS = BigInt(
      "21888242871839275222246405745257275088696311157297823662689037894645226208583"
    );
    if (y > FIELD_MODULUS / 2n) {
      buf[31] |= 0x80;
    }

    return buf;
  };

  // Compress G2 point: 64 bytes (two Fq elements)
  const compressG2 = (point: string[][]): Uint8Array => {
    const x0 = BigInt(point[0][0]);
    const x1 = BigInt(point[0][1]);
    const y0 = BigInt(point[1][0]);
    const y1 = BigInt(point[1][1]);

    const buf = new Uint8Array(64);

    // Write x0 (c0) in little-endian
    const x0Bytes = bigIntToLE32(x0);
    buf.set(x0Bytes, 0);

    // Write x1 (c1) in little-endian
    const x1Bytes = bigIntToLE32(x1);
    buf.set(x1Bytes, 32);

    // Determine sign
    const FIELD_MODULUS = BigInt(
      "21888242871839275222246405745257275088696311157297823662689037894645226208583"
    );
    const negY0 = y0 === 0n ? 0n : FIELD_MODULUS - y0;
    const negY1 = y1 === 0n ? 0n : FIELD_MODULUS - y1;

    let yIsLarger = false;
    if (y1 > negY1) {
      yIsLarger = true;
    } else if (y1 === negY1 && y0 > negY0) {
      yIsLarger = true;
    }

    if (yIsLarger) {
      buf[63] |= 0x80;
    }

    return buf;
  };

  // Proof: A (G1) || B (G2) || C (G1) = 32 + 64 + 32 = 128 bytes
  const piA = compressG1(proof.pi_a as string[]);
  const piB = compressG2(proof.pi_b as string[][]);
  const piC = compressG1(proof.pi_c as string[]);

  const proofBytes = new Uint8Array(128);
  proofBytes.set(piA, 0);
  proofBytes.set(piB, 32);
  proofBytes.set(piC, 96);

  // Public inputs: 3 × 32 bytes = 96 bytes (LE format per Sui docs)
  // Sui requires little-endian format for scalar field elements
  const publicInputsBytes = new Uint8Array(96);
  for (let i = 0; i < 3; i++) {
    const inputBytes = bigIntToLE32(BigInt(publicSignals[i]));  // Changed to LE!
    publicInputsBytes.set(inputBytes, i * 32);
  }

  return { proofBytes, publicInputsBytes };
}

/**
 * Load and convert verification key to Sui format
 */
export async function loadVerificationKey(vkPath?: string): Promise<SuiVerificationKey> {
  const defaults = getDefaultPaths();
  const path_ = vkPath ?? defaults.vkPath;

  let vk: any;

  if (isNodeEnvironment()) {
    // Node.js: Load from filesystem
    if (!fs.existsSync(path_)) {
      throw new Error(`Verification key not found: ${path_}`);
    }
    vk = JSON.parse(fs.readFileSync(path_, "utf-8"));
  } else {
    // Browser: Load via fetch
    const response = await fetch(path_);
    if (!response.ok) {
      throw new Error(`Failed to fetch verification key: ${response.status}`);
    }
    vk = await response.json();
  }

  // Compress G1 point
  const compressG1 = (point: string[]): Uint8Array => {
    const x = BigInt(point[0]);
    const y = BigInt(point[1]);
    const buf = bigIntToLE32(x);
    const FIELD_MODULUS = BigInt(
      "21888242871839275222246405745257275088696311157297823662689037894645226208583"
    );
    if (y > FIELD_MODULUS / 2n) {
      buf[31] |= 0x80;
    }
    return buf;
  };

  // Compress G2 point
  const compressG2 = (point: string[][]): Uint8Array => {
    const x0 = BigInt(point[0][0]);
    const x1 = BigInt(point[0][1]);
    const y0 = BigInt(point[1][0]);
    const y1 = BigInt(point[1][1]);

    const buf = new Uint8Array(64);
    const x0Bytes = bigIntToLE32(x0);
    buf.set(x0Bytes, 0);
    const x1Bytes = bigIntToLE32(x1);
    buf.set(x1Bytes, 32);

    const FIELD_MODULUS = BigInt(
      "21888242871839275222246405745257275088696311157297823662689037894645226208583"
    );
    const negY0 = y0 === 0n ? 0n : FIELD_MODULUS - y0;
    const negY1 = y1 === 0n ? 0n : FIELD_MODULUS - y1;

    let yIsLarger = false;
    if (y1 > negY1) {
      yIsLarger = true;
    } else if (y1 === negY1 && y0 > negY0) {
      yIsLarger = true;
    }

    if (yIsLarger) {
      buf[63] |= 0x80;
    }

    return buf;
  };

  // Build VK bytes: alpha || beta || gamma || delta || len(IC) || IC points
  const alphaG1 = compressG1(vk.vk_alpha_1);
  const betaG2 = compressG2(vk.vk_beta_2);
  const gammaG2 = compressG2(vk.vk_gamma_2);
  const deltaG2 = compressG2(vk.vk_delta_2);

  const icPoints = (vk.IC as string[][]).map((p) => compressG1(p));

  // IC length as 8-byte LE
  const icLenBuf = new Uint8Array(8);
  new DataView(icLenBuf.buffer).setUint32(0, icPoints.length, true);

  // Concatenate all parts
  const totalLen = 32 + 64 + 64 + 64 + 8 + icPoints.length * 32;
  const vkBytes = new Uint8Array(totalLen);

  let offset = 0;
  vkBytes.set(alphaG1, offset);
  offset += 32;
  vkBytes.set(betaG2, offset);
  offset += 64;
  vkBytes.set(gammaG2, offset);
  offset += 64;
  vkBytes.set(deltaG2, offset);
  offset += 64;
  vkBytes.set(icLenBuf, offset);
  offset += 8;
  for (const ic of icPoints) {
    vkBytes.set(ic, offset);
    offset += 32;
  }

  return { vkBytes };
}

/**
 * Convert BigInt to 32-byte little-endian Uint8Array
 */
function bigIntToLE32(n: bigint): Uint8Array {
  const buf = new Uint8Array(32);
  let val = n;
  for (let i = 0; i < 32; i++) {
    buf[i] = Number(val & 0xffn);
    val >>= 8n;
  }
  return buf;
}

function bigIntToBE32(n: bigint): Uint8Array {
  const buf = new Uint8Array(32);
  let val = n;
  for (let i = 31; i >= 0; i--) {
    buf[i] = Number(val & 0xffn);
    val >>= 8n;
  }
  return buf;
}

// ============ Transfer Proof Functions ============

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
    // 3. NPK = Poseidon(MPK, random) (circuit verifies this at line 82)
    // 4. commitment = Poseidon(NPK, token, value)
    // 5. Unique leaf index (to avoid duplicate nullifiers with real note)

    // Compute MPK from keypair (same as circuit does at line 53-56)
    const mpk = poseidonHash([keypair.spendingKey, keypair.nullifyingKey]);

    // Generate valid NPK for dummy note
    const dummyRandom = 0n;  // Can be any value, using 0 for simplicity
    const dummyNpk = poseidonHash([mpk, dummyRandom]);

    const dummyNote: Note = {
      npk: dummyNpk,           // Valid NPK = Poseidon(MPK, random)
      token: token,            // Must match transfer token
      value: 0n,               // Triggers Merkle bypass
      random: dummyRandom,     // Matches NPK computation
      commitment: poseidonHash([dummyNpk, token, 0n])  // Use computed NPK
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
    input_npks: paddedInputs.map((n) => n.npk.toString()),
    input_values: paddedInputs.map((n) => n.value.toString()),
    input_randoms: paddedInputs.map((n) => n.random.toString()),
    input_leaf_indices: paddedIndices.map((idx) => idx.toString()),
    input_path_elements: paddedPaths.map((path) => path.map((e) => e.toString())),
    output_npks: outputNotes.map((n) => n.npk.toString()),
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
  const wasmPath = config.wasmPath ?? (isNodeEnvironment()
    ? path?.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "../../circuits/build/transfer_js/transfer.wasm")
    : "/circuits/transfer_js/transfer.wasm");

  const zkeyPath = config.zkeyPath ?? (isNodeEnvironment()
    ? path?.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "../../circuits/build/transfer_final.zkey")
    : "/circuits/transfer_final.zkey");

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
    // Browser: Load files via fetch, then use snarkjs with buffers
    console.log(`Loading transfer circuit artifacts from ${wasmPath} and ${zkeyPath}...`);

    const [wasmBuffer, zkeyBuffer] = await Promise.all([
      loadFileBrowser(wasmPath),
      loadFileBrowser(zkeyPath),
    ]);

    console.log(
      `Loaded transfer WASM: ${wasmBuffer.byteLength} bytes, zkey: ${zkeyBuffer.byteLength} bytes`
    );

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
 */
export function convertTransferProofToSui(
  proof: snarkjs.Groth16Proof,
  publicSignals: string[]
): SuiTransferProof {
  // Reuse compression functions from convertProofToSui
  const compressG1 = (point: string[]): Uint8Array => {
    const x = BigInt(point[0]);
    const y = BigInt(point[1]);
    const buf = bigIntToLE32(x);
    const FIELD_MODULUS = BigInt(
      "21888242871839275222246405745257275088696311157297823662689037894645226208583"
    );
    if (y > FIELD_MODULUS / 2n) {
      buf[31] |= 0x80;
    }
    return buf;
  };

  const compressG2 = (point: string[][]): Uint8Array => {
    const x0 = BigInt(point[0][0]);
    const x1 = BigInt(point[0][1]);
    const y0 = BigInt(point[1][0]);
    const y1 = BigInt(point[1][1]);

    const buf = new Uint8Array(64);
    const x0Bytes = bigIntToLE32(x0);
    buf.set(x0Bytes, 0);
    const x1Bytes = bigIntToLE32(x1);
    buf.set(x1Bytes, 32);

    const FIELD_MODULUS = BigInt(
      "21888242871839275222246405745257275088696311157297823662689037894645226208583"
    );
    const negY0 = y0 === 0n ? 0n : FIELD_MODULUS - y0;
    const negY1 = y1 === 0n ? 0n : FIELD_MODULUS - y1;

    let yIsLarger = false;
    if (y1 > negY1) {
      yIsLarger = true;
    } else if (y1 === negY1 && y0 > negY0) {
      yIsLarger = true;
    }

    if (yIsLarger) {
      buf[63] |= 0x80;
    }

    return buf;
  };

  // Proof: A (G1) || B (G2) || C (G1) = 32 + 64 + 32 = 128 bytes
  const piA = compressG1(proof.pi_a as string[]);
  const piB = compressG2(proof.pi_b as string[][]);
  const piC = compressG1(proof.pi_c as string[]);

  const proofBytes = new Uint8Array(128);
  proofBytes.set(piA, 0);
  proofBytes.set(piB, 32);
  proofBytes.set(piC, 96);

  // Public inputs: 5 × 32 bytes = 160 bytes (BE format for Move contract)
  // Order: merkle_root, nullifier1, nullifier2, commitment1, commitment2
  if (publicSignals.length !== 5) {
    throw new Error(`Expected 5 public signals, got ${publicSignals.length}`);
  }

  // Sui requires little-endian format for public inputs per official docs
  const publicInputsBytes = new Uint8Array(160);
  for (let i = 0; i < 5; i++) {
    const inputBytes = bigIntToLE32(BigInt(publicSignals[i]));  // Changed to LE!
    publicInputsBytes.set(inputBytes, i * 32);
  }

  return { proofBytes, publicInputsBytes };
}
