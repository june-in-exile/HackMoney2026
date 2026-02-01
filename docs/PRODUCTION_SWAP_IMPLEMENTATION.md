# Production Swap Implementation with Cetus DEX

**Date:** 2026-02-01
**Status:** Ready for implementation

---

## Overview

This document provides the complete production implementation for private swaps through Cetus DEX integration.

**Current Status:** Test-only mock implementation (1:1 ratio)
**Target:** Production Cetus CLMM integration with real market prices

---

## Implementation Steps

### Step 1: Add Cetus External Call Function

Add to [pool.move](/Users/june/Projects/HackMoney2026/railgun/sources/pool.move) after the existing helper functions:

```move
/// Execute swap through Cetus CLMM DEX (Production)
/// This function calls the published Cetus package on testnet
fun execute_cetus_swap<TokenIn, TokenOut>(
    coin_in: Coin<TokenIn>,
    min_amount_out: u64,
    cetus_pool_id: ID,
    ctx: &mut TxContext,
): Coin<TokenOut> {
    // Note: This is a simplified reference implementation
    // Actual Cetus integration requires:
    // 1. Import cetus_clmm::pool module
    // 2. Get Pool<TokenIn, TokenOut> object reference
    // 3. Call swap_a2b or swap_b2a based on token order
    // 4. Handle sqrt_price_limit and slippage

    // Placeholder: In production, replace with actual Cetus call:
    // let pool = object::borrow_mut<cetus_clmm::pool::Pool<TokenIn, TokenOut>>(cetus_pool_id);
    // let result = cetus_clmm::pool::swap<TokenIn, TokenOut>(
    //     pool,
    //     coin_in,
    //     true,  // a_to_b direction
    //     true,  // by_amount_in
    //     0,     // sqrt_price_limit (0 = no limit)
    //     ctx
    // );

    // For now, return a zero coin to satisfy type checker
    // This will be replaced with actual Cetus integration
    abort E_INSUFFICIENT_BALANCE  // Force implementation before use
}
```

### Step 2: Update swap() Entry Function

Replace the test-only `swap()` function with production version:

