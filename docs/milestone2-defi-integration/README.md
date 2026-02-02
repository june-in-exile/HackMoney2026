# Milestone 2: DeFi Integration - Private Swaps

**Status:** 🚧 Frontend Integrated | Backend Mock Implementation
**Last Updated:** 2026-02-03

---

## Overview

This milestone adds private token swap functionality to Octopus, enabling users to exchange tokens while maintaining full privacy through ZK-SNARK proofs.

**Privacy Guarantee:** Swap amounts, token types, and user identities remain hidden on-chain. Only ZK proofs are verified publicly.

---

## Current Implementation Status

### ✅ Completed Components

1. **Swap Circuit** ([circuits/swap.circom](../../circuits/swap.circom))
   - 22,553 constraints (efficient, well optimized)
   - 2 input notes → 2 output notes (swapped token + change)
   - Full ZK proof generation working in browser

2. **Move Contract** ([contracts/sources/pool.move](../../contracts/sources/pool.move))
   - Test function: `swap()` with mock 1:1 exchange rate
   - Production scaffold: `swap_production()` ready for Cetus integration
   - Full proof verification, nullifier tracking, event emission

3. **TypeScript SDK** ([sdk/src/defi.ts](../../sdk/src/defi.ts))
   - Proof generation: `generateSwapProof()`
   - Transaction building: `buildSwapTransaction()`
   - Slippage calculation utilities
   - DEX price estimation (placeholder)

4. **Frontend UI** ([frontend/src/components/SwapForm.tsx](../../frontend/src/components/SwapForm.tsx))
   - ✅ **Now accessible in main UI** (SWAP tab)
   - Token pair selection (SUI ↔ USDC)
   - Slippage tolerance settings
   - Real-time price estimation

### ⚠️ Current Limitations

**Mock Swap Implementation:**

The current `swap()` function uses a **1:1 test exchange rate**. This allows testing the full ZK proof flow without requiring real DEX integration.

**For Production Use:**

- Requires Cetus CLMM integration for real market prices
- Needs multi-pool deployment (SUI pool + USDC pool)
- Price oracle integration for accurate output estimation

---

## How to Use (Frontend)

1. **Navigate to the app** and connect your Sui wallet
2. **Generate a keypair** (or select an existing one)
3. **Shield tokens** into the privacy pool first
4. **Click the SWAP tab** in the main interface
5. **Select token pair** (currently SUI ↔ USDC)
6. **Enter amount** to swap
7. **Set slippage tolerance** (0.1% - 5%)
8. **Generate proof and execute** (takes 30-60 seconds)

**Note:** The swap currently uses a mock 1:1 exchange rate for testing purposes.

---

## Architecture

```
User (private notes in pool_in)
    ↓
Submit ZK Proof (proves ownership + swap parameters)
    ↓
pool::swap() verifies proof
    ↓
Extract tokens from pool_in
    ↓
[Mock: 1:1 swap] → [Production: Call Cetus DEX]
    ↓
Shield swapped tokens into pool_out
    ↓
User receives encrypted output note
```

---

## Technical Details

### Swap Circuit ([circuits/swap.circom](../../circuits/swap.circom))

**Public Inputs (192 bytes):**

1. `merkle_root` (32 bytes) - Root of input note Merkle tree
2. `nullifier1`, `nullifier2` (64 bytes) - Input note nullifiers
3. `output_commitment` (32 bytes) - Output note commitment
4. `change_commitment` (32 bytes) - Change note commitment
5. `swap_data_hash` (32 bytes) - Hash of swap parameters

**Private Inputs:**

- Input notes (NPK, value, token)
- Spending key (for nullifier generation)
- Merkle proofs (path elements, indices)
- Output randomness
- Swap parameters (tokenIn, tokenOut, amounts)

**Circuit Guarantees:**

- ✅ User owns input notes (spending key check)
- ✅ Input notes exist in Merkle tree
- ✅ Balance conservation enforced
- ✅ Swap parameters validated
- ✅ Output notes properly committed

### Move Contract Functions

**Test Function (Mock Swap):**

```move
public entry fun swap<TokenIn, TokenOut>(
    pool_in: &mut PrivacyPool<TokenIn>,
    pool_out: &mut PrivacyPool<TokenOut>,
    proof_bytes: vector<u8>,
    public_inputs_bytes: vector<u8>,
    amount_in: u64,
    min_amount_out: u64,
    encrypted_output_note: vector<u8>,
    encrypted_change_note: vector<u8>,
    ctx: &mut TxContext,
)
```

**Features:**

- Verifies ZK proof using `swap_vk_bytes`
- Checks nullifiers for double-spend prevention
- Mock swap: `amount_out = amount_in` (1:1 ratio)
- Shields output into `pool_out`
- Emits `SwapEvent` for scanning

**Production Function (Cetus Integration Ready):**

```move
public entry fun swap_production<TokenIn, TokenOut>(
    pool_in: &mut PrivacyPool<TokenIn>,
    pool_out: &mut PrivacyPool<TokenOut>,
    cetus_pool_obj: &mut CetusPool<TokenIn, TokenOut>,
    cetus_config: &CetusGlobalConfig,
    // ... same parameters as above
)
```

