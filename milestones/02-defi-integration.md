# Milestone 2: DeFi Integration (Private Swaps)

**Priority:** 🟡 High
**Status:** 🟡 In Progress (Phase 1: 70% Complete)
**Estimated Complexity:** Very High
**Dependencies:** Private Transfers (Milestone 1) ✅ Complete

**Last Updated:** 2026-02-01

## Overview

Enable users to perform DeFi operations (starting with swaps) directly from their shielded balances without revealing trade details. Users can swap tokens privately through DEXs while staying inside the privacy pool.

## Why This Feature?

**Current Limitation:**

- Users must unshield to interact with DeFi protocols
- Every DeFi operation exposes user's identity and trade details
- Public transaction history reveals trading strategies

**With DeFi Integration:**

- Swap tokens while maintaining privacy
- No front-running (MEV protection inherent)
- Build private DeFi ecosystem on Sui
- Increase anonymity set (more transaction types)

## Technical Architecture

### Cross-Contract Call Pattern

```
User → Submit ZK Proof → PrivacyPool Contract
                             ↓
                        Verify Proof
                             ↓
                        Execute Swap
                             ↓
                    External DEX (e.g., Cetus)
                             ↓
                    Return Output Tokens
                             ↓
                Shield Output into New Note
```

## Core Concept: Action Circuits

Instead of one universal circuit, use specialized circuits for different actions:

- `transfer.circom` - Private transfers
- `swap.circom` - Private swaps
- `lend.circom` - Private lending (future)
- `borrow.circom` - Private borrowing (future)

Each circuit proves:

1. User owns input notes (authorization)
2. Action-specific constraints (e.g., swap parameters)
3. Output note commitments are correct

## Phase 1: Private Swaps (Week 1-3)

### 1. Swap Circuit Design

**File:** `circuits/swap.circom`

**Public Inputs:**

```circom
signal input root;                    // Merkle root
signal input nullifiers[2];           // Input note nullifiers
signal input output_commitment;       // Output note commitment
signal input swap_data_hash;          // Hash of swap parameters
```

**Private Inputs:**

```circom
signal input spending_key;
signal input nullifying_key;
signal input input_notes[2];
signal input input_amounts[2];
signal input merkle_paths[2][16];
signal input merkle_indices[2];

// Swap parameters
signal input token_in_type;           // Input token type
signal input token_out_type;          // Output token type
signal input amount_in;               // Exact input amount
signal input min_amount_out;          // Minimum output (slippage protection)
signal input dex_pool_id;             // Target DEX pool

// Output note
signal input output_npk;
signal input output_random;
```

**Constraints:**

- Verify input notes ownership
- Verify Merkle proofs
- Verify `input_amounts[0] + input_amounts[1] >= amount_in` (sufficient balance)
- Verify `swap_data_hash = Hash(token_in, token_out, amount_in, min_amount_out, dex_pool_id)`
- Output commitment uses `token_out_type`

### 2. Move Contract Changes

**File:** `railgun/sources/pool.move`

Add new entry function:

```move
public entry fun swap<TokenIn, TokenOut>(
    pool_in: &mut PrivacyPool<TokenIn>,
    pool_out: &mut PrivacyPool<TokenOut>,
    proof_bytes: vector<u8>,
    public_inputs_bytes: vector<u8>,
    // Swap execution parameters
    dex_pool: &mut Pool<TokenIn, TokenOut>,  // Cetus/Turbos pool
    amount_in: u64,
    min_amount_out: u64,
    encrypted_output_note: vector<u8>,
    ctx: &mut TxContext
)
```

**Implementation Flow:**

1. Verify ZK proof with swap verification key
2. Check nullifiers not spent
3. Extract `amount_in` tokens from pool_in
4. Call DEX swap function:

   ```move
   let amount_out = dex::swap<TokenIn, TokenOut>(dex_pool, amount_in, min_amount_out, ctx);
   ```

5. Shield `amount_out` tokens into pool_out with output commitment
6. Mark input nullifiers as spent
7. Emit swap event

**Key Challenge: Cross-Pool Interaction**

- Need separate PrivacyPool for each token type
- Must handle token conversion atomically
- Ensure output amount meets `min_amount_out` constraint

