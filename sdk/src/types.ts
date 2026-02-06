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
  /** Note secret key = Poseidon(MPK, random) */
  nsk: bigint;
  /** Token type identifier */
  token: bigint;
  /** Value/amount */
  value: bigint;
  /** Random blinding factor */
  random: bigint;
  /** Computed commitment = Poseidon(nsk, token, value) */
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
 * Input for unshielding a note with automatic change handling
 */
export interface UnshieldInput {
  /** The note being unshielded */
  note: Note;
  /** Position in the Merkle tree */
  leafIndex: number;
  /** Merkle proof path elements */
  pathElements: bigint[];
  /** The keypair that owns this note */
  keypair: OctopusKeypair;
  /** Amount to unshield (must be <= note.value) */
  unshieldAmount: bigint;
}

/**
 * Circuit input for unshield proof generation (with change support)
 * Matches the new circuit design with updated field names
 */
export interface UnshieldCircuitInput {
  // Private inputs (matching new circuit)
  spending_key: string;
  nullifying_key: string;
  random: string;               // Changed from input_random
  value: string;                // Changed from input_value
  token: string;
  leaf_index: string;           // Changed from input_leaf_index
  path_elements: string[];      // Changed from input_path_elements
  change_random: string;
  // Public input
  unshield_amount: string;
  // Note: merkle_root, nullifier, change_commitment are outputs, not inputs
}

/**
 * ZK proof data in Sui-compatible format (with change support)
 */
export interface SuiUnshieldProof {
  /** Proof points (128 bytes: A || B || C) */
  proofBytes: Uint8Array;
  /** Public inputs (128 bytes: root || nullifier || unshield_amount || change_commitment) */
  publicInputsBytes: Uint8Array;
  /** Change note (if any) */
  changeNote: Note | null;
  /** Encrypted change note data for scanning */
  encryptedChangeNote: Uint8Array;
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
  input_nsks: string[];
  input_values: string[];
  input_randoms: string[];
  input_leaf_indices: string[];
  input_path_elements: string[][];
  output_nsks: string[];
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
  /** Output note recipient's NSK */
  outputNSK: bigint;
  /** Random blinding factor for output note */
  outputRandom: bigint;
  /** Expected output amount from DEX */
  outputValue: bigint;
  /** Change note recipient's NSK (usually sender's own NSK) */
  changeNSK: bigint;
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
  input_nsks: string[];
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
  output_nsk: string;
  output_value: string;
  output_random: string;

  // Private inputs - Change note
  change_nsk: string;
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

// ============ Viewing Key & Recipient Management ============

/**
 * Recipient profile for encrypted transfers
 *
 * Contains both the MPK (for creating notes) and the viewing public key
 * (for encrypting notes). Recipients must explicitly share both values.
 */
export interface RecipientProfile {
  /** Master Public Key (for creating notes) */
  mpk: bigint;

  /** Viewing Public Key (for encrypting notes) - explicitly shared by recipient */
  viewingPublicKey: Uint8Array | string;

  /** Optional label/name for this recipient */
  label?: string;
}

/**
 * Stored recipient profile (serialized for localStorage)
 *
 * All bigint and Uint8Array values are converted to hex strings for storage.
 */
export interface RecipientProfileStored {
  /** Master Public Key as hex string */
  mpk: string;

  /** Viewing Public Key as 64-character hex string */
  viewingPublicKey: string;

  /** Optional label/name */
  label?: string;

  /** Timestamp when recipient was added */
  addedAt: number;
}