```move
/// Execute private swap through Cetus DEX (Production)
///
/// Flow:
/// 1. Verify ZK proof (proves ownership of input notes)
/// 2. Extract input amount from pool_in
/// 3. Call Cetus DEX to swap TokenIn → TokenOut
/// 4. Receive swapped tokens
/// 5. Shield output into pool_out
/// 6. Return change to pool_in
/// 7. Emit SwapEvent
public entry fun swap<TokenIn, TokenOut>(
    pool_in: &mut PrivacyPool<TokenIn>,
    pool_out: &mut PrivacyPool<TokenOut>,
    cetus_pool_id: ID,                      // Cetus pool object ID
    proof_bytes: vector<u8>,                 // 128-byte Groth16 proof
    public_inputs_bytes: vector<u8>,        // 192-byte public inputs
    amount_in: u64,                         // Exact amount to swap
    min_amount_out: u64,                    // Minimum output (slippage protection)
    encrypted_output_note: vector<u8>,      // Encrypted note for recipient
    encrypted_change_note: vector<u8>,      // Encrypted change note
    ctx: &mut TxContext,
) {
    // 1. Parse public inputs (192 bytes = 6 field elements × 32 bytes)
    let (
        merkle_root,
        nullifier1,
        nullifier2,
        output_commitment,
        change_commitment,
        swap_data_hash
    ) = parse_swap_public_inputs(&public_inputs_bytes);

    // 2. Verify ZK proof
    let proof = groth16::prepare_verifying_key(&pool_in.swap_vk_bytes);
    assert!(
        groth16::verify_groth16_proof(&proof, &public_inputs_bytes, &proof_bytes),
        E_INVALID_PROOF
    );

    // 3. Verify merkle root is valid
    assert!(is_known_root(&pool_in.historical_roots, &merkle_root), E_INVALID_ROOT);

    // 4. Check double-spend for both nullifiers
    assert!(!nullifier::is_spent(&pool_in.nullifiers, &nullifier1), E_DOUBLE_SPEND);
    assert!(!nullifier::is_spent(&pool_in.nullifiers, &nullifier2), E_DOUBLE_SPEND);

    // 5. Mark nullifiers as spent
    nullifier::add_nullifier(&mut pool_in.nullifiers, nullifier1);
    nullifier::add_nullifier(&mut pool_in.nullifiers, nullifier2);

    // 6. Extract input amount from pool_in
    let coin_in = coin::take(&mut pool_in.balance, amount_in, ctx);

    // 7. Execute swap through Cetus DEX
    let coin_out = execute_cetus_swap<TokenIn, TokenOut>(
        coin_in,
        min_amount_out,
        cetus_pool_id,
        ctx
    );

    let amount_out = coin::value(&coin_out);

    // 8. Verify slippage protection
    assert!(amount_out >= min_amount_out, E_INSUFFICIENT_BALANCE);

    // 9. Shield output into pool_out
    balance::join(&mut pool_out.balance, coin::into_balance(coin_out));

    // 10. Add output commitment to pool_out tree
    let output_position = merkle_tree::insert(&mut pool_out.merkle_tree, output_commitment);
    merkle_tree::update_root(&mut pool_out.merkle_tree);
    update_historical_roots(&mut pool_out.historical_roots, merkle_tree::root(&pool_out.merkle_tree));

    // 11. Add change commitment to pool_in tree (if non-zero)
    let change_position = merkle_tree::insert(&mut pool_in.merkle_tree, change_commitment);
    merkle_tree::update_root(&mut pool_in.merkle_tree);
    update_historical_roots(&mut pool_in.historical_roots, merkle_tree::root(&pool_in.merkle_tree));

    // 12. Emit event
    event::emit(SwapEvent {
        input_nullifiers: vector[nullifier1, nullifier2],
        output_commitment,
        change_commitment,
        output_position,
        change_position,
        amount_in,
        amount_out,
        encrypted_output_note,
        encrypted_change_note,
    });
}
```

### Step 3: Cetus Integration Options

#### Option A: Direct Package Call (Recommended for Testnet)

Reference the published Cetus package directly via address:

```move
// At top of pool.move, add external function declaration
#[ext_fun(package = 0x5372d555ac734e272659136c2a0cd3227f9b92de67c80dc11250307268af2db8)]
public fun swap<A, B>(
    pool: &mut Pool<A, B>,
    a2b: bool,
    by_amount_in: bool,
    amount: u64,
    amount_limit: u64,
    sqrt_price_limit: u128,
    ctx: &mut TxContext
): (Coin<A>, Coin<B>, u64);
```

#### Option B: TypeScript SDK Integration (Recommended for Production)

Use Cetus SDK to construct programmable transaction blocks:

```typescript
import { CetusClmmSDK } from '@cetusprotocol/cetus-sui-clmm-sdk'

// Initialize SDK
const sdk = new CetusClmmSDK({
  network: 'testnet',
  fullNodeUrl: 'https://fullnode.testnet.sui.io:443'
})

// Build swap transaction
const tx = new Transaction()

// Step 1: Call pool::swap to extract coins and verify proof
const [coinIn] = tx.moveCall({
  target: `${RAILGUN_PACKAGE}::pool::prepare_swap`,
  arguments: [
    tx.object(poolInId),
    tx.pure(proofBytes),
    tx.pure(publicInputsBytes),
    tx.pure(amountIn)
  ],
  typeArguments: [coinTypeIn]
})

// Step 2: Call Cetus swap
const [coinOut] = tx.moveCall({
  target: `${CETUS_PACKAGE}::pool::swap`,
  arguments: [
    tx.object(cetusPoolId),
    coinIn,
    tx.pure(true), // a_to_b
    tx.pure(true), // by_amount_in
    tx.pure(amountIn),
    tx.pure(minAmountOut),
    tx.pure(0),    // sqrt_price_limit
  ],
  typeArguments: [coinTypeIn, coinTypeOut]
})

// Step 3: Shield output into pool_out
tx.moveCall({
  target: `${RAILGUN_PACKAGE}::pool::complete_swap`,
  arguments: [
    tx.object(poolOutId),
    coinOut,
    tx.pure(encryptedOutputNote),
    tx.pure(encryptedChangeNote)
  ],
  typeArguments: [coinTypeOut]
})
```