### 3. DEX Integration Options

#### Option A: Cetus Protocol Integration

[Cetus](https://www.cetus.zone/) is a major Sui DEX.

**Integration Code:**

```move
use cetus::pool::{Self, Pool};
use cetus::swap::{Self};

let coin_in = coin::from_balance(
    balance::split(&mut pool_in.token_balance, amount_in),
    ctx
);

let coin_out = swap::swap_a_b<TokenIn, TokenOut>(
    dex_pool,
    coin_in,
    min_amount_out,
    ctx
);

let amount_out = coin::value(&coin_out);
balance::join(&mut pool_out.token_balance, coin::into_balance(coin_out));
```

#### Option B: Turbos Finance Integration

[Turbos](https://turbos.finance/) is another popular Sui DEX.

Similar integration pattern with different module paths.

#### Option C: DeepBook Integration

Sui's native order book DEX.

**Pros:** Native to Sui, well-documented
**Cons:** Order book model (less private than AMM)

**Recommendation:** Start with Cetus (largest liquidity)

### 4. SDK Changes

**File:** `sdk/src/defi.ts` (new file)

```typescript
export interface SwapParams {
  tokenIn: string;      // Token type (e.g., '0x2::sui::SUI')
  tokenOut: string;
  amountIn: bigint;
  minAmountOut: bigint;
  slippageBps: number;  // Basis points (e.g., 50 = 0.5%)
  dexPoolId: string;
}

export interface SwapInput {
  spendingKey: bigint;
  nullifyingKey: bigint;
  inputNotes: Note[];   // Notes with tokenIn
  swapParams: SwapParams;
  merklePaths: string[][];
  merkleIndices: number[];
  outputNPK: bigint;    // Recipient of output note
}

export async function generateSwapProof(
  input: SwapInput
): Promise<{ proof: Uint8Array; publicInputs: Uint8Array }>

export async function estimateSwapOutput(
  dexPoolId: string,
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint
): Promise<bigint>
```

**File:** `sdk/src/sui.ts`

```typescript
export function buildSwapTransaction(
  poolIn: string,
  poolOut: string,
  dexPool: string,
  proof: Uint8Array,
  publicInputs: Uint8Array,
  amountIn: bigint,
  minAmountOut: bigint,
  encryptedNote: Uint8Array,
  tokenIn: string,
  tokenOut: string
): TransactionBlock
```

### 5. Frontend Changes

**New Component:** `web/src/components/SwapForm.tsx`

**Features:**

- Token pair selection (SUI ↔ USDC, etc.)
- Amount input with balance validation
- Real-time price quotes from DEX
- Slippage tolerance setting (0.1%, 0.5%, 1%)
- Expected output calculation
- Proof generation progress (60-90 seconds)
- Transaction confirmation

**UI Flow:**

1. User selects token pair (e.g., SUI → USDC)
2. User enters input amount
3. SDK fetches real-time price from DEX
4. Display expected output with slippage
5. User confirms swap
6. Generate ZK proof
7. Submit transaction (shield → swap → shield)
8. Update balance with new token

**New Hook:** `web/src/hooks/useDexPrice.ts`

```typescript
export function useDexPrice(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint
) {
  // Poll DEX for current price
  // Return expected output and price impact
}
```

## Implementation Phases

### Phase 1: Circuit & Contract (Week 1-2) - 🟡 70% Complete

- [x] Design `swap.circom` circuit ✅ 2026-02-01
- [x] Add swap constraints and verification ✅ 2026-02-01
- [x] Compile circuit and generate keys ✅ 2026-02-01 (22,553 constraints)
- [x] Add `swap()` function to pool.move ✅ 2026-02-01 (test-only version)
- [ ] Integrate with Cetus DEX module ⚠️ Mock implementation only
- [ ] Write Move unit tests (15+ cases)
- [ ] Deploy multi-token pools to testnet

**Notes:**
- Swap circuit successfully compiled with 22,553 constraints (well under 80K target)
- Mock swap implementation using 1:1 ratio for testing
- Real Cetus integration documented in [/docs/CETUS_INTEGRATION.md](/Users/june/Projects/HackMoney2026/docs/CETUS_INTEGRATION.md)

### Phase 2: SDK Integration (Week 2-3)

- [ ] Create `sdk/src/defi.ts` module
- [ ] Implement `generateSwapProof()`
- [ ] Add DEX price fetching
- [ ] Implement slippage calculation
- [ ] Add token balance tracking for multiple tokens
- [ ] Write SDK tests
- [ ] Test with real DEX pools

### Phase 3: Frontend (Week 3-4)

- [ ] Create `SwapForm.tsx` component
- [ ] Add token selector UI
- [ ] Implement real-time price display
- [ ] Add slippage settings
- [ ] Deploy swap circuit artifacts
- [ ] Test full swap flow in browser
- [ ] Add transaction history for swaps

### Phase 4: Multi-Token Support (Week 4-5)

- [ ] Deploy pools for SUI, USDC, USDT
- [ ] Add token metadata (icons, decimals)
- [ ] Implement token switching logic
- [ ] Test all token pairs
- [ ] Add liquidity checks (fail gracefully if insufficient)

### Phase 5: Testing & Optimization (Week 5-6)

- [ ] End-to-end swap testing (20+ scenarios)
- [ ] Test edge cases (slippage exceeded, price movement)
- [ ] Optimize circuit constraints
- [ ] Security audit of swap logic
- [ ] Performance benchmarking
- [ ] Gas optimization

## Files to Create/Modify

### New Files

- [x] `circuits/swap.circom` - Swap circuit ✅
- [x] `circuits/compile_swap.sh` - Compilation script ✅
- [x] `circuits/build/swap_js/swap.wasm` - Circuit WASM ✅
- [x] `circuits/build/swap_final.zkey` - Proving key ✅
- [x] `docs/CETUS_INTEGRATION.md` - Cetus integration guide ✅
- [ ] `sdk/src/defi.ts` - DeFi operations SDK
- [ ] `sdk/src/__tests__/defi.test.ts` - DeFi tests
- [ ] `web/src/components/SwapForm.tsx` - Swap UI
- [ ] `web/src/hooks/useDexPrice.ts` - Price fetching hook
- [ ] `web/public/circuits/swap_js/swap.wasm` - Circuit WASM (deployment)
- [ ] `web/public/circuits/swap_final.zkey` - Proving key (deployment)
- [ ] `railgun/tests/swap_tests.move` - Swap tests

### Modified Files

- [x] `railgun/sources/pool.move` - Add swap() function ✅ (test-only)
- [x] `railgun/sources/pool_tests.move` - Update test setup ✅
- [x] `railgun/sources/transfer_tests.move` - Update test setup ✅
- [ ] `railgun/Move.toml` - Add Cetus dependency
- [ ] `sdk/src/prover.ts` - Add generateSwapProof()
- [ ] `sdk/src/sui.ts` - Add buildSwapTransaction()
- [ ] `web/src/app/page.tsx` - Add Swap tab
- [ ] `web/src/lib/constants.ts` - Add supported tokens

## Success Criteria

- [x] Circuit compiles with <80K constraints ✅ (22,553 constraints)
- [ ] All Move tests pass (swap succeeds, failures handled)
- [ ] SDK generates swap proofs in <90 seconds
- [ ] Real-time price quotes display accurately
- [ ] Slippage protection works correctly
- [ ] Successful swap: SUI → USDC (privacy preserved)
- [ ] Output note received and spendable
- [ ] No information leaked about swap details

## Current Implementation Status

### ✅ Completed (2026-02-01)

1. **Swap Circuit Design & Implementation**
   - File: `circuits/swap.circom`
   - Constraint count: 22,553 (well under 80K target)
   - Supports 2-input, 2-output (output + change)
   - Verifies ownership, Merkle proofs, balance conservation, swap parameters

2. **Circuit Compilation**
   - Generated proving key: `circuits/build/swap_final.zkey`
   - Generated verification key: `circuits/build/swap_vk.json`
   - WASM prover: `circuits/build/swap_js/swap.wasm`

3. **Move Contract Updates**
   - Added `swap_vk_bytes` field to `PrivacyPool`
   - Implemented `swap()` function (test-only with mock DEX)
   - Added `SwapEvent` for transaction scanning
   - Added `parse_swap_public_inputs()` helper
   - Updated `create_pool()` signature to accept swap VK

4. **Documentation**
   - Created comprehensive Cetus integration guide
   - Documented implementation steps, code examples, testing checklist

### ⚠️ In Progress

5. **Cetus DEX Integration** (Next Priority)
   - Current: Mock 1:1 swap for testing
   - Required: Real Cetus CLMM integration
   - See: `docs/CETUS_INTEGRATION.md`

### 🔴 Not Started

6. **SDK Implementation** (`sdk/src/defi.ts`)
7. **Move Unit Tests** (15+ test cases)
8. **Frontend Components** (SwapForm.tsx)
9. **Multi-token Pool Deployment**
10. **End-to-end Testing**

## Testing Checklist

### Circuit Tests

- [ ] Valid swap proof generation
- [ ] Merkle proof verification
- [ ] Nullifier computation
- [ ] Swap data hash verification
- [ ] Sufficient input balance check

### Contract Tests

- [ ] Valid swap succeeds (SUI → USDC)
- [ ] Invalid proof rejected
- [ ] Insufficient liquidity handled
- [ ] Slippage exceeded reverts
- [ ] Double-spend prevented
- [ ] Output note commitment added to tree
- [ ] Swap event emitted

### Integration Tests

- [ ] Alice swaps 10 SUI for USDC
- [ ] Bob swaps USDC back to SUI
- [ ] Large swap (check price impact)
- [ ] Small swap (dust amounts)
- [ ] Multiple sequential swaps
- [ ] Concurrent swaps from different users

## Security Considerations

1. **Price Manipulation Protection:**
   - Use slippage limits (`min_amount_out`)
   - Verify DEX oracle is not manipulated
   - Consider time-weighted average price (TWAP)

2. **Front-Running Prevention:**
   - ZK proof hides swap parameters until execution
   - Transaction is atomic (no partial execution)
   - Nullifiers prevent transaction replay

3. **Liquidity Checks:**
   - Verify DEX pool has sufficient liquidity
   - Gracefully fail if swap cannot be executed
   - Return clear error messages

4. **Token Type Safety:**
   - Ensure `TokenIn` and `TokenOut` match circuit constraints
   - Prevent token type confusion attacks
   - Validate pool IDs

## Performance Targets

- **Swap Circuit Compilation:** <10 minutes
- **Proof Generation:** <90 seconds (browser)
- **Proof Verification:** <100ms (on-chain)
- **Price Quote Latency:** <500ms
- **Circuit Size:** <80,000 constraints
- **Gas Cost:** <5M gas units per swap

## Advanced Features (Future)

### Multi-Hop Swaps

- Swap through multiple pools (SUI → USDC → USDT)
- Optimize routing for best price
- Single ZK proof for entire path

### Limit Orders

- Place private limit orders on DeepBook
- Order fills trigger automatic shielding
- Cancel orders without revealing identity

### Liquidity Provision

- Add private liquidity to DEX pools
- Earn fees privately
- Withdraw liquidity + fees as shielded notes

### Lending & Borrowing

- Private deposits to lending protocols (Scallop, Navi)
- Borrow against shielded collateral
- Repay loans privately

## References

- [Cetus Protocol Docs](https://cetus-1.gitbook.io/cetus-docs) - Sui DEX integration
- [Turbos Finance](https://docs.turbos.finance/) - Alternative DEX
- [Railgun DeFi Actions](https://docs.railgun.org/developer-guide/wallet/transactions/cross-contract-calls)
- [Aztec Connect](https://aztec.network/connect/) - Ethereum private DeFi bridge
- [ZK-Rollup DEX Design](https://ethresear.ch/t/zkswap-zk-rollup-dex/7067) - Architecture patterns

## DEX Integration Priorities

1. **Phase 1:** Cetus (largest liquidity)
2. **Phase 2:** Turbos Finance (second largest)
3. **Phase 3:** DeepBook (native order book)
4. **Phase 4:** Cross-DEX routing (best price)

## Next Steps After Completion

Once private swaps are working:

1. Add multi-hop swaps (A→B→C)
2. Integrate lending protocols
3. Add liquidity provision
4. Implement limit orders
5. Build private trading dashboard
