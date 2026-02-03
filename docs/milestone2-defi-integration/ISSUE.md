# Issue: Estimated USDC Amount Shows 0

**Problem:** When using the Swap feature to exchange SUI for USDC, after entering a SUI amount, the estimated USDC output amount displays as **0** instead of showing the expected value.

**Root Cause:**

The issue stems from multiple problems in the swap estimation flow:

1. **Placeholder Implementation** ([sdk/src/defi.ts:351-364](../../sdk/src/defi.ts#L351-L364))
   - `estimateSwapOutput()` is a mock function that returns a 1:1 ratio
   - Does not fetch real prices from Cetus DEX
   - Ignores actual market exchange rates

2. **Invalid Pool Configuration** ([frontend/src/components/SwapForm.tsx:85](../../frontend/src/components/SwapForm.tsx#L85))
   - Hardcoded `"CETUS_POOL_ID"` string literal instead of real pool object ID
   - Mock token identifiers created by slicing type strings (lines 80-81)
   - Pool lookup fails, triggering silent error

3. **Silent Error Handling** ([frontend/src/components/SwapForm.tsx:94-95](../../frontend/src/components/SwapForm.tsx#L94-L95))
   - Errors are caught and amount is set to `"0"` without user feedback
   - Console shows error but UI doesn't display helpful message

4. **Decimal Format Mismatch**
   - SUI uses 9 decimals (1e9 MIST per SUI)
   - USDC uses 6 decimals (1e6 micro-USDC per USDC)
   - Output formatted with wrong decimal places

**Impact:**

- Users cannot see realistic swap estimates
- Cannot make informed decisions about slippage tolerance
- Poor user experience (shows 0 with no explanation)

**Solution:**

**Quick Fix (Mock Price):**

Update `estimateSwapOutput()` in [sdk/src/defi.ts](../../sdk/src/defi.ts) to use a realistic mock price:

```typescript
export async function estimateSwapOutput(
  dexPoolId: string,
  tokenIn: bigint,
  tokenOut: bigint,
  amountIn: bigint
): Promise<{ amountOut: bigint; priceImpact: number }> {
  // Mock SUI/USDC price: ~$2.50 per SUI
  const mockSuiPriceInUsdc = 2.5;

  // Convert considering decimal differences
  // SUI: 9 decimals, USDC: 6 decimals
  const amountInSui = Number(amountIn) / 1e9;
  const amountOutUsdc = amountInSui * mockSuiPriceInUsdc;
  const amountOutUsdcRaw = BigInt(Math.floor(amountOutUsdc * 1e6));

  console.warn("Using mock swap estimation (~$2.50/SUI). Implement real DEX integration.");

  return {
    amountOut: amountOutUsdcRaw,
    priceImpact: 0,
  };
}
```

**Long-Term Solution (Real DEX Integration):**

The SDK already has complete Cetus integration in [sdk/src/dex.ts](../../sdk/src/dex.ts) with:

- `estimateCetusSwap()` - Queries real pool prices
- `getCetusPool()` - Fetches pool information from blockchain
- `calculateSwapOutput()` - Implements CLMM math for accurate pricing

**Infrastructure Requirements:**

- **Multi-Pool Deployment**: For a real-world scenario, separate privacy pools for each token (e.g., a SUI pool and a USDC pool) must be deployed to hold liquidity. This is a prerequisite for configuring pool IDs in the frontend.

**Implementation steps:**

1. **Configure Pool IDs** in [frontend/src/lib/constants.ts](../../frontend/src/lib/constants.ts):

   ```typescript
   export const CETUS_POOLS = {
     "SUI/USDC": "0x..." // Real Cetus pool object ID
   };
   ```

2. **Update SwapForm** to use real pool queries:

   ```typescript
   import { estimateCetusSwap } from "@octopus/sdk/dex";

   const { amountOut, priceImpact } = await estimateCetusSwap(
     suiClient,
     CETUS_POOLS["SUI/USDC"],
     amountInBigInt,
     true // a_to_b direction
   );
   ```

3. **Add Error Handling** in SwapForm:

   ```typescript
   catch (err) {
     console.error("Failed to estimate output:", err);
     setAmountOut("0");
     setError("Unable to fetch price. Please try again."); // User feedback
   }
   ```

4. **Handle Decimal Conversions** properly:
   - Use `parseSui()` for SUI amounts (9 decimals)
   - Use custom `parseUsdc()` for USDC amounts (6 decimals)
   - Format output with correct decimals for target token

**Status:** Mock implementation acceptable for testing. Real DEX integration required for production use.
