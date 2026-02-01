# Cetus DEX Integration Guide

## Overview

This document outlines the steps needed to integrate Cetus Protocol for production-ready private swaps in Octopus.

**Current Status:** ⚠️ Mock implementation (1:1 swap ratio) - TEST ONLY

**Required for Production:** Real Cetus DEX integration with market prices

## Architecture

```
User (has SUI notes)
    ↓
Submit ZK Proof (swap.circom)
    ↓
pool::swap() verifies proof
    ↓
Extract SUI from pool_in
    ↓
Call Cetus DEX: SUI → USDC
    ↓
Receive USDC from DEX
    ↓
Shield USDC into pool_out
    ↓
User receives private USDC note
```

## Implementation Steps

### 1. Add Cetus Dependency to Move.toml ✅

**Status:** Completed - Cetus address added to Move.toml

Update `/Users/june/Projects/HackMoney2026/railgun/Move.toml`:

```toml
[package]
name = "railgun"
edition = "2024.beta"

[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "framework/testnet" }

[addresses]
railgun = "0x0"
cetus_clmm = "0x5372d555ac734e272659136c2a0cd3227f9b92de67c80dc11250307268af2db8"
```

**Note:** We use the published testnet package address instead of git dependency to avoid Sui framework version conflicts. For production swap calls, reference Cetus modules via the address: `cetus_clmm::pool`, `cetus_clmm::config`, etc.

### 2. Import Cetus Modules in pool.move