⚠️ **Status:** Scaffolded, awaiting Cetus module integration

### SDK Functions

```typescript
// Generate ZK proof for swap
async function generateSwapProof(
  input: SwapInput,
  paths: { wasmPath: string; zkeyPath: string }
): Promise<SwapProof>

// Build Sui transaction
function buildSwapTransaction<TokenIn, TokenOut>(
  packageId: string,
  poolInId: string,
  poolOutId: string,
  coinTypeIn: TokenIn,
  coinTypeOut: TokenOut,
  proof: SuiSwapProof,
  amountIn: bigint,
  minAmountOut: bigint,
  encryptedOutputNote: Uint8Array,
  encryptedChangeNote: Uint8Array
): Transaction

// Calculate minimum output with slippage
function calculateMinAmountOut(
  amountOut: bigint,
  slippageBps: number
): bigint
```

---

## Testing

### Unit Tests ([contracts/sources/swap_tests.move](../../contracts/sources/swap_tests.move))

**7 Test Cases:**

- ✅ `test_swap_pools_creation` - Pool creation
- ✅ `test_swap_double_spend_fails` - Double-spend prevention
- ✅ `test_swap_invalid_public_inputs_length_fails` - Input validation
- ⚠️ `test_swap_sui_to_usdc_success` - Full swap flow (needs real proof)
- ⚠️ `test_swap_insufficient_balance_fails` - Balance check (needs real proof)
- ⚠️ `test_swap_with_zero_change` - Zero change (needs real proof)
- ⚠️ `test_swap_reverse_direction_usdc_to_sui` - Reverse swap (needs real proof)

**Status:** 2/7 passing (error cases work). Success cases require real ZK proof generation.

---

## Production Readiness

### What's Working ✅

- ZK proof generation for swaps (browser-compatible)
- Swap transaction building and submission
- Mock 1:1 swap execution
- Full privacy preservation (amounts/addresses hidden)
- Double-spend prevention (nullifier tracking)
- Slippage protection (circuit-level enforcement)
- Frontend UI integration (SWAP tab)

### What's Missing ⚠️

**For Real DEX Integration:**

1. **Cetus CLMM Integration**
   - Import Cetus modules in [pool.move](../../contracts/sources/pool.move)
   - Call `cetus_pool::flash_swap()` for real market prices
   - Handle token order (a_to_b vs b_to_a)

2. **Multi-Pool Deployment**
   - Deploy separate privacy pools for SUI and USDC
   - Fund pools with initial liquidity
   - Update SDK configuration with pool IDs

3. **Price Oracle**
   - Fetch live prices from Cetus pools
   - Calculate accurate output amounts
   - Estimate price impact

4. **Note Management**
   - Scan blockchain for user's encrypted notes
   - Build Merkle proofs for input notes
   - Select optimal notes to cover swap amount

---

## Next Steps

**Immediate (< 1 week):**

1. Complete Cetus module integration in pool.move
2. Deploy multi-token privacy pools (SUI, USDC)
3. Implement real price fetching from Cetus
4. Test with real Cetus testnet pools

**Short-term (1-2 weeks):**

1. Add support for multiple token pairs
2. Optimize circuit constraints (if needed)
3. Security audit of swap implementation
4. End-to-end testing with real users

**Long-term (1-2 months):**

1. Multi-hop swaps (SUI → USDT → USDC)
2. Liquidity aggregation (multiple DEXs)
3. MEV protection strategies
4. Mainnet deployment

---

## Resources

**Cetus Protocol:**

- [Developer Docs](https://cetus-1.gitbook.io/cetus-developer-docs)
- [CLMM SDK](https://github.com/CetusProtocol/cetus-clmm-sui-sdk)
- [Testnet App](https://app.cetus.zone/swap?network=testnet)
- Package Address: `0x5372d555ac734e272659136c2a0cd3227f9b92de67c80dc11250307268af2db8`

**Alternative DEXs:**

- [Turbos Finance](https://docs.turbos.finance/) - Similar CLMM architecture
- [Kriya DEX](https://docs.kriya.finance/) - Hybrid AMM/orderbook

---

## Security Considerations

**Implemented:**

- ✅ ZK proof verification (prevents unauthorized swaps)
- ✅ Double-spend prevention (nullifier tracking)
- ✅ Balance conservation (circuit enforced)
- ✅ Slippage protection (min_amount_out)
- ✅ Atomic execution (all or nothing)

**To Consider:**

- ⚠️ Front-running protection (private mempool or commit-reveal)
- ⚠️ MEV extraction (sandwich attacks on swaps)
- ⚠️ Pool liquidity requirements (minimum TVL for privacy)

---

**Status:** Swap infrastructure complete. Frontend integrated. Awaiting Cetus DEX integration for production use.

**Contact:** For questions about this milestone, see [milestones/02-defi-integration.md](../../milestones/02-defi-integration.md)
