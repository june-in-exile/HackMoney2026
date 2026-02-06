# Zero-Value Notes Problem & Solution

## Problem Statement

### Current Behavior

The Octopus transfer circuit implements a fixed **2-input, 2-output** UTXO model. Every transfer creates exactly 2 output notes:

1. **Recipient note**: Amount being transferred
2. **Change note**: Remaining balance back to sender

### The Issue

When a user transfers their entire balance (amount = input_total), the change note has **value = 0**. These zero-value notes cause problems:

```typescript
// Example: User has 100 tokens, sends 100 tokens
const inputs = [note1, note2];  // Total: 100 tokens
const outputs = createTransferOutputs(recipientMpk, senderMpk, 100n, 100n, token);
// outputs[0] = { value: 100n, ... }  ✅ Recipient note
// outputs[1] = { value: 0n, ... }    ❌ Useless change note
```

**Problems**:

1. 🗄️ **Storage waste**: Zero-value notes get inserted into the Merkle tree
2. 🗑️ **UTXO pollution**: These notes cannot be spent and clutter the note set
3. 💸 **Gas waste**: Inserting, storing, and emitting events for unusable notes
4. 🔍 **Scanning overhead**: Wallets must scan and filter out these notes

### Why It Happens

1. **Circuit constraint**: Transfer circuit enforces `output_commitments[2]` as public inputs
2. **No conditional logic**: Circuit always computes both output commitments
3. **Contract always inserts**: Move contract inserts both commitments unconditionally
4. **SDK always creates**: SDK creates 2 output notes regardless of change amount

## Solution: Conditional Output Commitments

### Design Philosophy

Follow the **existing pattern in unshield circuit** where change notes are optional:

```circom
// circuits/unshield.circom:75-76
signal no_change <== IsZero()(change_value);
change_commitment <== real_change_commitment * (1 - no_change);
```

When `change_value = 0`:

- `no_change = 1`
- `change_commitment = 0` (all zero bytes)

Contract checks before inserting:

```move
// contracts/sources/pool.move:642
if (!is_zero_commitment(&change_commitment)) {
    merkle_tree::insert(&mut pool.merkle_tree, change_commitment);
}
```

### Benefits

- ✅ **Privacy preserved**: Doesn't reveal amounts, only whether output exists
- ✅ **Storage efficient**: Skips inserting zero-value commitments
- ✅ **Clean UTXO set**: No unusable notes cluttering the tree
- ✅ **SDK compatible**: No changes needed to SDK API
- ✅ **Backward compatible**: Old proofs still work with old pools
- ✅ **Gas efficient**: Saves insertion costs for dummy notes

## Implementation

### Phase 1: Circuit Modification

**File**: [`circuits/transfer.circom`](../circuits/transfer.circom)

**Location**: After line 119 (Step 3: Verify Output Commitments)

#### Change 1: Add Zero-Value Detection

```circom
// ============ Step 3: Verify Output Commitments (Modified) ============
// For each output note, compute commitment conditionally:
// - If value > 0: commitment = Poseidon(NSK, token, value)
// - If value = 0: commitment = 0 (skip creating note)

component outputCommitmentHashers[2];
component isOutputZero[2];
signal output_enabled[2];
signal real_output_commitments[2];

for (var i = 0; i < 2; i++) {
    // Check if output has zero value
    isOutputZero[i] = IsZero();
    isOutputZero[i].in <== output_values[i];
    output_enabled[i] <== 1 - isOutputZero[i].out;

    // Compute real commitment
    outputCommitmentHashers[i] = Poseidon(3);
    outputCommitmentHashers[i].inputs[0] <== output_nsks[i];
    outputCommitmentHashers[i].inputs[1] <== token;
    outputCommitmentHashers[i].inputs[2] <== output_values[i];
    real_output_commitments[i] <== outputCommitmentHashers[i].out;

    // Conditional commitment:
    // - If value > 0: use real commitment
    // - If value = 0: output commitment = 0
    output_commitments[i] === real_output_commitments[i] * output_enabled[i];
}
```

**Behavior**:

- `output_values[i] = 0` → `output_commitments[i] = 0x000...000` (32 zero bytes)
- `output_values[i] > 0` → `output_commitments[i] = Poseidon(nsk, token, value)` (normal)

**Proof structure unchanged**: Still includes 2 commitments as public inputs, maintaining compatibility.

### Phase 2: Contract Modification

