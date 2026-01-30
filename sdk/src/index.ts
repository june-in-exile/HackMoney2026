/**
 * Railgun on Sui SDK
 *
 * A TypeScript SDK for interacting with the Railgun privacy protocol on Sui.
 *
 * @example
 * ```typescript
 * import {
 *   initPoseidon,
 *   generateKeypair,
 *   createNote,
 *   generateUnshieldProof,
 *   convertProofToSui,
 *   RailgunClient,
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
 * const client = new RailgunClient(config);
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
  encryptNote,
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
  RailgunClient,
  buildShieldTransaction,
  buildUnshieldTransaction,
  hexToBytes,
  bytesToHex,
  TESTNET_CONFIG,
  type SuiConfig,
} from "./sui.js";
