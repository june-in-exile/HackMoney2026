/**
 * Railgun on Sui - Type Definitions
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
 * Railgun keypair derived from master spending key
 */
export interface RailgunKeypair {
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
 * Input for spending a note (unshield)
 */
export interface SpendInput {
  /** The note being spent */
  note: Note;
  /** Position in the Merkle tree */
  leafIndex: number;
  /** Merkle proof path elements */
  pathElements: bigint[];
  /** The keypair that owns this note */
  keypair: RailgunKeypair;
}

/**
 * ZK proof data in Sui-compatible format
 */
export interface SuiProof {
  /** Proof points (128 bytes: A || B || C) */
  proofBytes: Uint8Array;
  /** Public inputs (96 bytes: root || nullifier || commitment) */
  publicInputsBytes: Uint8Array;
}

/**
 * Verification key in Sui-compatible format
 */
export interface SuiVerificationKey {
  /** VK bytes in Arkworks compressed format */
  vkBytes: Uint8Array;
}

/**
 * Shield transaction parameters
 */
export interface ShieldParams {
  /** Amount to shield */
  amount: bigint;
  /** Token type (coin type hash) */
  token: bigint;
  /** Recipient's master public key */
  recipientMpk: bigint;
  /** Random blinding factor (generated if not provided) */
  random?: bigint;
}

/**
 * Unshield transaction parameters
 */
export interface UnshieldParams {
  /** The note to spend */
  spendInput: SpendInput;
  /** Amount to withdraw */
  amount: bigint;
  /** Recipient Sui address */
  recipient: string;
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
 * Pool state snapshot for client-side operations
 */
export interface PoolState {
  /** Current Merkle root */
  merkleRoot: bigint;
  /** Number of notes in the tree */
  noteCount: number;
  /** Historical roots for proof validity */
  historicalRoots: bigint[];
}