**File**: [`contracts/sources/pool.move`](../contracts/sources/pool.move)

**Function**: `transfer` (line 271)

#### Change 1: Conditional Insertion Logic

Replace lines 307-312 with:

```move
// 6. Insert non-zero output commitments into Merkle tree
let mut output_positions = vector::empty<u64>();
let mut inserted_commitments = vector::empty<vector<u8>>();
let mut inserted_encrypted_notes = vector::empty<vector<u8>>();

// Insert output 1 if non-zero
if (!is_zero_commitment(&commitment1)) {
    let position1 = merkle_tree::get_next_index(&pool.merkle_tree);
    merkle_tree::insert(&mut pool.merkle_tree, commitment1);
    vector::push_back(&mut output_positions, position1);
    vector::push_back(&mut inserted_commitments, commitment1);
    vector::push_back(&mut inserted_encrypted_notes, *vector::borrow(&encrypted_notes, 0));
};

// Insert output 2 if non-zero
if (!is_zero_commitment(&commitment2)) {
    let position2 = merkle_tree::get_next_index(&pool.merkle_tree);
    merkle_tree::insert(&mut pool.merkle_tree, commitment2);
    vector::push_back(&mut output_positions, position2);
    vector::push_back(&mut inserted_commitments, commitment2);
    vector::push_back(&mut inserted_encrypted_notes, *vector::borrow(&encrypted_notes, 1));
};
```

#### Change 2: Update Event Emission

Replace lines 318-324 with:

```move
// 8. Emit event for wallet scanning (only inserted commitments)
event::emit(TransferEvent {
    pool_id: object::id(pool),
    input_nullifiers: vector[nullifier1, nullifier2],
    output_commitments: inserted_commitments,
    output_positions,
    encrypted_notes: inserted_encrypted_notes,
});
```

**Behavior**:

- Both outputs have value → Insert 2 commitments (current behavior) ✅
- One output is zero → Insert 1 commitment (new behavior) 🆕
- Both outputs zero → Insert 0 commitments (prevented by balance equation) ❌

**Helper used**: `is_zero_commitment` already exists at line 791.

### Phase 3: Circuit Compilation

```bash
cd circuits/scripts
./compile_transfer.sh
```

**Expected outputs**:

- `circuits/build/transfer_js/transfer.wasm` (~2MB)
- `circuits/build/transfer_final.zkey` (~200MB)
- `circuits/build/transfer_vk.json` (~2KB)

**Estimated time**: 30-60 minutes

⚠️ **Important**: Backup current artifacts before recompiling!

### Phase 4: Testing

#### Contract Tests

**File**: `contracts/sources/tests/pool_tests.move`

**Test cases**:

1. **Transfer with no change**

   ```move
   #[test]
   fun test_transfer_no_change() {
       // Input: 100 tokens
       // Output: 100 to recipient, 0 change
       // Verify: Tree size increases by 1 (not 2)
   }
   ```

2. **Transfer with change**

   ```move
   #[test]
   fun test_transfer_with_change() {
       // Input: 100 tokens
       // Output: 60 to recipient, 40 change
       // Verify: Tree size increases by 2
   }
   ```

3. **Transfer with minimal change**

   ```move
   #[test]
   fun test_transfer_minimal_change() {
       // Input: 100 tokens
       // Output: 99 to recipient, 1 change
       // Verify: Both notes created
   }
   ```

**Run tests**:

```bash
cd contracts
sui move test
```

#### SDK Verification

No code changes, but verify behavior:

```typescript
// Test: Transfer exact amount (no change)
const inputs = [note1, note2];  // Total: 100
const outputs = createTransferOutputs(
  recipientMpk,
  senderMpk,
  100n,  // Send all
  100n,  // Input total
  token
);

console.log(outputs[1].value); // 0n

const proof = await generateTransferProof({
  spendingKey,
  nullifyingKey,
  inputNotes: inputs,
  outputNotes: outputs,
  merkleProofs,
  token
});

// proof.publicInputs[4] should be all zeros (commitment2 = 0)
```

### Phase 5: Deployment

1. **Build contracts**:

   ```bash
   cd contracts
   sui move build
   ```

2. **Deploy to testnet**:

   ```bash
   sui client publish --gas-budget 500000000
   ```

3. **Update frontend config**:
   - Update pool addresses
   - Update verification keys
   - Redeploy frontend

## Verification Checklist

After implementation:

