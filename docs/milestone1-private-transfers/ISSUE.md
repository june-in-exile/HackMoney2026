# Single-Input Transfer Circuit Constraint Failure

## Problem Statement

### Current Error (2026-02-03)

``` txt
ERROR: 4 Error in template Transfer_143 line: 82
Transfer failed: Error: Assert Failed. Error in template Transfer_143 line: 82
```

**Location:** `circuits/transfer.circom` line 82

```circom
input_npks[i] === inputNpkHashers[i].out;
```

This constraint verifies that the provided Note Public Key (NPK) matches the computed value:

``` txt
NPK = Poseidon(MPK, random)
```

### Impact

Users cannot perform private transfers with a single input note. The circuit requires exactly 2 inputs, but when only 1 note is available, the SDK creates a "dummy" note that fails circuit verification.

## Root Cause Analysis

### Transfer Circuit Requirements

The transfer circuit (`circuits/transfer.circom`) is designed for 2-input, 2-output transactions. It **always** requires 2 inputs, even when the user only has 1 note to spend.

### Dummy Note Creation

When a user selects only 1 note, the SDK (`sdk/src/prover.ts`) creates a "dummy" note with:

```typescript
const dummyNote: Note = {
  npk: 0n,              // ❌ Problem: arbitrary value
  token: token,         // ✅ Fixed: matches transfer token
  value: 0n,            // ✅ Triggers conditional Merkle check bypass
  random: 0n,           // ❌ Problem: doesn't produce valid NPK
  commitment: poseidonHash([0n, token, 0n])
};
```

### Circuit Constraint Behavior

From `circuits/transfer.circom` lines 69-110:

```circom
// Detect dummy notes (value == 0)
isValueZero[i] = IsZero();
isValueZero[i].in <== input_values[i];
enabled[i] <== 1 - isValueZero[i].out;  // 0 for dummy, 1 for real

// Line 82: NPK verification - NOT CONDITIONAL (always verified)
inputNpkHashers[i] = Poseidon(2);
inputNpkHashers[i].inputs[0] <== mpk;
inputNpkHashers[i].inputs[1] <== input_randoms[i];
input_npks[i] === inputNpkHashers[i].out;  // ❌ Fails for dummy note

// Line 110: Merkle root check - CONDITIONAL (bypassed when enabled=0)
enabled[i] * (merkle_root - inputMerkleProofs[i].root) === 0;  // ✅ Passes for dummy
```

**Key Insight:** Only the Merkle root check (line 110) is conditional. All other constraints (NPK verification line 82, commitment computation line 88, nullifier computation line 94) are **always verified** regardless of `value=0`.

### Why Dummy Note Fails

For the dummy note:

- Provided NPK: `0n`
- Circuit computes: `Poseidon(MPK, 0n)` where MPK is derived from user's keypair
- `Poseidon(MPK, 0n) ≠ 0n` in general
- Constraint `input_npks[i] === inputNpkHashers[i].out` fails ❌

## Fix History

### Fix 1: Token Value Mismatch (COMPLETED ✅)

#### Problem

**Original Error:** Line 110 - Merkle root mismatch

``` txt
ERROR: 4 Error in template Transfer_143 line: 110
```

The dummy note was created with `token: 0n`, but the circuit requires all notes (including dummy) to use the same token value.

#### Solution

**Files Modified:**

1. `sdk/src/prover.ts` line 467: Changed `token: 0n` → `token: token`
2. `frontend/src/components/TransferForm.tsx` line 119: Changed `token: 0n` → `token: selectedNotes[0].note.token`

#### Result

✅ Fixed line 110 Merkle root error
❌ Exposed line 82 NPK verification error (previously masked)

### Fix 2: NPK Verification (COMPLETED ✅)

#### Problem

**Error:** Line 82 - NPK verification failure

The dummy note uses `npk: 0n` and `random: 0n`, but the circuit verifies:

```circom
input_npks[i] === Poseidon(MPK, input_randoms[i])
0n === Poseidon(MPK, 0n)  // ❌ False
```

#### Solution (Fix 2)

**Files Modified:** `sdk/src/prover.ts` lines 460-476

Compute a **valid NPK** for the dummy note using the user's MPK:

