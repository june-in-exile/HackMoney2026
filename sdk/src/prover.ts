/**
 * Railgun on Sui - ZK Proof Generation
 *
 * Generates Groth16 proofs for unshield operations using snarkjs.
 */

import * as snarkjs from "snarkjs";
import {
  type SpendInput,
  type UnshieldCircuitInput,
  type SuiProof,
  type SuiVerificationKey,
  MERKLE_TREE_DEPTH,
} from "./types.js";
import {
  computeNullifier,
  computeMerkleRoot,
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

  // Public inputs: 3 × 32 bytes = 96 bytes (BE format for Move contract)
  const publicInputsBytes = new Uint8Array(96);
  for (let i = 0; i < 3; i++) {
    const inputBytes = bigIntToBE32(BigInt(publicSignals[i]));
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
