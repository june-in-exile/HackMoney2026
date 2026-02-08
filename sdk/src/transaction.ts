/**
 * Octopus SDK - Sui Transaction Builders
 *
 * Builds and executes shield/unshield transactions on Sui.
 */

import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import { type SuiUnshieldProof, type SuiTransferProof, type SuiSwapProof } from "./types.js";

/**
 * Sui client configuration
 */
export interface SuiConfig {
  /** Sui RPC endpoint */
  rpcUrl: string;
  /** Package ID of deployed Octopus contract */
  packageId: string;
  /** Pool object ID (shared object) */
  poolId: string;
}

/**
 * Default testnet configuration
 */
export const TESTNET_CONFIG: Partial<SuiConfig> = {
  rpcUrl: "https://fullnode.testnet.sui.io:443",
};

/**
 * Build a shield transaction (for manual signing)
 */
export function buildShieldTransaction<T extends string>(
  packageId: string,
  poolId: string,
  coinType: T,
  coinObjectId: string,
  commitment: Uint8Array,
  encryptedNote: Uint8Array
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::pool::shield`,
    typeArguments: [coinType],
    arguments: [
      tx.object(poolId),
      tx.object(coinObjectId),
      tx.pure.vector("u8", Array.from(commitment)),
      tx.pure.vector("u8", Array.from(encryptedNote)),
    ],
  });

  return tx;
}

/**
 * Build an unshield transaction (for manual signing)
 *
 * Note: The amount is NOT a separate parameter - it's embedded in the public inputs.
 * The contract extracts it from bytes 96-127 of public_inputs_bytes.
 * To see the actual amount, check the UnshieldEvent in the transaction events.
 */
export function buildUnshieldTransaction<T extends string>(
  packageId: string,
  poolId: string,
  coinType: T,
  proof: SuiUnshieldProof,
  recipient: string,
  encryptedChangeNote: Uint8Array
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::pool::unshield`,
    typeArguments: [coinType],
    arguments: [
      tx.object(poolId),
      tx.pure.vector("u8", Array.from(proof.proofBytes)),
      tx.pure.vector("u8", Array.from(proof.publicInputsBytes)),
      tx.pure.address(recipient),
      tx.pure.vector("u8", Array.from(encryptedChangeNote)),
    ],
  });

  return tx;
}

/**
 * Build a transfer transaction (for manual signing)
 */
export function buildTransferTransaction<T extends string>(
  packageId: string,
  poolId: string,
  coinType: T,
  proof: SuiTransferProof,
  encryptedNotes: Uint8Array[]
): Transaction {
  if (encryptedNotes.length !== 2) {
    throw new Error(`Expected 2 encrypted notes, got ${encryptedNotes.length}`);
  }

  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::pool::transfer`,
    typeArguments: [coinType],
    arguments: [
      tx.object(poolId),
      tx.pure.vector("u8", Array.from(proof.proofBytes)),
      tx.pure.vector("u8", Array.from(proof.publicInputsBytes)),
      tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize(encryptedNotes).toBytes()),
    ],
  });

  return tx;
}

/**
 * Build a swap transaction (for manual signing)
 *
 * @param packageId - Octopus package ID
 * @param poolInId - Input token pool ID
 * @param poolOutId - Output token pool ID
 * @param deepbookPoolId - DeepBook pool ID for swap execution
 * @param coinTypeIn - Input token type (e.g., "0x2::sui::SUI")
 * @param coinTypeOut - Output token type (e.g., "0x...::usdc::USDC")
 * @param proof - Swap ZK proof
 * @param amountIn - Amount to swap in
 * @param minAmountOut - Minimum amount out (slippage protection)
 * @param encryptedOutputNote - Encrypted note for output token
 * @param encryptedChangeNote - Encrypted note for change token
 */
export function buildSwapTransaction<TokenIn extends string, TokenOut extends string>(
  packageId: string,
  poolInId: string,
  poolOutId: string,
  deepbookPoolId: string,
  coinTypeIn: TokenIn,
  coinTypeOut: TokenOut,
  proof: SuiSwapProof,
  amountIn: bigint,
  minAmountOut: bigint,
  encryptedOutputNote: Uint8Array,
  encryptedChangeNote: Uint8Array
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::pool::swap`,
    typeArguments: [coinTypeIn, coinTypeOut],
    arguments: [
      tx.object(poolInId),
      tx.object(poolOutId),
      tx.object(deepbookPoolId),
      tx.pure.vector("u8", Array.from(proof.proofBytes)),
      tx.pure.vector("u8", Array.from(proof.publicInputsBytes)),
      tx.pure.u64(amountIn),
      tx.pure.u64(minAmountOut),
      tx.pure.vector("u8", Array.from(encryptedOutputNote)),
      tx.pure.vector("u8", Array.from(encryptedChangeNote)),
    ],
  });

  return tx;
}