```typescript
// Compute MPK from keypair (same as circuit does)
const mpk = poseidonHash([keypair.spendingKey, keypair.nullifyingKey]);

// Generate valid NPK for dummy note
const dummyRandom = 0n;  // Can be any value
const dummyNpk = poseidonHash([mpk, dummyRandom]);

// Create dummy note with valid NPK
const dummyNote: Note = {
  npk: dummyNpk,           // ✅ Valid: Poseidon(MPK, random)
  token: token,            // ✅ Matches transfer token
  value: 0n,               // ✅ Triggers Merkle bypass
  random: dummyRandom,     // ✅ Matches NPK computation
  commitment: poseidonHash([dummyNpk, token, 0n])  // ✅ Correct commitment
};
```

This ensures all circuit constraints pass:

- ✅ Line 82 (NPK): `dummyNpk === Poseidon(MPK, dummyRandom)`
- ✅ Line 88 (Commitment): `commitment === Poseidon(dummyNpk, token, 0n)`
- ✅ Line 94 (Nullifier): `nullifier === Poseidon(nullifying_key, leaf_index)`
- ✅ Line 110 (Merkle): Bypassed due to `enabled=0` when `value=0`

#### Result

✅ Fixed line 82 NPK verification error
❌ Exposed line 124 output commitment verification error (previously masked)

### Fix 3: Output Commitment Token Mismatch (COMPLETED ✅)

#### Problem

**Error:** Line 124 - Output commitment verification failure

```txt
ERROR: 4 Error in template Transfer_143 line: 124
```

The circuit computes output commitments as:

```circom
outputCommitmentHashers[i].inputs[0] <== output_npks[i];
outputCommitmentHashers[i].inputs[1] <== token;
outputCommitmentHashers[i].inputs[2] <== output_values[i];
output_commitments[i] === outputCommitmentHashers[i].out;
```

The frontend was creating output notes with `token: 0n` (line 106), but the circuit uses the actual token from the transfer. This caused a mismatch:

- Output note commitment: `Poseidon(NPK, 0n, value)`
- Circuit computation: `Poseidon(NPK, actualToken, value)`
- These don't match ❌

#### Solution (Fix 3)

**Files Modified:** `frontend/src/components/TransferForm.tsx` line 106

Changed from:

```typescript
const [recipientNote, changeNote] = createTransferOutputs(
  recipientMpkBigInt,
  keypair.masterPublicKey,
  amountNano,
  inputTotal,
  0n // ❌ Hardcoded token
);
```

To:

```typescript
const noteToken = selectedNotes[0].note.token; // Get actual token
const [recipientNote, changeNote] = createTransferOutputs(
  recipientMpkBigInt,
  keypair.masterPublicKey,
  amountNano,
  inputTotal,
  noteToken // ✅ Use actual token
);
```

#### Result

✅ Output commitments now computed correctly
✅ Line 124 verification should pass
✅ Circuit constraints all pass - proof generates successfully!
❌ On-chain transaction rejected with E_INVALID_ROOT (error code 3)

### Fix 4: Stale Merkle Root (COMPLETED ✅)

#### Problem

**Error:** Move abort code 3 = `E_INVALID_ROOT`

```txt
MoveAbort(..., function_name: Some("transfer") }, 3)
```

From `contracts/sources/pool.move`:

```move
const E_INVALID_ROOT: u64 = 3; // Merkle root is not valid (not current or in history)

public fun transfer<T>(...) {
    // Line 275: Verify merkle root is valid (current or in history)
    assert!(is_valid_root(pool, &merkle_root), E_INVALID_ROOT);
}
```

**Root Cause:** Notes' Merkle paths become stale when new deposits occur:

1. User scans notes and gets Merkle paths at tree state A (root = R1)
2. Someone shields new tokens → tree inserts commitment → root changes to R2
3. User submits transfer with proof using R1
4. Contract rejects: R1 is not current (R2) and not in history yet

The historical roots buffer has size 100, but if the root changed very recently, it might not be in history yet.

#### Solution (Fix 4)

**Files to Modify:**

1. `frontend/src/app/page.tsx` - Pass `refreshNotes` to TransferForm
2. `frontend/src/components/TransferForm.tsx` - Call refresh before transfer