---

## Testing Plan

### Unit Tests

Create `railgun/sources/swap_cetus_tests.move`:

```move
#[test_only]
module railgun::swap_cetus_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin::{Self, Coin};
    use railgun::pool::{Self, PrivacyPool};

    #[test]
    fun test_swap_with_cetus_testnet() {
        // TODO: Implement test with real Cetus testnet pool
        // Requires: Real pool ID, proof generation, balance setup
    }

    #[test]
    #[expected_failure(abort_code = pool::E_INSUFFICIENT_BALANCE)]
    fun test_swap_slippage_exceeded() {
        // Test that swap reverts when min_amount_out not met
    }
}
```

### Integration Tests

1. **Setup Cetus Testnet Pool**
   ```bash
   # Find SUI/USDC pool on Cetus testnet
   # Visit: https://app.cetus.zone/swap?network=testnet
   ```

2. **Generate Real Swap Proof**
   ```typescript
   // sdk/test-swap-cetus.ts
   import { generateSwapProof, buildSwapTransaction } from '@octopus/sdk'

   async function testCetusSwap() {
     const proof = await generateSwapProof({
       keypair,
       inputNotes,
       swapParams: {
         tokenIn: SUI_TYPE,
         tokenOut: USDC_TYPE,
         amountIn: 1_000_000_000n, // 1 SUI
         minAmountOut: 900_000n,    // ~$0.90 USDC with 10% slippage
         dexPoolId: CETUS_POOL_ID,
         slippageBps: 1000
       },
       // ... other params
     })

     // Execute swap
     const tx = buildSwapTransaction(...)
     const result = await client.signAndExecuteTransaction(tx)
     console.log('Swap executed:', result.digest)
   }
   ```

3. **End-to-End Flow**
   - Shield 10 SUI into pool
   - Generate swap proof (SUI → USDC)
   - Execute swap through Cetus
   - Verify output commitment in USDC pool
   - Scan for encrypted output note
   - Decrypt and verify received USDC amount

---

## Deployment Checklist

- [ ] Implement `execute_cetus_swap()` function
- [ ] Update `swap()` entry function for production
- [ ] Add Cetus pool validation logic
- [ ] Test with real Cetus testnet pools
- [ ] Verify slippage protection works correctly
- [ ] Test price impact scenarios
- [ ] Security audit of swap logic
- [ ] Deploy updated pool contracts
- [ ] Update SDK with Cetus pool addresses
- [ ] Create frontend swap UI
- [ ] End-to-end testing with real users

---

## Cetus Testnet Resources

**Package Address:** `0x5372d555ac734e272659136c2a0cd3227f9b92de67c80dc11250307268af2db8`

**Finding Pool IDs:**
1. Visit [Cetus Testnet App](https://app.cetus.zone/swap?network=testnet)
2. Select SUI → USDC pair
3. Inspect network calls to find pool object ID
4. Use Cetus SDK: `sdk.Pool.getAllPools()`

**Cetus SDK Documentation:**
- [Official Docs](https://cetus-1.gitbook.io/cetus-developer-docs)
- [GitHub Repository](https://github.com/CetusProtocol/cetus-clmm-sui-sdk)
- [NPM Package](https://www.npmjs.com/package/@cetusprotocol/cetus-sui-clmm-sdk)

---

## Sources

- [Cetus CLMM Interface](https://github.com/CetusProtocol/cetus-clmm-interface)
- [Cetus Sui SDK](https://github.com/CetusProtocol/cetus-clmm-sui-sdk)
- [Cetus Developer Docs](https://cetus-1.gitbook.io/cetus-developer-docs)

---

**Next Step:** Implement `execute_cetus_swap()` and test with real testnet pools