Add at the top of [pool.move:4](/Users/june/Projects/HackMoney2026/railgun/sources/pool.move#L4):

```move
use cetus_clmm::pool::{Self as cetus_pool, Pool};
use cetus_clmm::config::{GlobalConfig};
```

### 3. Update swap() Function Signature

Modify the `swap()` function to accept Cetus pool reference:

```move
public entry fun swap<TokenIn, TokenOut>(
    pool_in: &mut PrivacyPool<TokenIn>,
    pool_out: &mut PrivacyPool<TokenOut>,
    cetus_global_config: &GlobalConfig,        // NEW: Cetus global config
    cetus_pool: &mut Pool<TokenIn, TokenOut>,  // NEW: Cetus pool
    proof_bytes: vector<u8>,
    public_inputs_bytes: vector<u8>,
    amount_in: u64,
    min_amount_out: u64,
    encrypted_output_note: vector<u8>,
    encrypted_change_note: vector<u8>,
    ctx: &mut TxContext,
)
```

### 4. Replace execute_mock_swap() with Real Cetus Integration

Replace [execute_mock_swap():583](/Users/june/Projects/HackMoney2026/railgun/sources/pool.move#L583) with:

```move
/// Execute swap through Cetus CLMM DEX
fun execute_cetus_swap<TokenIn, TokenOut>(
    coin_in: Coin<TokenIn>,
    min_amount_out: u64,
    cetus_global_config: &GlobalConfig,
    cetus_pool: &mut Pool<TokenIn, TokenOut>,
    pool_out: &mut PrivacyPool<TokenOut>,
    ctx: &mut TxContext,
): u64 {
    // Determine swap direction (a_to_b or b_to_a)
    // This depends on token order in the Cetus pool
    let a_to_b = cetus_pool::is_order_a_to_b<TokenIn, TokenOut>();

    // Execute swap
    let (coin_out, coin_in_remainder) = if (a_to_b) {
        cetus_pool::flash_swap<TokenIn, TokenOut>(
            cetus_global_config,
            cetus_pool,
            true,  // a_to_b
            true,  // by_amount_in
            coin::value(&coin_in),
            0,     // sqrt_price_limit (0 = no limit)
            ctx
        )
    } else {
        cetus_pool::flash_swap<TokenIn, TokenOut>(
            cetus_global_config,
            cetus_pool,
            false, // b_to_a
            true,  // by_amount_in
            coin::value(&coin_in),
            0,     // sqrt_price_limit
            ctx
        )
    };

    // Pay for swap with input coin
    cetus_pool::repay_flash_swap<TokenIn, TokenOut>(
        cetus_global_config,
        cetus_pool,
        coin_in,
        coin_in_remainder,
        coin::zero<TokenOut>(ctx),
        coin_out
    );

    let amount_out = coin::value(&coin_out);

    // Verify slippage protection
    assert!(amount_out >= min_amount_out, E_INSUFFICIENT_BALANCE);

    // Shield output into pool_out
    balance::join(&mut pool_out.balance, coin::into_balance(coin_out));

    amount_out
}
```

### 5. Update SDK for DEX Price Fetching

Create [sdk/src/dex.ts](/Users/june/Projects/HackMoney2026/sdk/src/dex.ts):

```typescript
import { SuiClient } from '@mysten/sui/client';

export interface CetusPoolInfo {
  poolId: string;
  tokenA: string;
  tokenB: string;
  currentSqrtPrice: bigint;
  liquidity: bigint;
}

export async function getCetusPool(
  client: SuiClient,
  tokenIn: string,
  tokenOut: string
): Promise<CetusPoolInfo> {
  // Query Cetus pool object
  // TODO: Implement pool lookup logic
}

export async function estimateSwapOutput(
  client: SuiClient,
  poolId: string,
  amountIn: bigint,
  isAToB: boolean
): Promise<{ amountOut: bigint; priceImpact: number }> {
  // Calculate expected output using Cetus CLMM math
  // TODO: Implement price calculation
}

export function calculateSlippage(
  expectedOutput: bigint,
  slippageBps: number
): bigint {
  return (expectedOutput * BigInt(10000 - slippageBps)) / BigInt(10000);
}
```

### 6. Testing Checklist

Before deploying to production:

- [ ] Test swap with real Cetus testnet pools
- [ ] Verify price calculation accuracy (compare with Cetus UI)
- [ ] Test slippage protection (should revert if price moves too much)
- [ ] Test with different token pairs (SUI/USDC, SUI/USDT)
- [ ] Test edge cases:
  - [ ] Very large swaps (high price impact)
  - [ ] Very small swaps (dust amounts)
  - [ ] Pool with low liquidity
  - [ ] Concurrent swaps affecting price
- [ ] Gas cost optimization
- [ ] Security audit of swap logic

## Cetus Pool Addresses (Testnet)

Find current pool addresses at: https://app.cetus.zone/swap

**SUI/USDC Pool:**
- Pool ID: `0x...` (TODO: Add actual pool ID)
- Token A: SUI (`0x2::sui::SUI`)
- Token B: USDC (`0x...`)

**SUI/USDT Pool:**
- Pool ID: `0x...` (TODO: Add actual pool ID)
- Token A: SUI (`0x2::sui::SUI`)
- Token B: USDT (`0x...`)

## Resources

- [Cetus Protocol Docs](https://cetus-1.gitbook.io/cetus-docs)
- [Cetus CLMM SDK](https://github.com/CetusProtocol/cetus-clmm-interface)
- [Cetus Testnet App](https://app.cetus.zone/swap?network=testnet)
- [Sui Move by Example - DEX Integration](https://examples.sui.io/)

## Alternative: Turbos Finance

If Cetus integration proves difficult, Turbos Finance is an alternative:

- [Turbos Docs](https://docs.turbos.finance/)
- [Turbos SDK](https://github.com/turbos-finance/turbos-clmm-sdk)
- Similar CLMM architecture to Cetus

## Next Steps

1. Research Cetus CLMM architecture and flash swap mechanism
2. Set up Cetus testnet pools for SUI/USDC
3. Implement `execute_cetus_swap()` function
4. Update SDK to fetch real-time prices from Cetus
5. Test swap flow end-to-end with real prices
6. Security audit before mainnet deployment

---

**Last Updated:** 2026-02-01
**Status:** Planning - Mock implementation complete, real DEX integration pending