Add refresh mechanism to ensure latest Merkle paths:

```typescript
// TransferForm props
interface TransferFormProps {
  // ... existing props
  onRefresh?: () => Promise<void>; // Add refresh callback
}

// In handleSubmit, before generating proof:
async handleSubmit() {
  // ...

  // Refresh notes to get latest Merkle paths BEFORE generating proof
  if (onRefresh) {
    setSuccess("🔄 Refreshing notes to get latest Merkle proofs...");
    await onRefresh();
  }

  // Now select notes with fresh Merkle paths
  const selectedNotes = selectNotesForTransfer(...);
  // ...
}
```

#### Result

✅ Notes are now refreshed before transfer
✅ Latest Merkle paths fetched from blockchain
✅ E_INVALID_ROOT should be resolved
🎯 Transfer should now complete successfully end-to-end!

## Alternative Approaches

### Option A: Modify Circuit (More Complex)

Make NPK verification conditional like the Merkle check:

```circom
enabled[i] * (input_npks[i] - inputNpkHashers[i].out) === 0;
```

**Pros:**

- More flexible dummy note creation
- Cleaner separation between real and dummy inputs

**Cons:**

- Requires circuit recompilation
- Requires new trusted setup ceremony
- Need to regenerate proving/verification keys
- Contract verification key must be updated
- Breaking change for existing deployments

**Decision:** NOT RECOMMENDED - SDK fix is simpler and doesn't require circuit changes.

### Option B: Compute Valid NPK (RECOMMENDED)

Generate a valid NPK for the dummy note using user's MPK.

**Pros:**

- ✅ No circuit changes required
- ✅ No recompilation or trusted setup
- ✅ Simple SDK-only fix
- ✅ Works with existing deployed contracts

**Cons:**

- Requires access to user's keypair (already available in SDK)

**Decision:** RECOMMENDED - minimal changes, no breaking updates.

## Implementation Status

- [x] Fix 1: Token value (dummy note) - COMPLETED
- [x] Fix 2: NPK verification (dummy note) - COMPLETED
- [x] Fix 3: Token value (output notes) - COMPLETED
- [x] Fix 4: Stale Merkle root (refresh mechanism) - COMPLETED
- [ ] Testing: Single-input transfer end-to-end
- [ ] Documentation: Update README with findings

## Testing Plan

### Unit Tests

1. Test dummy note creation with valid NPK
2. Verify commitment computation
3. Verify all circuit inputs are valid

### Integration Tests

1. Single-input transfer (1 note → 2 outputs)
2. Dual-input transfer (2 notes → 2 outputs)
3. Edge case: Transfer entire note (no change)
4. Edge case: Transfer with very small change

### E2E Tests

1. Shield 0.001 SUI
2. Transfer 0.001 SUI to recipient (single input)
3. Verify proof generation succeeds
4. Verify on-chain transaction succeeds
5. Verify recipient can decrypt and spend

## Related Files

### Circuit

- `circuits/transfer.circom` - Circuit logic (lines 69-110 critical)
- `circuits/lib/merkle_proof.circom` - Merkle proof verification

### SDK

- `sdk/src/prover.ts` lines 454-483 - Dummy note creation (FIX HERE)
- `sdk/src/crypto.ts` - Poseidon hash functions
- `sdk/src/types.ts` - Note type definition

### Frontend

- `frontend/src/components/TransferForm.tsx` - Transfer UI
- `frontend/src/hooks/useNotes.ts` - Note management

### Contracts

- `contracts/sources/pool.move` - On-chain verification (no changes needed)

## References

### Cryptographic Formulas

``` txt
MPK = Poseidon(spending_key, nullifying_key)
NPK = Poseidon(MPK, random)
Commitment = Poseidon(NPK, token, value)
Nullifier = Poseidon(nullifying_key, leaf_index)
```

### Circuit Design Patterns

Similar ZK protocols (Tornado Cash, Zcash) handle variable inputs by:

1. Using fixed-size circuits with dummy inputs (our approach)
2. Creating separate circuits for different input counts
3. Using conditional constraints (requires careful design)

Our current approach (1) is standard and correct - we just need valid dummy inputs.
