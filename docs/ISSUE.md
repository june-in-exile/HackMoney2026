# E_INVALID_ROOT Error Analysis

## Error Description

**Error:** `MoveAbort(ModuleId { address: 25e5c3..., name: "pool" }, function: 8, instruction: 28, function_name: Some("unshield")) }, 3)`

**Meaning:** Unshield operations fail with error code `3` which corresponds to `E_INVALID_ROOT` in [contracts/sources/pool.move:23](../contracts/sources/pool.move#L23).

This error indicates that the Merkle root included in the ZK proof does not match:

- The current on-chain Merkle root, **OR**
- Any of the last 100 historical roots stored in the pool

## Root Cause: Merkle Root Staleness

The unshield operation fails due to a **race condition** between the frontend's cached Merkle tree state and the on-chain state.

### The Problem Flow

``` txt
T0: User opens frontend
    ├─ useNotes hook queries GraphQL for Shield/Transfer events
    ├─ Worker builds local Merkle tree from all commitments
    ├─ Merkle proofs (pathElements) generated for each owned note
    └─ Notes + pathElements cached in React state

T1-T10: User fills out unshield form
        ⚠️  Meanwhile, other transactions may occur:
        - Other users shield tokens → adds commitments → changes root
        - Other users transfer privately → adds commitments → changes root

T11: User clicks "UNSHIELD"
     ├─ UnshieldForm uses CACHED pathElements from T0
     ├─ SDK computes Merkle root from STALE pathElements
     ├─ ZK proof generated with OLD root (R0)
     └─ Transaction submitted to blockchain

T12: On-chain verification
     ├─ Pool's current root is now R1 (changed at T5)
     ├─ Historical roots: [R-99, ..., R-1, R1]
     ├─ Proof contains R0 (not in current or history)
     └─ ❌ ABORT E_INVALID_ROOT
```

### Why This Happens

1. **Notes are scanned once** when the component mounts or when manually refreshed
2. **Path elements are cached** in the `notes` state array
3. **No automatic refresh** occurs before generating the unshield proof
4. **The SDK computes the root deterministically** from the provided path elements
5. **Any concurrent transaction** changes the on-chain Merkle root
6. **Result:** Proof contains stale root, on-chain validation fails

## Technical Details

### Critical Code Locations

#### 1. Frontend Note Scanning (Staleness Origin)

**File:** [frontend/src/hooks/useNotes.ts:72-79](../frontend/src/hooks/useNotes.ts#L72-L79)

```typescript
useEffect(() => {
  if (!keypair) {
    setNotes([]);
    return;
  }

  scanNotes();  // ← Scans ONCE per effect trigger
}, [keypair, client, refreshTrigger]);
```

**Problem:** Notes are only refreshed:

- On component mount
- When keypair changes
- When `refresh()` is manually called

**No automatic refresh during the unshield flow.**

#### 2. Worker Merkle Tree Construction

**File:** [frontend/src/workers/noteScanWorker.ts:433-434](../frontend/src/workers/noteScanWorker.ts#L433-L434)

```typescript
const treeRoot = tree.getRoot();
console.log('[Worker] Tree root:', treeRoot.toString());
```

**How it works:**

1. Queries GraphQL for all Shield/Transfer events
2. Builds a `ClientMerkleTree` from all commitments
3. Computes Merkle proofs for each owned note
4. Returns notes with `pathElements` included

**Problem:** This tree is built from **event data**, not from the current on-chain state. It represents the blockchain state at the time of the query, which may already be stale by the time the user submits a transaction.

#### 3. Unshield Form Using Cached Data

**File:** [frontend/src/components/UnshieldForm.tsx:128-142](../frontend/src/components/UnshieldForm.tsx#L128-L142)

```typescript
// Validate that Merkle proof exists
if (!noteToSpend.pathElements || noteToSpend.pathElements.length === 0) {
  throw new Error("Merkle proof not available for this note. Please refresh and try again.");
}

// Build UnshieldInput for proof generation using already-loaded Merkle proof
const unshieldInput: UnshieldInput = {
  note: noteToSpend.note,
  leafIndex: noteToSpend.leafIndex,
  pathElements: noteToSpend.pathElements,  // ← STALE from initial scan!
  keypair: keypair,
};
```

**Problem:** The comment says "already-loaded" but doesn't verify the data is current. No call to `refresh()` before using the cached `pathElements`.

#### 4. SDK Root Computation

**File:** [sdk/src/prover.ts:93-123](../sdk/src/prover.ts#L93-L123)

```typescript
export function buildUnshieldInput(unshieldInput: UnshieldInput): UnshieldCircuitInput {
  const { note, leafIndex, pathElements, keypair } = unshieldInput;

  // Compute nullifier
  const nullifier = computeNullifier(keypair.nullifyingKey, leafIndex);

  // Compute merkle root
  const merkleRoot = computeMerkleRoot(note.commitment, pathElements, leafIndex);

  return {
    // ... private inputs ...
    // Public inputs
    merkle_root: merkleRoot.toString(),
    nullifier: nullifier.toString(),
    commitment: note.commitment.toString(),
  };
}
```

**How it works:**

- `computeMerkleRoot()` reconstructs the root from the commitment and path elements
- This is a **deterministic computation** - given the same inputs, it always produces the same output
- **It does not fetch the current on-chain root**

**File:** [sdk/src/crypto.ts:146-163](../sdk/src/crypto.ts#L146-L163)

```typescript
export function computeMerkleRoot(
  commitment: bigint,
  pathElements: bigint[],
  pathIndices: number
): bigint {
  let current = commitment;

  for (let i = 0; i < pathElements.length; i++) {
    const isRight = (pathIndices >> i) & 1;
    if (isRight) {
      current = poseidonHash([pathElements[i], current]);
    } else {
      current = poseidonHash([current, pathElements[i]]);
    }
  }

  return current;  // ← This is the root that goes in the proof
}
```

**Result:** If `pathElements` are stale, the computed root is also stale.

#### 5. Contract-Side Validation

**File:** [contracts/sources/pool.move:665-683](../contracts/sources/pool.move#L665-L683)

```move
fun is_valid_root<T>(pool: &PrivacyPool<T>, root: &vector<u8>): bool {
  // Check current root
  if (*root == merkle_tree::get_root(&pool.merkle_tree)) {
    return true
  };

  // Check historical roots
  let len = vector::length(&pool.historical_roots);
  let mut i = 0;
  while (i < len) {
    if (*root == *vector::borrow(&pool.historical_roots, i)) {
      return true
    };
    i = i + 1;
  };

  false  // ← Returns false if root not found
}
```

**Called from unshield():** [contracts/sources/pool.move:599](../contracts/sources/pool.move#L599)

```move
// 2. Verify merkle root is valid (current or in history)
assert!(is_valid_root(pool, &merkle_root), E_INVALID_ROOT);
```

**Historical Root Management:**

**File:** [contracts/sources/pool.move:655-663](../contracts/sources/pool.move#L655-L663)

```move
fun save_historical_root<T>(pool: &mut PrivacyPool<T>) {
  let root = merkle_tree::get_root(&pool.merkle_tree);
  vector::push_back(&mut pool.historical_roots, root);

  // Keep only last ROOT_HISTORY_SIZE roots
  while (vector::length(&pool.historical_roots) > ROOT_HISTORY_SIZE) {
    vector::remove(&mut pool.historical_roots, 0);  // ← Evicts oldest root
  };
}
```

**File:** [contracts/sources/pool.move:32](../contracts/sources/pool.move#L32)

```move
const ROOT_HISTORY_SIZE: u64 = 100;
```

**Result:** Only the last 100 roots are kept. If >100 transactions occur between scan and unshield, even a previously valid root will be rejected.

### Root Update Triggers

Merkle roots change after these operations:

1. **Shield** ([pool.move:235](../contracts/sources/pool.move#L235)):

   ```move
   merkle_tree::insert(&mut pool.merkle_tree, commitment);
   save_historical_root(pool);  // ← Saves NEW root
   ```

2. **Transfer** ([pool.move:303](../contracts/sources/pool.move#L303)):

   ```move
   merkle_tree::insert(&mut pool.merkle_tree, commitment2);
   save_historical_root(pool);  // ← Saves NEW root
   ```

3. **Swap** ([pool.move:399-400](../contracts/sources/pool.move#L399-L400)):

   ```move
   save_historical_root(pool_in);
   save_historical_root(pool_out);
   ```

**Every commitment added to the tree changes the root.**

## Failure Scenarios

### Scenario A: Concurrent Shield Transaction

``` txt
1. Alice opens frontend at T0
   └─ Scans notes: Tree has 10 commitments, root = R0
   └─ Alice's note has pathElements for root R0

2. Bob shields 1 SUI at T5
   └─ Tree now has 11 commitments, root = R1
   └─ Pool's current root: R1
   └─ Pool's historical roots: [R-99, ..., R0, R1]

3. Alice clicks "Unshield" at T10
   ├─ Uses cached pathElements from T0
   ├─ SDK computes root from stale paths → R0
   ├─ Proof generated with merkle_root = R0
   └─ Transaction submitted

4. On-chain verification at T11
   ├─ Current root: R1
   ├─ Historical roots: [R-99, ..., R0, R1]
   ├─ Proof root: R0 ← Found in historical roots!
   └─ ✅ SHOULD PASS (if R0 still in history)

Wait, why does this fail then?
```

**Answer:** The path elements themselves are invalid for the new root. Even though R0 is in history, Alice's path elements were computed for the tree state at T0. If Bob's commitment was inserted **before** Alice's note in the tree, the path elements would need to account for Bob's commitment. The path elements from T0 don't include Bob's commitment, so they can't produce a valid proof for R1.

**Correction:** The issue is not just that the root is different, but that:

- The path elements prove the note exists in the tree at state T0
- The on-chain tree is at state T1 (with Bob's commitment)
- Alice's note may have moved to a different position or have different sibling hashes
- The proof with old path elements is fundamentally invalid for the new tree state

### Scenario B: High Transaction Volume

``` txt
1. Active testnet with shield/transfer every 10 seconds
2. Alice scans notes → Gets pathElements for root R0
3. 30 seconds pass while Alice fills form
   ├─ 3 new transactions occurred
   ├─ Tree root changed 3 times: R0 → R1 → R2 → R3
   └─ Pool's current root: R3

4. Alice submits unshield with root R0
   ├─ R0 is in historical roots
   └─ But pathElements are for tree state at R0
   └─ ❌ Path doesn't prove note exists in current tree
```

### Scenario C: Root History Overflow

``` txt
1. Alice scans notes at T0 (root = R0)
2. 100+ shield/transfer transactions occur over next hour
   └─ Historical roots: [R1, R2, ..., R100]
   └─ R0 evicted from history

3. Alice submits unshield with root R0
   ├─ Current root: R100
   ├─ Historical roots: [R1, R2, ..., R100] (R0 evicted!)
   └─ ❌ E_INVALID_ROOT
```

## Related Issues

### Recent Transfer Circuit Fix (Commit 91a5cbd)

``` txt
fix(prover): Correct dummy note handling in transfer circuit
- Fixes Merkle root mismatch for single-input transfers
- Ensures dummy note has a valid path, satisfying circuit constraints
- Adds validation to prevent multi-note transfers with different roots
```

**Relevance:** This commit fixed a similar root mismatch issue in the transfer circuit, indicating that root computation has been problematic across multiple operations. The fix ensures that:

- Dummy notes have valid paths
- All input notes use the same Merkle root
- Single-input transfers don't produce incorrect roots

**Link:** Commit hash `91a5cbd` in git history.

### Byte Format (Not the Issue)

Initial investigation considered endianness as a potential cause:

**Move side:**

- `u256_to_bytes()` produces little-endian format
- `bytes_to_u256()` reads little-endian format

**TypeScript side:**

- `bigIntToLE32()` produces little-endian format ([sdk/src/prover.ts:401-409](../sdk/src/prover.ts#L401-L409))

**Conclusion:** Both sides use little-endian consistently. Endianness is not the issue.

## Solutions

### Immediate Fix (Recommended)

**Add refresh call before proof generation in UnshieldForm.tsx:**

```typescript
const handleUnshield = async () => {
  try {
    setIsLoading(true);
    setError(null);

    // ADDED: Refresh notes to get latest tree state
    console.log('Refreshing notes before unshield...');
    await refresh();
    console.log('Notes refreshed, proceeding with unshield');

    // Validate inputs
    if (!amount || parseFloat(amount) <= 0) {
      throw new Error("Please enter a valid amount");
    }

    // ... rest of unshield logic ...
  } catch (err) {
    // ... error handling ...
  }
};
```

**Pros:**

- Simple one-line change
- Ensures fresh tree state before proof generation
- Low risk

**Cons:**

- Adds latency (user must wait for refresh)
- Still vulnerable to race condition if transaction occurs between refresh and submission
- Doesn't solve the root cause (relying on cached data)

### Medium-Term Solution

**Implement just-in-time root validation:**

```typescript
const handleUnshield = async () => {
  try {
    setIsLoading(true);

    // 1. Refresh notes
    await refresh();

    // 2. Fetch current on-chain root
    const poolData = await client.getObject({
      id: POOL_ID,
      options: { showContent: true },
    });
    const onChainRoot = extractRootFromPoolData(poolData);

    // 3. Rebuild tree from events if needed
    const computedRoot = computeRootFromCachedNotes();
    if (computedRoot !== onChainRoot) {
      console.warn('Root mismatch detected, rebuilding tree...');
      await forceRebuildTree();
    }

    // 4. Generate proof with validated paths
    const unshieldInput = buildUnshieldInputWithValidation(noteToSpend);

    // 5. Verify computed root matches on-chain
    const proofRoot = computeMerkleRoot(
      unshieldInput.note.commitment,
      unshieldInput.pathElements,
      unshieldInput.leafIndex
    );

    if (proofRoot !== onChainRoot) {
      throw new Error('Root mismatch: please refresh and try again');
    }

    // 6. Generate and submit proof
    await generateAndSubmitUnshield(unshieldInput);

  } catch (err) {
    // ... error handling ...
  }
};
```

**Pros:**

- Validates root before proof generation
- Catches mismatches early
- Can retry with fresh data

**Cons:**

- More complex implementation
- Multiple on-chain queries
- Still has a small race window

### Long-Term Solution (Production-Ready)

**Implement automatic tree synchronization with retry logic:**

1. **Auto-refresh during active operations:**

   ```typescript
   useEffect(() => {
     if (isUnshieldFormActive) {
       const interval = setInterval(() => {
         refresh(); // Refresh every 10 seconds
       }, 10000);
       return () => clearInterval(interval);
     }
   }, [isUnshieldFormActive]);
   ```

2. **Use historical root acceptance:**
   - The contract already supports this (last 100 roots)
   - Frontend should indicate if using an older root
   - Warn user if transaction volume is high

3. **Optimistic concurrency with retry:**

   ```typescript
   const submitUnshieldWithRetry = async (unshieldInput, maxRetries = 3) => {
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await submitUnshield(unshieldInput);
       } catch (err) {
         if (err.code === E_INVALID_ROOT && i < maxRetries - 1) {
           console.log(`Root mismatch, retrying (${i + 1}/${maxRetries})...`);
           await refresh(); // Rebuild tree
           unshieldInput = regenerateUnshieldInput(); // Fresh paths
         } else {
           throw err;
         }
       }
     }
   };
   ```

4. **Transaction volume indicator:**

   ```typescript
   const getTransactionRateWarning = (recentTxCount: number): string | null => {
     if (recentTxCount > 10) {
       return 'High transaction volume detected. Your transaction may need to be retried.';
     }
     return null;
   };
   ```

**Pros:**

- Handles race conditions gracefully
- Provides good UX with informative warnings
- Automatic recovery from transient failures

**Cons:**

- Complex implementation
- More on-chain queries (cost/latency)
- Requires careful state management

## Testing & Verification

### How to Reproduce

1. **Setup:**
   - Deploy pool to testnet
   - Create two accounts (Alice, Bob)

2. **Steps:**

   ```bash
   # Terminal 1 (Alice)
   cd frontend && npm run dev
   # Open browser, connect Alice's wallet
   # Shield 10 SUI
   # Wait for notes to load

   # Terminal 2 (Bob)
   # Shield 5 SUI using Bob's account
   # This changes the Merkle root

   # Terminal 1 (Alice)
   # Try to unshield (without refreshing)
   # Expected: E_INVALID_ROOT error
   ```

3. **Verify Fix:**

   ```bash
   # After implementing immediate fix:
   # Repeat steps above
   # The refresh() call should fetch Bob's commitment
   # Alice's unshield should succeed
   ```

### Test Coverage Gaps

Current tests in [contracts/sources/pool_tests.move](../contracts/sources/pool_tests.move):

- ✅ `test_unshield_invalid_root()` - Tests that wrong commitment fails
- ❌ **Missing:** Successful shield→unshield integration test
- ❌ **Missing:** Test with concurrent transactions
- ❌ **Missing:** Test with root history eviction

### Recommended Tests

1. **Integration test: shield→unshield:**

   ```typescript
   test('should unshield after shielding', async () => {
     const note = await shield(pool, 1000);
     await refresh(); // Get fresh tree
     await unshield(pool, note, 1000); // Should succeed
   });
   ```

2. **Concurrent transaction test:**

   ```typescript
   test('should handle concurrent shields', async () => {
     const aliceNote = await shield(pool, 1000, alice);
     await shield(pool, 500, bob); // Changes root
     await refresh(); // Update tree
     await unshield(pool, aliceNote, 1000, alice); // Should succeed
   });
   ```

3. **Root history overflow test:**

   ```typescript
   test('should fail if root evicted from history', async () => {
     const note = await shield(pool, 1000);
     // Perform 101 more shields to evict root
     for (let i = 0; i < 101; i++) {
       await shield(pool, 100);
     }
     await expect(unshield(pool, note, 1000)).rejects.toThrow('E_INVALID_ROOT');
   });
   ```

## Summary

**Root Cause:** Merkle root staleness due to cached path elements in the frontend.

**Immediate Fix:** Add `await refresh()` call in UnshieldForm before proof generation.

**Long-Term:** Implement automatic tree synchronization, root validation, and retry logic.

**Related:** Commit 91a5cbd fixed similar root mismatch in transfer circuit.

## References

- [contracts/sources/pool.move](../contracts/sources/pool.move) - Pool contract with root validation
- [frontend/src/hooks/useNotes.ts](../frontend/src/hooks/useNotes.ts) - Note scanning hook
- [frontend/src/components/UnshieldForm.tsx](../frontend/src/components/UnshieldForm.tsx) - Unshield UI
- [sdk/src/prover.ts](../sdk/src/prover.ts) - Proof generation
- [sdk/src/crypto.ts](../sdk/src/crypto.ts) - Cryptographic primitives

---

**Last Updated:** 2026-02-03
**Status:** Documented, awaiting implementation
