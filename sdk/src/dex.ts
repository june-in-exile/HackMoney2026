/**
 * Octopus SDK - DEX Integration
 *
 * Functions for fetching real-time prices from Cetus DEX
 */

import { SuiClient } from "@mysten/sui/client";


/**
 * Cetus pool configuration
 */
export interface CetusPoolConfig {
  /** Pool object ID */
  poolId: string;
  /** Token A type (e.g., 0x2::sui::SUI) */
  coinTypeA: string;
  /** Token B type (e.g., USDC type) */
  coinTypeB: string;
  /** Current sqrt price (Q64.64 format) */
  currentSqrtPrice: string;
  /** Current tick index */
  currentTickIndex: number;
  /** Total liquidity */
  liquidity: string;
  /** Fee rate (basis points) */
  feeRate: number;
}

/**
 * Swap estimation result
 */
export interface SwapEstimation {
  /** Expected output amount */
  amountOut: bigint;
  /** Price impact percentage (0-100) */
  priceImpact: number;
  /** Effective price */
  effectivePrice: number;
  /** Fee amount */
  feeAmount: bigint;
}

/**
 * Fetch Cetus pool information
 *
 * @param client - Sui client
 * @param poolId - Cetus pool object ID
 * @returns Pool configuration
 */
export async function getCetusPool(
  client: SuiClient,
  poolId: string
): Promise<CetusPoolConfig> {
  try {
    const poolObject = await client.getObject({
      id: poolId,
      options: { showContent: true },
    });

    if (!poolObject.data?.content || poolObject.data.content.dataType !== "moveObject") {
      throw new Error(`Invalid pool object: ${poolId}`);
    }

    const fields = poolObject.data.content.fields as Record<string, any>;

    return {
      poolId,
      coinTypeA: fields.coin_type_a || "",
      coinTypeB: fields.coin_type_b || "",
      currentSqrtPrice: fields.current_sqrt_price || "0",
      currentTickIndex: parseInt(fields.current_tick_index || "0"),
      liquidity: fields.liquidity || "0",
      feeRate: parseInt(fields.fee_rate || "0"),
    };
  } catch (error) {
    console.error("Failed to fetch Cetus pool:", error);
    throw new Error(`Failed to fetch pool ${poolId}: ${error}`);
  }
}

/**
 * Calculate sqrt price from tick index (Cetus CLMM math)
 *
 * @param tick - Tick index
 * @returns Sqrt price in Q64.64 format
 */
function tickToSqrtPrice(tick: number): bigint {
  // Simplified implementation
  // Real implementation requires precise tick math from Cetus SDK
  const price = Math.pow(1.0001, tick);
  const sqrtPrice = Math.sqrt(price);
  return BigInt(Math.floor(sqrtPrice * Math.pow(2, 64)));
}

/**
 * Calculate output amount for a given input (CLMM formula)
 *
 * @param amountIn - Input amount
 * @param sqrtPriceX64 - Current sqrt price (Q64.64)
 * @param liquidity - Pool liquidity
 * @param feeRate - Fee rate in basis points
 * @param a2b - True if swapping A to B
 * @returns Output amount
 */
function calculateSwapOutput(
  amountIn: bigint,
  sqrtPriceX64: bigint,
  liquidity: bigint,
  feeRate: number,
  a2b: boolean
): { amountOut: bigint; feeAmount: bigint } {
  // Apply fee
  const feeAmount = (amountIn * BigInt(feeRate)) / 10000n;
  const amountInAfterFee = amountIn - feeAmount;

  // Simplified CLMM calculation
  // Real implementation requires Cetus SDK's precise math
  // This is a mock calculation for demonstration

  // For A→B: output = amountIn * price
  // For B→A: output = amountIn / price

  // Extract price from sqrt (approximate)
  const Q64 = 2n ** 64n;
  const price = (sqrtPriceX64 * sqrtPriceX64) / (Q64 * Q64);

  let amountOut: bigint;
  if (a2b) {
    // Swap A to B: multiply by price
    amountOut = (amountInAfterFee * price) / Q64;
  } else {
    // Swap B to A: divide by price
    amountOut = (amountInAfterFee * Q64) / price;
  }

  return { amountOut, feeAmount };
}

/**
 * Estimate swap output from Cetus pool
 *
 * @param client - Sui client
 * @param poolId - Cetus pool object ID
 * @param amountIn - Input amount
 * @param a2b - True if swapping coin A to coin B
 * @returns Swap estimation
 */
export async function estimateCetusSwap(
  client: SuiClient,
  poolId: string,
  amountIn: bigint,
  a2b: boolean
): Promise<SwapEstimation> {
  const pool = await getCetusPool(client, poolId);

  const sqrtPriceX64 = BigInt(pool.currentSqrtPrice);
  const liquidity = BigInt(pool.liquidity);

  const { amountOut, feeAmount } = calculateSwapOutput(
    amountIn,
    sqrtPriceX64,
    liquidity,
    pool.feeRate,
    a2b
  );

  // Calculate price impact
  const inputValue = Number(amountIn) / 1e9; // Assume 9 decimals
  const outputValue = Number(amountOut) / 1e6; // Assume 6 decimals for stablecoin
  const expectedOutput = a2b
    ? inputValue * Number(sqrtPriceX64) / Math.pow(2, 64)
    : inputValue / (Number(sqrtPriceX64) / Math.pow(2, 64));

  const priceImpact = Math.abs((outputValue - expectedOutput) / expectedOutput) * 100;

  // Calculate effective price
  const effectivePrice = Number(amountOut) / Number(amountIn);

  return {
    amountOut,
    priceImpact,
    effectivePrice,
    feeAmount,
  };
}

/**
 * Find Cetus pool for token pair
 *
 * @param client - Sui client
 * @param tokenA - Token A type
 * @param tokenB - Token B type
 * @returns Pool ID if found
 */
export async function findCetusPool(
  client: SuiClient,
  tokenA: string,
  tokenB: string
): Promise<string | null> {
  // This requires querying Cetus factory contract
  // For now, return null - pools must be provided manually

  console.warn(
    "Pool discovery not implemented. Please provide pool ID manually."
  );
  console.info(`Looking for pool: ${tokenA} <-> ${tokenB}`);

  return null;
}

/**
 * Get current price from Cetus pool
 *
 * @param client - Sui client
 * @param poolId - Pool object ID
 * @returns Current price (token B per token A)
 */
export async function getCetusPrice(
  client: SuiClient,
  poolId: string
): Promise<number> {
  const pool = await getCetusPool(client, poolId);
  const sqrtPrice = BigInt(pool.currentSqrtPrice);
  const Q64 = 2n ** 64n;

  // price = (sqrtPrice / 2^64)^2
  const price = Number((sqrtPrice * sqrtPrice) / (Q64 * Q64));

  return price;
}

// calculateMinOutput moved to utils/math.ts
// Re-exported from import above for backward compatibility


/**
 * Known Cetus testnet pools
 */
export const CETUS_TESTNET_POOLS = {
  /** SUI/USDC pool ID (update with real testnet pool) */
  SUI_USDC: "0x...",
  /** SUI/USDT pool ID (update with real testnet pool) */
  SUI_USDT: "0x...",
};
