import { SuiClient } from "@mysten/sui/client";
import type { SwapEstimation } from "./deepbook.js";

/**
 * Generic DEX adapter interface for extensibility
 *
 * This interface allows multiple DEX implementations (DeepBook, Turbos, etc.)
 * to be used interchangeably in the Octopus privacy protocol.
 */
export interface DexAdapter {
  /** DEX name for identification */
  name: string;

  /**
   * Estimate swap output
   *
   * @param client - Sui client instance
   * @param poolId - DEX pool object ID
   * @param amountIn - Input amount in smallest units
   * @param isBid - true if buying base with quote, false otherwise
   * @returns Swap estimation with output amount and fees
   */
  estimateSwap(
    client: SuiClient,
    poolId: string,
    amountIn: bigint,
    isBid: boolean
  ): Promise<SwapEstimation>;

  /**
   * Get current price from DEX
   *
   * @param client - Sui client instance
   * @param poolId - DEX pool object ID
   * @returns Current mid-market price
   */
  getPrice(client: SuiClient, poolId: string): Promise<number>;
}
