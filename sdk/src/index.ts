/**
 * Octopus SDK
 *
 * A TypeScript SDK for interacting with the Octopus privacy protocol on Sui.
 *
 * @example
 * ```typescript
 * import {
 *   initPoseidon,
 *   generateKeypair,
 *   createNote,
 *   generateUnshieldProof,
 *   convertProofToSui,
 *   OctopusClient,
 * } from "@octopus/sdk";
 *
 * // Initialize
 * await initPoseidon();
 *
 * // Generate keypair
 * const keypair = generateKeypair();
 *
 * // Create a note
 * const note = createNote(keypair.masterPublicKey, tokenId, amount);
 *
 * // Generate proof for unshield
 * const { proof, publicSignals } = await generateUnshieldProof(spendInput);
 * const suiProof = convertProofToSui(proof, publicSignals);
 *
 * // Execute on Sui
 * const client = new OctopusClient(config);
 * await client.unshield(coinType, suiProof, amount, recipient, signer);
 * ```
 */

// Types
export * from "./types.js";

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
  buildSingleLeafProof,
  deriveViewingPublicKey,
  mpkToViewingPublicKeyUnsafe,
  encryptNote,
  decryptNote,
  bigIntToBytes,
  bytesToBigInt,
} from "./crypto.js";

// Proof generation
export {
  buildUnshieldInput,
  generateUnshieldProof,
  verifyProofLocal,
  convertProofToSui,
  loadVerificationKey,
  type ProverConfig,
} from "./prover.js";

// Sui interactions
export {
  OctopusClient,
  buildShieldTransaction,
  buildUnshieldTransaction,
  buildTransferTransaction,
  buildSwapTransaction,
  hexToBytes,
  bytesToHex,
  TESTNET_CONFIG,
  type SuiConfig,
} from "./sui.js";

// Merkle tree utilities
export {
  ClientMerkleTree,
  buildMerkleTreeFromEvents,
  getMerkleProofForNote,
  type CommitmentLeaf,
} from "./merkle.js";

// DeFi operations (Private Swaps)
export {
  buildSwapInput,
  generateSwapProof,
  calculateMinAmountOut,
  estimateSwapOutput,
  type SwapParams,
  type SwapInput,
  type SwapCircuitInput,
  type SuiSwapProof,
} from "./defi.js";

// DEX Integration (Cetus price fetching)
export {
  getCetusPool,
  estimateCetusSwap,
  findCetusPool,
  getCetusPrice,
  calculateMinOutput,
  CETUS_TESTNET_POOLS,
  type CetusPoolConfig,
  type SwapEstimation,
} from "./dex.js";
