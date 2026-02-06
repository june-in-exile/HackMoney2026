# Swap Functionality Implementation Plan

**Status:** 🔍 Current State Analysis Complete
**Last Updated:** 2026-02-06
**Based on:** Comprehensive codebase exploration

---

## Executive Summary

This document provides an accurate assessment of the Swap functionality's current state, identifies discrepancies in existing documentation, and outlines concrete implementation steps.

**Key Finding:** All infrastructure components (circuit, SDK, contracts) are production-ready, but the frontend transaction execution is completely commented out. Documentation claims features are "working" when they are actually incomplete.

---

## 1. Current State Analysis

### ✅ What's ACTUALLY Working

#### 1.1 ZK Circuit ([circuits/swap.circom](../../circuits/swap.circom))

**Status:** ✅ PRODUCTION READY

- **Constraints:** 22,553 (efficient, well-optimized)
- **Artifacts:** All present and compiled
  - WASM: `/circuits/build/swap_js/swap.wasm`
  - Proving Key: `/circuits/build/swap_final.zkey`
  - Verification Key: `/circuits/build/swap_vk.json` (6 public inputs)
- **Proof Generation:** Works in browser (30-60 seconds)

**What It Proves:**

1. User owns both input notes (spending key verification)
2. Input notes exist in Merkle tree (2 Merkle proofs)
3. Correct nullifier computation for both inputs
4. Sufficient balance: `sum(input_values) >= amount_in + change_value`
5. Swap parameters hash correctly
6. Output/change commitments correctly computed

**Public Inputs (192 bytes):**

- `merkle_root` (32 bytes)
- `input_nullifiers[2]` (64 bytes)
- `output_commitment` (32 bytes) - uses token_out
- `change_commitment` (32 bytes) - uses token_in
- `swap_data_hash` (32 bytes)

#### 1.2 Move Contract ([contracts/sources/pool.move:347-428](../../contracts/sources/pool.move#L347-L428))

**Status:** ✅ FULLY FUNCTIONAL (test version with mock swap)

**Test Function:** `swap<TokenIn, TokenOut>()`

- All 27 tests passing (100% success rate)
- Mock 1:1 swap execution via `execute_mock_swap()`
- Full proof verification logic present (currently commented out for testing)
- Nullifier tracking prevents double-spend
- Merkle tree updates for both pools
- Historical root saving for proof validity window
- SwapEvent emission for wallet scanning
- Change note handling works correctly

**Production Function:** `swap_production<TokenIn, TokenOut>()` (lines 460-582)

- ⚠️ Scaffolded but deliberately aborts with TODO
- Proof verification logic ready
- Cetus imports commented out (lines 11-14)
- Actual DEX integration not implemented

**Test Coverage:**

- ✅ Pool creation for two token types
- ✅ Mock swap execution (1:1 ratio)
- ✅ Double-spend prevention via nullifiers
- ✅ Balance validation
- ✅ Public inputs format validation
- ✅ Change note creation (including zero-change case)
- ✅ Bidirectional swaps (SUI→USDC and USDC→SUI)

#### 1.3 TypeScript SDK ([sdk/src/prover.ts:490-651](../../sdk/src/prover.ts#L490-L651))

**Status:** ✅ PRODUCTION READY

**Core Functions:**

1. **`buildSwapInput(swapInput: SwapInput): SwapCircuitInput`** (lines 490-602)
   - Constructs circuit input from user data
   - Pads to 2 inputs if only 1 provided (creates dummy note)
   - Computes nullifiers: `Poseidon(nullifying_key, leaf_index)`
   - Computes commitments: `Poseidon(NSK, token, value)`
   - Computes swap data hash
   - Calculates Merkle root from first input note

2. **`generateSwapProof(swapInput: SwapInput)`** (lines 610-629)
   - Generates Groth16 proof using snarkjs
   - Supports Node.js and browser environments
   - Loads artifacts from filesystem or HTTP
   - Returns raw proof and public signals

3. **`convertSwapProofToSui(proof, publicSignals)`** (lines 637-651)
   - Converts to Sui-compatible format
   - Validates 6 public signals
   - Serializes to Arkworks compressed format
   - Returns 128-byte proof + 192-byte public inputs

#### 1.4 Frontend UI ([frontend/src/components/SwapForm.tsx](../../frontend/src/components/SwapForm.tsx))

**Status:** ✅ UI COMPLETE (display only)

**Working Features:**

