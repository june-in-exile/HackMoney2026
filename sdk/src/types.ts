/**
 * Octopus SDK - Type Definitions
 */

/** BN254 curve field modulus */
export const FIELD_MODULUS = BigInt(
  "21888242871839275222246405745257275088696311157297823662689037894645226208583"
);

/** BN254 scalar field modulus */
export const SCALAR_MODULUS = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617"
);

/** Merkle tree depth (supports 2^16 = 65536 notes) */
export const MERKLE_TREE_DEPTH = 16;

/** Number of historical roots stored for concurrent transactions */
export const ROOT_HISTORY_SIZE = 100;

/**
 * Keypair derived from master spending key
 */
export interface OctopusKeypair {
  /** Master spending key (private) */
  spendingKey: bigint;
  /** Nullifying key derived from spending key */
  nullifyingKey: bigint;
  /** Master public key = Poseidon(spendingKey, nullifyingKey) */
  masterPublicKey: bigint;
}

/**
 * A shielded note (UTXO) in the privacy pool
 */
export interface Note {
  /** Note public key = Poseidon(MPK, random) */
  npk: bigint;
  /** Token type identifier */
  token: bigint;
  /** Value/amount */
  value: bigint;
  /** Random blinding factor */
  random: bigint;
  /** Computed commitment = Poseidon(npk, token, value) */
  commitment: bigint;
}

/**
 * Verification key in Sui-compatible format
 */
export interface SuiVerificationKey {
  /** VK bytes in Arkworks compressed format */
  vkBytes: Uint8Array;
}

// ============ Unshield Types ============

/**
 * Input for unshielding a note
 */
export interface UnshieldInput {
  /** The note being unshield */
  note: Note;
  /** Position in the Merkle tree */
  leafIndex: number;
  /** Merkle proof path elements */
  pathElements: bigint[];
  /** The keypair that owns this note */
  keypair: OctopusKeypair;
}

/**
 * Circuit input for unshield proof generation
 */
export interface UnshieldCircuitInput {
  // Private inputs
  spending_key: string;
  nullifying_key: string;
  random: string;
  value: string;
  token: string;
  path_elements: string[];
  path_indices: string;
  // Public inputs
  merkle_root: string;
  nullifier: string;
  commitment: string;
}

/**
 * ZK proof data in Sui-compatible format
 */
export interface SuiUnshieldProof {
  /** Proof points (128 bytes: A || B || C) */
  proofBytes: Uint8Array;
  /** Public inputs (96 bytes: root || nullifier || commitment) */
  publicInputsBytes: Uint8Array;
}

// ============ Transfer Types ============

/**
 * Input for generating a transfer proof (2-input, 2-output)
 */
export interface TransferInput {
  /** Sender's keypair */
  keypair: OctopusKeypair;
  /** Input notes to spend (1 or 2, will be padded to 2 with dummy if needed) */
  inputNotes: Note[];
  /** Leaf indices for input notes */
  inputLeafIndices: number[];
  /** Merkle proof paths for input notes */
  inputPathElements: bigint[][];
  /** Output notes (exactly 2: recipient + change) */
  outputNotes: Note[];
  /** Token type */
  token: bigint;
}

/**
 * Circuit input for transfer proof generation
 */
export interface TransferCircuitInput {
  // Private inputs
  spending_key: string;
  nullifying_key: string;
  input_npks: string[];
  input_values: string[];
  input_randoms: string[];
  input_leaf_indices: string[];
  input_path_elements: string[][];
  output_npks: string[];
  output_values: string[];
  output_randoms: string[];
  token: string;
  // Public inputs
  merkle_root: string;
  input_nullifiers: string[];
  output_commitments: string[];
}

/**
 * Transfer proof in Sui-compatible format
 */
export interface SuiTransferProof {
  /** Proof points (128 bytes: A || B || C) */
  proofBytes: Uint8Array;
  /** Public inputs (160 bytes: root || null1 || null2 || comm1 || comm2) */
  publicInputsBytes: Uint8Array;
}

// ============ Swap Types ============

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