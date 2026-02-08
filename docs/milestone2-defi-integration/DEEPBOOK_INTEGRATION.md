# DeepBook Integration for Octopus Privacy Protocol

## Overview

This document outlines the integration of DeepBook V3 into the Octopus privacy protocol to enable real market-rate swaps while maintaining full privacy guarantees. DeepBook V3 is Sui's native Central Limit Order Book (CLOB) that provides shared liquidity across the entire Sui ecosystem with lower slippage (<0.05%) compared to typical AMMs.

### Why DeepBook?

- **Native Liquidity Infrastructure**: DeepBook is Sui's built-in liquidity layer (not a user-facing DEX)
- **Superior Liquidity**: Shared liquidity pool across all Sui dApps reduces slippage
- **Order Book Model**: Better price discovery through CLOB mechanism
- **Well-Documented API**: Direct swap functions that maintain privacy without complex account management
- **Lower Fees**: 0.25% taker fee (0.2% if paid in DEEP tokens)

### Design Goals

1. **Privacy First**: Maintain full zero-knowledge properties - no amount or identity leakage
2. **Extensibility**: Design DEX adapter pattern to allow future addition of other DEXes (e.g., Turbos)
3. **Simplicity**: Use direct swap functions to avoid BalanceManager complexity
4. **User Experience**: Real-time pricing with transparent slippage protection

### Current Implementation State

- **ZK Circuit**: ✅ Production-ready (22,553 constraints), no changes needed
- **Smart Contract**: Mock swap at `pool.move:650`, ready for DEX integration
- **SDK**: Proof generation working, needs DeepBook price estimation
- **Frontend**: UI complete, uses hardcoded mock prices

---

## Implementation Plan

### Architecture: DEX Adapter Pattern

We use an adapter pattern to isolate DEX-specific logic, making it easy to add other DEXes later:

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

Create comprehensive DeepBook integration module (see full code in implementation plan).

Key functions:
- `getDeepBookPool()` - Fetch pool state from blockchain
- `estimateDeepBookSwap()` - Calculate output amount from order book
- `getDeepBookPrice()` - Get current mid-market price
- `findDeepBookPool()` - Lookup pool for token pair

### New File: `sdk/src/dex/adapter.ts`

Create extensible DEX adapter interface for future multi-DEX support.

### Update File: `sdk/src/transaction.ts`

Add `deepbookPoolId` parameter to `buildSwapTransaction()`.

---

## Phase 3: Frontend Layer (Priority 3)

### Update File: `frontend/src/lib/constants.ts`

Add DeepBook configuration and token mappings.

### Update File: `frontend/src/components/SwapForm.tsx`

Replace mock prices with real-time DeepBook price estimation.

---

## Configuration Values Needed

Before deployment, obtain:

1. **DeepBook Package ID**: `0x2c8d603bc51326b8c13cef9dd07031a408a48dddb541963357661df5d3204809` (mainnet)
2. **DeepBook Pool IDs**: Query DeepBook registry for SUI/USDC and other pairs
3. **USDC Token Type**: Find official USDC deployment on Sui testnet
4. **Deploy Octopus USDC Privacy Pool**: New `PrivacyPool<USDC>` instance needed

---

## Testing Strategy

### Unit Tests
- Contract: DeepBook swap, slippage protection, error cases
- SDK: Pool fetching, price estimation, adapter pattern

### Integration Tests
- End-to-end flow: Shield → Swap (via DeepBook) → Unshield
- Slippage protection verification
- Note encryption/decryption

### Manual Testing
- Real testnet swaps with various amounts
- Price accuracy validation
- Privacy verification (no amount leakage)

---

## Implementation Timeline

**Estimated Duration**: 10 days (1 developer) or 6 days (2 developers)

- **Days 1-2**: Research config values, setup SDK
- **Days 3-4**: Contract integration, Move tests
- **Days 5-6**: SDK integration, TypeScript tests
- **Days 7-8**: Frontend updates, E2E testing
- **Days 9-10**: Deploy USDC pool, production testing

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

---

**Last Updated**: 2026-02-07
**Status**: 🔵 Ready for Implementation