- [ ] Circuit compiles without errors
- [ ] Circuit tests pass (if any)
- [ ] Contract compiles without errors
- [ ] All contract tests pass
- [ ] New test cases pass (1-output and 2-output)
- [ ] Generate proof with zero output, verify on-chain
- [ ] Check Merkle tree only contains non-zero commitments
- [ ] Verify event emissions match inserted commitments
- [ ] Frontend can detect and handle both scenarios
- [ ] Wallet correctly scans and displays notes

## Technical Details

### Cryptographic Invariants Maintained

1. **Balance conservation**: `sum(inputs) = sum(outputs)` still enforced
2. **Nullifier uniqueness**: Input nullifiers still prevent double-spend
3. **Commitment hiding**: Zero commitment reveals output exists, not amount
4. **Proof structure**: 5 public inputs (root, nullifier1, nullifier2, commitment1, commitment2)

### Edge Cases Handled

1. **Both outputs zero**: Prevented by balance equation (would require zero inputs)
2. **One output zero**: Handled by conditional insertion
3. **Both outputs non-zero**: Original behavior preserved
4. **Dust amounts**: Even 1-token change creates a valid note

### Privacy Analysis

**What's revealed**:

- ✅ Whether an output exists (1 bit of information)
- ✅ Number of notes created (0, 1, or 2)

**What's hidden**:

- ✅ Actual amounts of inputs and outputs
- ✅ Which output is recipient vs change
- ✅ Sender and recipient identities

**Privacy impact**: Minimal. Knowing "change exists" is negligible compared to full amount privacy.

## Alternative Approaches Considered

### Option A: SDK-Level Workaround ❌

Force minimum 1-token change in SDK.

**Pros**: No circuit/contract changes
**Cons**: Wasteful, doesn't solve root problem

### Option B: Variable-Output Circuit ❌

Redesign circuit to support 1 or 2 outputs with flag.

**Pros**: More flexible
**Cons**: Major redesign, backward incompatible, adds complexity

### Option C: Post-Creation Nullification ❌

Allow nullifying zero-value notes after creation.

**Pros**: No circuit changes
**Cons**: Complex, requires tracking leaf indices, still wastes storage initially

### Option D: Conditional Commitments ✅ (Selected)

Set commitment to zero when value is zero.

**Pros**: Clean, follows existing pattern, privacy-preserving
**Cons**: Requires circuit recompilation

## Impact Analysis

### Gas Costs

**Before**:

- Insert 2 commitments: ~2,000 gas per commitment = 4,000 gas
- Emit 2 encrypted notes: ~500 gas per note = 1,000 gas
- **Total**: ~5,000 gas per transfer

**After** (transfer with no change):

- Insert 1 commitment: ~2,000 gas
- Emit 1 encrypted note: ~500 gas
- **Total**: ~2,500 gas per transfer (50% savings)

### Storage Costs

**Before**:

- 2 notes × 32 bytes = 64 bytes per transfer
- 100,000 transfers = 6.4 MB

**After** (50% no-change scenario):

- 1.5 notes average × 32 bytes = 48 bytes per transfer
- 100,000 transfers = 4.8 MB (25% savings)

### User Experience

**Before**: Wallet shows unusable 0-value notes
**After**: Wallet only sees spendable notes

**Frontend scanning**: Fewer events to scan, faster sync

## Migration Path

### For Existing Deployments

1. **Old pools**: Continue using old circuit, no changes needed
2. **New pools**: Deploy with updated circuit and contract
3. **Gradual migration**: Users can use both pools during transition
4. **No data loss**: All existing notes remain valid

### For Users

- **No action required**: SDK handles everything automatically
- **Existing notes**: Still spendable with either old or new pools
- **New transfers**: Automatically benefit from optimization

## References

- [Transfer Circuit](../circuits/transfer.circom)
- [Unshield Circuit](../circuits/unshield.circom) (reference pattern)
- [Pool Contract](../contracts/sources/pool.move)
- [SDK Transfer Module](../sdk/src/transfer.ts)

## Status

- **Status**: Planned
- **Priority**: Medium (optimization, not critical bug)
- **Estimated effort**: 2-3 hours
- **Breaking changes**: No (new pools, old pools unaffected)

## Next Steps

1. Review and approve this design document
2. Implement circuit changes
3. Implement contract changes
4. Write comprehensive tests
5. Deploy to testnet
6. Test with frontend
7. Deploy to mainnet
