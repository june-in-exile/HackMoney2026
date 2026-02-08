# DeepBook Integration for Octopus Privacy Protocol

## Context

The Octopus privacy protocol currently uses a mock 1:1 swap implementation for testing purposes. The implementation uses **DeepBook integration** as the primary DEX. DeepBook V3 is Sui's native Central Limit Order Book (CLOB) that provides shared liquidity across the entire Sui ecosystem with lower slippage (<0.05%) compared to typical AMMs.

### Why This Change?

- DeepBook is Sui's native liquidity infrastructure (not a user-facing DEX)
- Provides deeper liquidity and better price discovery through order book model
- Lower fees when using DEEP tokens (though we'll use input token for simplicity)
- Well-documented API with direct swap functions that maintain privacy

### User Requirements

Based on user preferences:
1. **Account Management**: Auto-create BalanceManager transparently (or use direct swaps)
2. **Fee Payment**: Use input token to pay fees (simpler than requiring DEEP)
3. **Multi-DEX Strategy**: Design for extensibility - start with DeepBook, allow adding others later

### Current Implementation State

- **ZK Circuit**: ✅ Production-ready (22,553 constraints), no changes needed
- **Smart Contract**: Mock swap at `pool.move:650`, ready for DEX integration
- **SDK**: Proof generation working, needs DeepBook price estimation
- **Frontend**: UI complete, uses hardcoded mock prices

---

## Implementation Plan

### Architecture: DEX Adapter Pattern

We'll use an adapter pattern to isolate DEX-specific logic, making it easy to add other DEXes (e.g., Turbos) later:

```
┌──────────────────────────────────────┐
│    Swap Interface (Abstract)         │
│  • estimateSwap()                    │
│  • executeSwap()                     │
│  • getPrice()                        │
└──────────────────────────────────────┘
           ▲                ▲
           │                │
    ┌──────┴─────┐   ┌──────┴─────┐
    │ DeepBook   │   │   Turbos   │
    │  Adapter   │   │  Adapter   │
    │            │   │  (Future)  │
    └────────────┘   └────────────┘
```

---

## Phase 1: Smart Contract Layer (Priority 1)

### File: `contracts/Move.toml`

**Add DeepBook dependency:**

```toml
[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "framework/testnet" }
DeepBookV3 = { git = "https://github.com/MystenLabs/deepbookv3.git", subdir = "packages/deepbook", rev = "main" }

[addresses]
octopus = "0x0"
deepbook = "0x2c8d603bc51326b8c13cef9dd07031a408a48dddb541963357661df5d3204809"
```

### File: `contracts/sources/pool.move`

#### Change 1: Add DeepBook Imports (after line 9)

```move
// DeepBook V3 integration for real market-rate swaps
use deepbook::pool::{Self as deepbook_pool, Pool as DeepBookPool};
use deepbook::clob_v2::{Self as deepbook_clob};
```

#### Change 2: Update `swap_production()` Function Signature (line 573)

**Add parameter for DeepBook pool:**

```move
public fun swap_production<TokenIn, TokenOut>(
    pool_in: &mut PrivacyPool<TokenIn>,
    pool_out: &mut PrivacyPool<TokenOut>,
    deepbook_pool: &mut DeepBookPool<TokenIn, TokenOut>,  // NEW
    proof_bytes: vector<u8>,
    public_inputs_bytes: vector<u8>,
    amount_in: u64,
    min_amount_out: u64,
    encrypted_output_note: vector<u8>,
    encrypted_change_note: vector<u8>,
    ctx: &mut TxContext,
)
```

#### Change 3: Replace Mock Swap Logic (lines 618-660)

**Replace the entire mock swap section with:**

```move
// 6. Execute swap through DeepBook V3
assert!(balance::value(&pool_in.balance) >= amount_in, E_INSUFFICIENT_BALANCE);
let coin_in = coin::take(&mut pool_in.balance, amount_in, ctx);

// Place market order on DeepBook using direct swap
// This maintains privacy by not requiring BalanceManager
let (coin_out, coin_remainder) = deepbook_pool::place_market_order(
    deepbook_pool,
    true,  // is_bid: buying TokenOut with TokenIn
    amount_in,
    coin_in,
    coin::zero<TokenOut>(ctx),  // base_coin_ret (empty for bid orders)
    ctx
);

// Verify slippage protection
let amount_out = coin::value(&coin_out);
assert!(amount_out >= min_amount_out, E_INSUFFICIENT_BALANCE);

// Handle any remainder (should be minimal for market orders)
if (coin::value(&coin_remainder) > 0) {
    balance::join(&mut pool_in.balance, coin::into_balance(coin_remainder));
} else {
    coin::destroy_zero(coin_remainder);
};

// Shield output tokens into output pool
balance::join(&mut pool_out.balance, coin::into_balance(coin_out));
```

#### Change 4: Add New Error Codes (after line 30)

```move
const E_DEEPBOOK_SWAP_FAILED: u64 = 7;
const E_INVALID_POOL_ID: u64 = 8;
```

---

## Phase 2: SDK Layer (Priority 2)

### New File: `sdk/src/dex/deepbook.ts`

Create comprehensive DeepBook integration module:

```typescript
import { SuiClient } from "@mysten/sui/client";

// DeepBook V3 package addresses
export const DEEPBOOK_PACKAGE_ID = {
  mainnet: "0x2c8d603bc51326b8c13cef9dd07031a408a48dddb541963357661df5d3204809",
  testnet: "0x...", // TBD from Sui testnet
};

// Known pool configurations
export const DEEPBOOK_POOLS = {
  "SUI/USDC": {
    poolId: "0x...", // TBD: Real DeepBook pool ID
    baseToken: "0x2::sui::SUI",
    quoteToken: "0x...", // TBD: Real USDC type
    tickSize: "1000000",
    lotSize: "1000000000",
    minSize: "1000000",
  },
};

export interface DeepBookPoolInfo {
  poolId: string;
  baseToken: string;
  quoteToken: string;
  bestBid: bigint;
  bestAsk: bigint;
  bidDepth: bigint;
  askDepth: bigint;
}

export interface SwapEstimation {
  amountOut: bigint;
  priceImpact: number;
  effectivePrice: number;
  feeAmount: bigint;
}

/**
 * Fetch DeepBook pool state
 */
export async function getDeepBookPool(
  client: SuiClient,
  poolId: string
): Promise<DeepBookPoolInfo> {
  const poolObject = await client.getObject({
    id: poolId,
    options: { showContent: true },
  });

  if (!poolObject.data?.content || poolObject.data.content.dataType !== "moveObject") {
    throw new Error(`Invalid DeepBook pool: ${poolId}`);
  }

  const fields = poolObject.data.content.fields as Record<string, any>;

  return {
    poolId,
    baseToken: fields.base_asset || "",
    quoteToken: fields.quote_asset || "",
    bestBid: BigInt(fields.best_bid_price || 0),
    bestAsk: BigInt(fields.best_ask_price || 0),
    bidDepth: BigInt(fields.bid_depth || 0),
    askDepth: BigInt(fields.ask_depth || 0),
  };
}

/**
 * Estimate swap output from DeepBook order book
 */
export async function estimateDeepBookSwap(
  client: SuiClient,
  poolId: string,
  amountIn: bigint,
  isBid: boolean
): Promise<SwapEstimation> {
  const pool = await getDeepBookPool(client, poolId);

  const price = isBid ? pool.bestAsk : pool.bestBid;
  const depth = isBid ? pool.askDepth : pool.bidDepth;

  // Estimate output (simplified - real calculation needs full order book walk)
  const amountOut = (amountIn * price) / BigInt(1e9);

  // Calculate price impact
  const priceImpact = Number(amountIn) / Number(depth) * 100;

  // Estimate fees (0.25% taker fee)
  const feeRate = 0.0025;
  const feeAmount = (amountIn * BigInt(Math.floor(feeRate * 1e9))) / BigInt(1e9);

  return {
    amountOut: amountOut - feeAmount,
    priceImpact,
    effectivePrice: Number(amountOut) / Number(amountIn),
    feeAmount,
  };
}

/**
 * Get current mid-market price
 */
export async function getDeepBookPrice(
  client: SuiClient,
  poolId: string
): Promise<number> {
  const pool = await getDeepBookPool(client, poolId);
  const midPrice = (pool.bestBid + pool.bestAsk) / 2n;
  return Number(midPrice) / 1e9;
}

/**
 * Find DeepBook pool for token pair
 */
export async function findDeepBookPool(
  tokenA: string,
  tokenB: string
): Promise<string | null> {
  const key = `${tokenA}/${tokenB}`;
  if (DEEPBOOK_POOLS[key]) {
    return DEEPBOOK_POOLS[key].poolId;
  }

  const reverseKey = `${tokenB}/${tokenA}`;
  if (DEEPBOOK_POOLS[reverseKey]) {
    return DEEPBOOK_POOLS[reverseKey].poolId;
  }

  return null;
}
```

### New File: `sdk/src/dex/adapter.ts`

Create extensible DEX adapter interface:

```typescript
/**
 * Abstract DEX adapter for extensibility
 */

export interface SwapEstimateParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
}

export abstract class DexAdapter {
  abstract name: string;
  abstract estimateSwap(params: SwapEstimateParams): Promise<SwapEstimation>;
  abstract findPool(tokenA: string, tokenB: string): Promise<string | null>;
  abstract getPrice(poolId: string): Promise<number>;
}

export class DeepBookAdapter extends DexAdapter {
  name = "DeepBook";

  constructor(private client: SuiClient) {
    super();
  }

  async estimateSwap(params: SwapEstimateParams): Promise<SwapEstimation> {
    const poolId = await this.findPool(params.tokenIn, params.tokenOut);
    if (!poolId) throw new Error("Pool not found");

    const isBid = true; // Determine from token order
    return estimateDeepBookSwap(this.client, poolId, params.amountIn, isBid);
  }

  async findPool(tokenA: string, tokenB: string): Promise<string | null> {
    return findDeepBookPool(tokenA, tokenB);
  }

  async getPrice(poolId: string): Promise<number> {
    return getDeepBookPrice(this.client, poolId);
  }
}

// Future: Add other DEX adapters here (e.g., TurbosAdapter)
```

### Update File: `sdk/src/dex.ts`

**Add re-exports:**

```typescript
// Re-export DeepBook functions
export {
  getDeepBookPool,
  estimateDeepBookSwap,
  getDeepBookPrice,
  findDeepBookPool,
  DEEPBOOK_POOLS,
  DEEPBOOK_PACKAGE_ID,
} from "./dex/deepbook.js";

export {
  DexAdapter,
  DeepBookAdapter,
  type SwapEstimateParams,
} from "./dex/adapter.js";
```

### Update File: `sdk/src/transaction.ts`

**Modify `buildSwapTransaction()` (line 133):**

```typescript
export function buildSwapTransaction<TokenIn extends string, TokenOut extends string>(
  packageId: string,
  poolInId: string,
  poolOutId: string,
  coinTypeIn: TokenIn,
  coinTypeOut: TokenOut,
  proof: SuiSwapProof,
  amountIn: bigint,
  minAmountOut: bigint,
  encryptedOutputNote: Uint8Array,
  encryptedChangeNote: Uint8Array,
  deepbookPoolId: string  // NEW PARAMETER
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::pool::swap_production`,
    typeArguments: [coinTypeIn, coinTypeOut],
    arguments: [
      tx.object(poolInId),
      tx.object(poolOutId),
      tx.object(deepbookPoolId),  // NEW: DeepBook pool
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
```

---

## Phase 3: Frontend Layer (Priority 3)

### Update File: `frontend/src/lib/constants.ts`

**Add DeepBook configuration (after line 52):**

```typescript
// DeepBook V3 configuration
export const DEEPBOOK_PACKAGE_ID = (() => {
  const id = process.env.NEXT_PUBLIC_DEEPBOOK_PACKAGE_ID;
  if (!id) {
    // Default to testnet package
    return "0x..."; // TBD: DeepBook testnet package
  }
  return id;
})();

// DeepBook pool IDs
export const DEEPBOOK_POOLS = {
  "SUI/USDC": process.env.NEXT_PUBLIC_DEEPBOOK_SUI_USDC_POOL || "0x...",
} as const;

// Token configurations with Octopus privacy pool IDs
export const TOKENS = {
  SUI: {
    type: "0x2::sui::SUI",
    symbol: "SUI",
    decimals: 9,
    poolId: POOL_ID, // Octopus privacy pool (existing)
  },
  USDC: {
    type: process.env.NEXT_PUBLIC_USDC_TYPE || "0x...", // TBD: Real USDC type
    symbol: "USDC",
    decimals: 6,
    poolId: process.env.NEXT_PUBLIC_USDC_POOL_ID || "0x...", // TBD: Deploy new Octopus USDC pool
  },
} as const;
```

### Update File: `frontend/src/components/SwapForm.tsx`

#### Change 1: Remove Mock Prices (line 45-48)

**Delete:**
```typescript
const MOCK_PRICES = {
  SUI_USDC: 3.0,
  USDC_SUI: 1/3.0,
};
```

**Add imports:**
```typescript
import {
  estimateDeepBookSwap,
  findDeepBookPool,
  DeepBookAdapter,
} from "@june_zk/octopus-sdk";
import { DEEPBOOK_POOLS, TOKENS } from "@/lib/constants";
```

#### Change 2: Replace Price Estimation (lines 91-140)

```typescript
// Estimate output amount using real DeepBook prices
useEffect(() => {
  const estimateOutput = async () => {
    if (!amountIn || parseFloat(amountIn) <= 0) {
      setAmountOut("");
      setPriceImpact(0);
      return;
    }

    setIsEstimating(true);
    try {
      const amountInBigInt = parseSui(amountIn, TOKENS[tokenIn].decimals);

      // Find DeepBook pool
      const poolId = await findDeepBookPool(
        TOKENS[tokenIn].type,
        TOKENS[tokenOut].type
      );

      if (!poolId) {
        throw new Error(`No DeepBook pool found for ${tokenIn}/${tokenOut}`);
      }

      // Get real-time estimation
      const isBid = tokenIn === "SUI";
      const estimation = await estimateDeepBookSwap(
        client,
        poolId,
        amountInBigInt,
        isBid
      );

      const amountOutFloat = Number(estimation.amountOut) /
        Math.pow(10, TOKENS[tokenOut].decimals);

      setAmountOut(amountOutFloat.toFixed(TOKENS[tokenOut].decimals));
      setPriceImpact(estimation.priceImpact);
    } catch (err) {
      console.error("Price estimation failed:", err);
      setAmountOut("0");
      setError(err instanceof Error ? err.message : "Failed to get price");
    } finally {
      setIsEstimating(false);
    }
  };

  const debounce = setTimeout(estimateOutput, 500);
  return () => clearTimeout(debounce);
}, [amountIn, tokenIn, tokenOut, client]);
```

#### Change 3: Update Transaction Building (lines 374-384)

```typescript
// Build transaction with DeepBook pool ID
const deepbookPoolId = await findDeepBookPool(
  TOKENS[tokenIn].type,
  TOKENS[tokenOut].type
);

if (!deepbookPoolId) {
  throw new Error("DeepBook pool not found");
}

const tx = buildSwapTransaction(
  PACKAGE_ID,
  TOKENS[tokenIn].poolId,
  TOKENS[tokenOut].poolId,
  TOKENS[tokenIn].type,
  TOKENS[tokenOut].type,
  suiProof,
  amountInBigInt,
  minAmountOut,
  encryptedOutputNote,
  encryptedChangeNote,
  deepbookPoolId  // NEW: Pass DeepBook pool ID
);
```

#### Change 4: Update UI Message (line 422)

```typescript
<div className="p-3 border border-cyber-blue/30 bg-cyber-blue/10 clip-corner">
  <div className="flex items-start gap-2">
    <span className="text-cyber-blue text-sm">ⓘ</span>
    <p className="text-xs text-cyber-blue font-mono leading-relaxed">
      Real-time prices from DeepBook. Updates every 3 seconds.
    </p>
  </div>
</div>
```

### New File: `.env.example` Updates

```bash
# Existing
NEXT_PUBLIC_PACKAGE_ID=0x...
NEXT_PUBLIC_POOL_ID=0x...
NEXT_PUBLIC_NETWORK=testnet

# DeepBook Integration (NEW)
NEXT_PUBLIC_DEEPBOOK_PACKAGE_ID=0x2c8d603bc51326b8c13cef9dd07031a408a48dddb541963357661df5d3204809
NEXT_PUBLIC_DEEPBOOK_SUI_USDC_POOL=0x...

# Token Types (NEW)
NEXT_PUBLIC_USDC_TYPE=0x...::usdc::USDC
NEXT_PUBLIC_USDC_POOL_ID=0x...  # Octopus USDC privacy pool
```

---

## Configuration Values Needed

Before deployment, obtain these values:

### 1. DeepBook Package ID
- **Mainnet**: `0x2c8d603bc51326b8c13cef9dd07031a408a48dddb541963357661df5d3204809`
- **Testnet**: Query Sui testnet explorer or DeepBook docs

### 2. DeepBook Pool IDs
- **SUI/USDC Pool**: Query DeepBook registry for active pools
- Use `sui client call --package <deepbook> --module pool --function list_pools`

### 3. USDC Token Type
- Find official USDC deployment on Sui testnet
- Check Sui Foundation's token list or testnet faucet

### 4. Deploy Octopus USDC Privacy Pool
- Run: `sui client publish` with USDC type parameter
- Store pool ID in `NEXT_PUBLIC_USDC_POOL_ID`

---

## Testing Strategy

### Unit Tests

**Contract Tests (`contracts/sources/tests/`):**
- Test DeepBook swap with mock pool
- Verify proof verification still works
- Test slippage protection
- Test error cases (insufficient liquidity, invalid pool)

**SDK Tests (`sdk/src/dex/deepbook.test.ts`):**
- Test pool fetching
- Test price estimation
- Test pool discovery
- Test adapter pattern

### Integration Tests

**End-to-End Flow:**
1. Shield SUI into privacy pool
2. Execute swap SUI → USDC (via DeepBook)
3. Verify output note created
4. Verify amounts match estimation (within slippage)
5. Unshield USDC to wallet

### Manual Testing Checklist

Pre-deployment:
- [ ] `sui move build` succeeds
- [ ] `sui move test` passes all tests
- [ ] `npm run build` in sdk/ succeeds
- [ ] `npm test` in sdk/ passes
- [ ] `npm run build` in frontend/ succeeds
- [ ] No TypeScript errors

Post-deployment:
- [ ] Deploy USDC privacy pool
- [ ] Verify DeepBook pool has liquidity
- [ ] Test small swap (0.1 SUI → USDC)
- [ ] Test reverse swap (USDC → SUI)
- [ ] Test slippage protection (set very tight slippage)
- [ ] Monitor gas costs
- [ ] Verify privacy maintained (no leakage)

---

## Verification

### How to Test End-to-End

1. **Setup**
   ```bash
   cd contracts
   sui move build
   sui move test

   cd ../sdk
   npm install
   npm run build

   cd ../frontend
   npm install
   npm run build
   npm run dev
   ```

2. **Deploy Contracts**
   ```bash
   sui client publish --gas-budget 500000000
   # Note down PACKAGE_ID and POOL_ID (SUI)

   # Deploy USDC pool
   sui client call --package <PACKAGE_ID> \
     --module pool \
     --function create_shared_pool \
     --type-args "0x...::usdc::USDC" \
     --args <vk_bytes> <transfer_vk_bytes> <swap_vk_bytes> \
     --gas-budget 100000000
   ```

3. **Configure Frontend**
   ```bash
   # Update .env
   NEXT_PUBLIC_PACKAGE_ID=0x...
   NEXT_PUBLIC_POOL_ID=0x...         # SUI pool
   NEXT_PUBLIC_USDC_POOL_ID=0x...    # USDC pool
   NEXT_PUBLIC_DEEPBOOK_SUI_USDC_POOL=0x...
   NEXT_PUBLIC_USDC_TYPE=0x...::usdc::USDC
   ```

4. **Test in Browser**
   - Connect wallet
   - Generate keypair
   - Shield 5 SUI
   - Navigate to SWAP tab
   - Verify real-time prices show (not mock)
   - Execute swap (2 SUI → USDC)
   - Wait for proof generation (30-60s)
   - Verify transaction succeeds
   - Check USDC note created

5. **Verify Privacy**
   - On-chain transaction should NOT reveal amounts
   - Only commitments and nullifiers visible
   - Encrypted notes emitted in events

---

## Critical Files Summary

| File | Changes | Lines | Priority |
|------|---------|-------|----------|
| `contracts/Move.toml` | Add DeepBook dependency | +3 | P1 |
| `contracts/sources/pool.move` | Replace mock swap, add imports | 11-15, 573-695 | P1 |
| `sdk/src/dex/deepbook.ts` | NEW FILE - DeepBook integration | ~200 | P2 |
| `sdk/src/dex/adapter.ts` | NEW FILE - Extensible adapter | ~80 | P2 |
| `sdk/src/dex.ts` | Add re-exports | +10 | P2 |
| `sdk/src/transaction.ts` | Add deepbookPoolId param | 133-163 | P2 |
| `frontend/src/lib/constants.ts` | Add DeepBook config | +30 | P3 |
| `frontend/src/components/SwapForm.tsx` | Real pricing, remove mock | 45-48, 91-140, 374-384 | P3 |
| `.env.example` | Document new variables | +6 | P3 |

---

## Implementation Timeline

**Estimated Duration**: 10 days (1 developer) or 6 days (2 developers)

### Week 1
- **Days 1-2**: Research config values, setup SDK (DeepBook + adapter)
- **Days 3-4**: Contract integration, Move tests
- **Days 5-6**: SDK integration, TypeScript tests

### Week 2
- **Days 7-8**: Frontend updates, end-to-end testing
- **Days 9-10**: Deploy USDC pool, production testing, documentation

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| DeepBook API changes | Pin to specific package version |
| Pool liquidity insufficient | Check depth before swap, show warnings |
| USDC type misconfiguration | Validate against Sui Foundation's list |
| Price manipulation | Use time-weighted average price (future) |
| Gas cost spikes | Monitor and warn users |

---

## Future Enhancements

After DeepBook integration is stable:

1. **Add Alternative DEXes**: Implement additional adapters (e.g., `TurbosAdapter`), allow user to choose DEX
2. **DEX Aggregator**: Auto-route through best price across multiple DEXes
3. **DEEP Token Integration**: Pay fees in DEEP for 20% discount
4. **More Token Pairs**: Add SUI/USDT, USDC/USDT, etc.
5. **Price Oracle**: Time-weighted average price for better slippage protection

---

## Success Criteria

✅ User can execute private swap at real market rates
✅ Prices update in real-time from DeepBook
✅ Slippage protection works correctly
✅ Privacy maintained (amounts hidden on-chain)
✅ All tests passing
✅ Gas costs reasonable (<0.05 SUI per swap)
✅ Architecture supports adding other DEXes later

---

## References

- [DeepBook V3 Documentation](https://docs.sui.io/standards/deepbook)
- [DeepBook Swaps API](https://docs.sui.io/standards/deepbookv3/swaps)
- [DeepBook GitHub](https://github.com/MystenLabs/deepbookv3)
- [Sui Framework](https://github.com/MystenLabs/sui)
