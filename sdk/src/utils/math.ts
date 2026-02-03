/**
 * Mathematical utility functions for DeFi operations
 */

/**
 * Calculate minimum output amount with slippage protection
 *
 * Used for swap operations to protect against excessive slippage.
 * Example: If expecting 100 USDC with 0.5% slippage (50 bps),
 * minimum output = 100 * (10000 - 50) / 10000 = 99.5 USDC
 *
 * @param expectedOutput - Expected output amount
 * @param slippageBps - Slippage tolerance in basis points (e.g., 50 = 0.5%, 100 = 1%)
 * @returns Minimum acceptable output amount
 */
export function calculateMinOutput(
  expectedOutput: bigint,
  slippageBps: number
): bigint {
  if (slippageBps < 0 || slippageBps > 10000) {
    throw new Error(`Invalid slippage: ${slippageBps} bps (must be 0-10000)`);
  }
  return (expectedOutput * BigInt(10000 - slippageBps)) / 10000n;
}

/**
 * Calculate percentage change between two values
 *
 * @param oldValue - Original value
 * @param newValue - New value
 * @returns Percentage change (positive for increase, negative for decrease)
 */
export function calculatePercentageChange(
  oldValue: bigint,
  newValue: bigint
): number {
  if (oldValue === 0n) {
    return newValue === 0n ? 0 : Infinity;
  }
  const change = Number(newValue - oldValue);
  const percent = (change / Number(oldValue)) * 100;
  return percent;
}

/**
 * Calculate price impact for a swap
 *
 * @param inputValue - Input amount
 * @param outputValue - Actual output amount received
 * @param expectedOutput - Expected output without price impact
 * @returns Price impact percentage (0-100)
 */
export function calculatePriceImpact(
  inputValue: bigint,
  outputValue: bigint,
  expectedOutput: bigint
): number {
  if (expectedOutput === 0n) {
    return 0;
  }
  const impact = Math.abs(Number(outputValue - expectedOutput) / Number(expectedOutput)) * 100;
  return impact;
}