- Cyberpunk-styled interface with consistent design
- Token selection dropdowns (SUI ↔ USDC)
- Amount input with validation
- Swap direction toggle button
- Slippage tolerance selector (0.1%, 0.5%, 1%, 5%)
- Price impact display
- Loading states
- Error and success message handling
- Form validation logic

**Mock Implementation:**

- Hardcoded price: `SUI_USDC: 3.0` (1 SUI = 3 USDC) at line 40
- Mock price impact calculation
- 500ms debounce on amount changes

### ⚠️ What's INCOMPLETE (Critical Gaps)

#### 2.1 Frontend Transaction Execution

**CRITICAL BLOCKER:** Lines 193-222 in [SwapForm.tsx](../../frontend/src/components/SwapForm.tsx#L193-L222) are completely commented out.

**Missing Components:**

1. Merkle tree building from ShieldEvents
2. Note leaf index computation
3. Merkle proof generation for input notes
4. SwapInput construction with proofs
5. ZK proof generation call
6. Transaction building
7. Transaction execution

**Current State:** UI is display-only. Button click does nothing.

#### 2.2 Price Estimation

**Issue:** Uses hardcoded mock prices instead of real DEX data

**Current Implementation:** (lines 82-132)

```typescript
const MOCK_PRICES = {
  SUI_USDC: 3.0,  // Fixed ratio
};
```

**What Should Happen:**

- Call `estimateCetusSwap()` from SDK
- Fetch real pool data from blockchain
- Calculate actual price impact based on liquidity
- Handle decimal conversions correctly (SUI: 9, USDC: 6)

**SDK Reality:** `estimateCetusSwap()` exists in [sdk/src/dex.ts](../../sdk/src/dex.ts) but is NEVER CALLED.

#### 2.3 Token Configuration

**Issue:** Placeholder values that prevent real functionality

**Current State:** (lines 43-56)

```typescript
const TOKENS = {
  SUI: {
    type: "0x2::sui::SUI",
    symbol: "SUI",
    decimals: 9,
    poolId: POOL_ID
  },
  USDC: {
    type: "0x...",  // ❌ Placeholder
    symbol: "USDC",
    decimals: 6,
    poolId: "0x..."  // ❌ Placeholder
  }
}
```

**Problems:**

- USDC token type is invalid placeholder
- Pool IDs are placeholder strings
- Token type conversion is broken: `BigInt(type.slice(0, 10))` is incorrect

#### 2.4 Circuit URLs Missing

**Issue:** [frontend/src/lib/constants.ts](../../frontend/src/lib/constants.ts) doesn't define SWAP circuit URLs

**Current State:** Only UNSHIELD and TRANSFER circuits defined

**Required:**

```typescript
SWAP: {
  WASM: "/circuits/swap_js/swap.wasm",
  ZKEY: "/circuits/swap_final.zkey",
  VK: "/circuits/swap_vk.json",
}
```

#### 2.5 DEX Integration

**Issue:** Production contract deliberately aborts

**Current State:** [pool.move:539](../../contracts/sources/pool.move#L539)

```move
abort E_INSUFFICIENT_BALANCE  // TODO: Implement Cetus integration
```

**Blockers:**

- Cetus imports commented out (lines 11-14)
- `execute_mock_swap()` used instead of real DEX call
- No actual `flash_swap()` implementation

---

## 2. Documentation Issues

### 2.1 Misleading Claims in README.md

#### Line 3: Status Badge

**Claim:** "🚧 Frontend Integrated | Backend Mock Implementation"
**Reality:** Should be "🚧 UI Complete | Transaction Logic Incomplete"

#### Lines 37-41: "Now accessible in main UI"

**Claim:** Implies functionality works
**Reality:** UI is accessible but proof generation is commented out

#### Lines 49-53: "How to Use (Frontend)"

**Claim:** Provides working instructions
**Reality:** These steps don't work - proof generation never executes

```diff
- 8. **Generate proof and execute** (takes 30-60 seconds)
+ 8. ⚠️ **Proof generation not yet implemented** (coming soon)
```

#### Lines 150-157: "What's Working ✅"

**Claim:** "Swap transaction building and submission"
**Reality:** Commented out, does not work

**Claim:** "Full privacy preservation"
**Reality:** Cannot be verified without execution

**Claim:** "Frontend UI integration (SWAP tab)"
**Reality:** Should clarify "UI only, transaction logic incomplete"

#### Line 173: "Price Oracle"

**Claim:** "Fetch live prices from Cetus pools"
**Reality:** Uses hardcoded mock prices, real function exists but unused

### 2.2 Issues in ISSUE.md

#### Lines 6-27: Root Cause Analysis

**Missing:** The CRITICAL blocker (proof generation commented out) is not mentioned

**Should Add:**

```markdown
0. **Transaction Logic Disabled** (CRITICAL BLOCKER)
   - Lines 193-222 in SwapForm.tsx are commented out
   - Proof generation never executes
   - Transaction never submitted
```

#### Lines 67-72: "Long-Term Solution"

**Claim:** "SDK already has complete Cetus integration"
**Reality:** Functions exist but are NEVER USED in the swap flow

#### Line 115: Status

**Claim:** "Mock implementation acceptable for testing"
**Reality:** Cannot test without proof generation - mock UI only

---

## 3. Implementation Roadmap

### Phase 1: Enable Basic Swap (Est. 2-3 days)

**Goal:** Make swap work end-to-end with mock 1:1 prices

#### Task 1.1: Add Swap Circuit URLs

**File:** [frontend/src/lib/constants.ts:47](../../frontend/src/lib/constants.ts#L47)

```typescript
export const CIRCUIT_URLS = {
  UNSHIELD: { /* existing */ },
  TRANSFER: { /* existing */ },
  SWAP: {
    WASM: "/circuits/swap_js/swap.wasm",
    ZKEY: "/circuits/swap_final.zkey",
    VK: "/circuits/swap_vk.json",
  },
} as const;
```

**Verification:** Artifacts exist in `frontend/public/circuits/`

#### Task 1.2: Fix Price Estimation

**File:** [frontend/src/components/SwapForm.tsx:37-56](../../frontend/src/components/SwapForm.tsx#L37-L56)

**Changes:**

1. Update mock price to realistic value:

   ```typescript
   const MOCK_PRICES = {
     SUI_USDC: 2.5,  // More realistic estimate
   };
   ```

2. Fix decimal conversion:

   ```typescript
   // SUI: 9 decimals, USDC: 6 decimals
   const amountInSui = Number(amountIn) / 1e9;
   const amountOutUsdc = amountInSui * MOCK_PRICES.SUI_USDC;
   const amountOutUsdcRaw = BigInt(Math.floor(amountOutUsdc * 1e6));
   ```

3. Add user-visible error messages

#### Task 1.3: Implement Merkle Tree Building

**New File:** `frontend/src/lib/merkle-tree.ts`

**Required Functions:**

```typescript
export async function scanShieldEvents(
  client: SuiClient,
  poolId: string
): Promise<ShieldEvent[]> {
  // Query chain for ShieldEvents
  // Parse encrypted notes and commitments
}

export function buildMerkleTree(
  events: ShieldEvent[]
): ClientMerkleTree {
  // Build tree from commitments
  // Store leaf index → note mapping
}

export function computeMerkleProof(
  tree: ClientMerkleTree,
  leafIndex: number
): MerkleProof {
  // Generate path elements and indices
  // Format for circuit input
}
```

#### Task 1.4: Complete Transaction Logic

**File:** [frontend/src/components/SwapForm.tsx:193-229](../../frontend/src/components/SwapForm.tsx#L193-L229)

**Uncomment and complete:**

1. Build Merkle tree:

   ```typescript
   const events = await scanShieldEvents(suiClient, POOL_ID);
   const tree = buildMerkleTree(events);
   ```

2. Find user's notes and compute proofs:

   ```typescript
   const inputNotes = selectNotesForSwap(notes, amountInBigInt);
   const merkleProofs = inputNotes.map(note =>
     computeMerkleProof(tree, note.leafIndex)
   );
   ```

3. Build SwapInput:

   ```typescript
   const swapInput: SwapInput = {
     keypair,
     inputNotes: inputNotes.map((note, i) => ({
       ...note,
       leafIndex: note.leafIndex,
       merkleProof: merkleProofs[i]
     })),
     swapParams,
     outputNote: { /* recipient note */ },
     changeNote: { /* sender change */ }
   };
   ```

4. Generate proof and execute:

   ```typescript
   const { proof, publicSignals } = await generateSwapProof(swapInput);
   const suiProof = convertSwapProofToSui(proof, publicSignals);

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
     encryptedChangeNote
   );

   const result = await signAndExecute({ transaction: tx });
   ```

#### Task 1.5: Fix Token Configuration

**File:** [frontend/src/lib/constants.ts](../../frontend/src/lib/constants.ts)

**Changes:**

1. Get real USDC token type from Sui testnet
2. Update pool IDs with deployed values
3. Fix token type conversion in SwapForm

#### Task 1.6: Enable Proof Verification

**File:** [contracts/sources/pool.move:379-382](../../contracts/sources/pool.move#L379-L382)

**Uncomment:**

```move
let is_valid = groth16::verify_proof(
    &swap_vk_bytes,
    &proof_bytes,
    &public_inputs_bytes
);
assert!(is_valid, E_INVALID_PROOF);
```

**Verification:**

- Re-run `sui move test`
- Ensure all 27 tests still pass
- Proof generation works correctly

#### Phase 1 Checklist

- [ ] Swap circuit URLs added to constants
- [ ] Price estimation uses realistic mock values
- [ ] Decimal conversion fixed (9 vs 6 decimals)
- [ ] Merkle tree building implemented
- [ ] Note leaf indices computed correctly
- [ ] Merkle proofs generated for inputs
- [ ] Proof generation uncommented and working
- [ ] Transaction builds correctly
- [ ] Transaction executes on blockchain
- [ ] Mock swap completes (1:1 ratio)
- [ ] Output and change notes created
- [ ] SwapEvent emitted
- [ ] Proof verification enabled in contract
- [ ] All tests pass

---

### Phase 2: Real DEX Integration (Est. 3-5 days)

**Goal:** Replace mock swap with real Cetus DEX routing

#### Task 2.1: Configure Cetus Dependencies

**File:** [contracts/Move.toml](../../contracts/Move.toml)

**Changes:**

1. Verify Cetus package availability on testnet
2. Add dependencies:

   ```toml
   [dependencies]
   Cetus = { git = "https://github.com/CetusProtocol/...", rev = "..." }
   ```

3. Document Cetus package addresses

#### Task 2.2: Enable Contract DEX Integration

**File:** [contracts/sources/pool.move](../../contracts/sources/pool.move)

**Changes:**

1. Uncomment Cetus imports (lines 11-14):

   ```move
   use cetus_clmm::pool::{Self as cetus_pool, Pool as CetusPool};
   use cetus_clmm::config::{GlobalConfig as CetusGlobalConfig};
   ```

2. Remove abort in `swap_production()` (line 539)

3. Implement real swap logic:

   ```move
   // Extract from pool_in
   let coin_in = balance::split(&mut pool_in.reserve, amount_in);

   // Call Cetus flash_swap
   let coin_out = cetus_pool::flash_swap<TokenIn, TokenOut>(
       cetus_pool_obj,
       cetus_config,
       coin_in,
       min_amount_out,
       /* ... */
   );

   // Shield into pool_out
   balance::join(&mut pool_out.reserve, coin::into_balance(coin_out));
   ```

#### Task 2.3: Integrate Real Price Estimation

**File:** [frontend/src/components/SwapForm.tsx:82-132](../../frontend/src/components/SwapForm.tsx#L82-L132)

**Changes:**

1. Import Cetus function:

   ```typescript
   import { estimateCetusSwap } from "@june_zk/octopus-sdk/dex";
   ```

2. Replace mock estimation:

   ```typescript
   const { amountOut, priceImpact } = await estimateCetusSwap(
     suiClient,
     CETUS_POOLS["SUI/USDC"],
     amountInBigInt,
     true // a_to_b direction
   );
   ```

3. Handle decimal conversions properly

#### Task 2.4: Multi-Pool Deployment

**New Files:** Deployment scripts

**Steps:**

1. Deploy `PrivacyPool<SUI>` contract
2. Deploy `PrivacyPool<USDC>` contract
3. Fund pools with initial liquidity
4. Update frontend constants with pool IDs:

   ```typescript
   export const POOLS = {
     SUI: "0x...",  // Real pool ID
     USDC: "0x...", // Real pool ID
   };
   ```

#### Task 2.5: Test Slippage Protection

**Verification:**

1. Test with 0.1% slippage - should succeed
2. Test with too-tight slippage - should revert
3. Verify `amount_out >= min_amount_out` check works
4. Test price impact calculation accuracy

#### Phase 2 Checklist

- [ ] Cetus dependencies added to Move.toml
- [ ] Cetus imports uncommented in contract
- [ ] `swap_production()` abort removed
- [ ] Real flash_swap call implemented
- [ ] Frontend calls `estimateCetusSwap()`
- [ ] Real pool data fetched from blockchain
- [ ] Price impact calculated from real liquidity
- [ ] Decimal handling correct for both tokens
- [ ] SUI pool deployed on testnet
- [ ] USDC pool deployed on testnet
- [ ] Pool IDs updated in frontend
- [ ] Slippage protection tested
- [ ] End-to-end swap with real DEX works

---

## 4. File Modification Summary

### Critical Files

| File | Changes | Priority |
|------|---------|----------|
| [frontend/src/lib/constants.ts](../../frontend/src/lib/constants.ts) | Add SWAP circuit URLs | P1 |
| [frontend/src/components/SwapForm.tsx](../../frontend/src/components/SwapForm.tsx#L37-L56) | Fix price estimation | P1 |
| [frontend/src/components/SwapForm.tsx](../../frontend/src/components/SwapForm.tsx#L193-L229) | Uncomment transaction logic | P1 |
| frontend/src/lib/merkle-tree.ts | NEW FILE - Merkle tree building | P1 |
| [contracts/sources/pool.move](../../contracts/sources/pool.move#L379-L382) | Enable proof verification | P1 |
| [contracts/Move.toml](../../contracts/Move.toml) | Add Cetus dependencies | P2 |
| [contracts/sources/pool.move](../../contracts/sources/pool.move#L11-L14) | Uncomment Cetus imports | P2 |
| [contracts/sources/pool.move](../../contracts/sources/pool.move#L539) | Remove abort, implement DEX | P2 |
| [frontend/src/components/SwapForm.tsx](../../frontend/src/components/SwapForm.tsx#L82-L132) | Use real price estimation | P2 |

### Documentation Files

| File | Changes |
|------|---------|
| [docs/milestone2-defi-integration/README.md](README.md) | Add reference to this plan |
| [docs/milestone2-defi-integration/ISSUE.md](ISSUE.md) | Add proof generation blocker |

---

## 5. Testing Strategy

### Unit Tests (Already Passing)

✅ All 27 contract tests pass:

- Pool creation
- Mock swap execution
- Nullifier double-spend prevention
- Balance validation
- Public inputs parsing
- Change note creation
- Bidirectional swaps

### Integration Tests (Required for Phase 1)

- [ ] Merkle tree building from events
- [ ] Note leaf index computation
- [ ] Merkle proof generation
- [ ] Circuit proof generation (30-60s)
- [ ] Transaction submission
- [ ] Event scanning after swap
- [ ] Change note decryption

### End-to-End Tests (Required for Phase 2)

- [ ] Real Cetus price fetching
- [ ] Market rate swap execution
- [ ] Slippage protection
- [ ] Price impact accuracy
- [ ] Multi-pool coordination
- [ ] Full user flow (shield → swap → unshield)

---

## 6. Success Criteria

### Phase 1 Success

- [ ] User can execute swap in UI
- [ ] ZK proof generates successfully
- [ ] Transaction submits to blockchain
- [ ] Mock 1:1 swap completes
- [ ] Notes created correctly
- [ ] No proof verification failures

### Phase 2 Success

- [ ] Real Cetus prices displayed
- [ ] Swap executes at market rate
- [ ] Slippage protection works
- [ ] Price impact accurate
- [ ] Multi-pool swaps work
- [ ] Full privacy maintained

---

## 8. Key Findings Summary

### The Good News

1. **All infrastructure exists** - circuit, SDK, contracts all ready
2. **Tests passing** - 27/27 contract tests work
3. **Clear path forward** - just need to assemble components
4. **No architectural changes needed** - design is sound

### The Bad News

1. **Documentation overstates completion** - claims working features that are commented out
2. **Frontend execution is 0% complete** - entire transaction flow disabled
3. **Mock prices misleading** - real estimation function exists but unused
4. **Token config broken** - placeholder values prevent functionality

### The Bottom Line

Implementation is **straightforward but requires care**. The circuit and SDK are production-ready. The main work is:

1. Building the Merkle tree scanning pipeline
2. Uncommenting and completing frontend transaction logic
3. Integrating Cetus for real DEX routing

**Estimated Total Time:** 5-8 days (P1: 2-3 days, P2: 3-5 days)

---

## References

- **Exploration Reports:** See exploration agent outputs in plan file
- **Circuit Spec:** [circuits/swap.circom](../../circuits/swap.circom)
- **Contract Code:** [contracts/sources/pool.move](../../contracts/sources/pool.move)
- **SDK Code:** [sdk/src/prover.ts](../../sdk/src/prover.ts), [sdk/src/dex.ts](../../sdk/src/dex.ts)
- **Frontend Code:** [frontend/src/components/SwapForm.tsx](../../frontend/src/components/SwapForm.tsx)
