// Byte conversion utilities
export {
  bigIntToBE32,
  bytesToBigIntBE,
  bigIntToLE32,
  bytesToBigIntLE,
  hexToBytes,
  bytesToHex,
  bytesToBigIntLE_BN254,
  bytesToHex0x,
} from "./utils/bytes.js";

// Math utilities
export {
  calculateMinOutput,
  calculatePercentageChange,
  calculatePriceImpact,
} from "./utils/math.js";

// Cryptographic utilities
export {
  initPoseidon,
  poseidonHash,
  randomFieldElement,
  deriveKeypair,
  generateKeypair,
  createNote,
  computeNullifier,
  computeZeroHashes,
  computeMerkleRoot,
  deriveViewingPublicKey,
  exportViewingPublicKey,
  importViewingPublicKey,
  isValidViewingPublicKey,
  encryptNoteExplicit,
  encryptNote,
  decryptNote,
} from "./crypto.js";

// DEX Integration (Cetus price fetching)
export {
  getCetusPool,
  estimateCetusSwap,
  findCetusPool,
  getCetusPrice,
  CETUS_TESTNET_POOLS,
  type CetusPoolConfig,
  type SwapEstimation,
} from "./dex.js";

// Merkle tree utilities
export {
  ClientMerkleTree,
} from "./merkle.js";

// Proof generation
export {
  type ProverConfig,
  generateUnshieldProof,
  convertUnshieldProofToSui,
  generateTransferProof,
  convertTransferProofToSui,
  generateSwapProof,
  convertSwapProofToSui,
} from "./prover.js";

// Sui interactions
export {
  buildShieldTransaction,
  buildUnshieldTransaction,
  buildTransferTransaction,
  buildSwapTransaction,
  TESTNET_CONFIG,
  type SuiConfig,
} from "./transaction.js";

// Wallet utilities (Note selection for transfers)
export {
  selectNotesForTransfer,
  createTransferOutputs,
  type SelectableNote,
} from "./transfer.js";

// Types
export * from "./types.js";