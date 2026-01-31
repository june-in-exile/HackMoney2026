# Milestone 1: Private Transfers (0zk-to-0zk)

**Priority:** 🔴 Highest
**Status:** Not Started
**Estimated Complexity:** High

## Overview

Enable private peer-to-peer transfers between shielded addresses without exiting the privacy pool. Users can send tokens to other users' shielded addresses while keeping sender, recipient, and amount completely private.

## Why This Feature?

**Current Limitation:**

- Users can only shield (public→private) or unshield (private→public)
- Every transaction requires exiting the privacy pool
- Transaction graph analysis can link deposits to withdrawals

**With Private Transfers:**

- Users transact within the privacy pool indefinitely
- Increases anonymity set size (more transactions = better privacy)
- Enables privacy-preserving payments and commerce
- Foundation for all other privacy features (DeFi, relayer network)

## Technical Requirements

### 1. New Circuit: `transfer.circom`

Create a ZK circuit that proves:

- Sender owns input notes (knows spending key)
- Input notes are in Merkle tree (valid commitments)
- Output notes have correct commitments
- Total input value = total output value (conservation)
- Nullifiers are correctly generated
- No double-spending

**Circuit Inputs:**

```circom
// Private inputs
signal input spending_key;
signal input nullifying_key;
signal input input_notes[2];        // Support 2-input, 2-output
signal input input_amounts[2];
signal input merkle_paths[2][16];
signal input merkle_indices[2];
signal input output_npks[2];        // Recipients' note public keys
signal input output_amounts[2];
signal input output_randoms[2];

// Public inputs
signal input root;                  // Merkle root
signal input nullifiers[2];         // Input nullifiers
signal input output_commitments[2]; // Output commitments
```

**Constraints:**

- `input_amounts[0] + input_amounts[1] = output_amounts[0] + output_amounts[1]`
- Verify Merkle proofs for input notes
- Verify nullifier computation: `nullifier = Poseidon(nullifying_key, leaf_index)`
- Verify output commitments: `commitment = Poseidon(npk, token, amount)`

### 2. Move Contract Changes

**File:** `railgun/sources/pool.move`

Add new entry function:

```move
public entry fun transfer<T>(
    pool: &mut PrivacyPool<T>,
    proof_bytes: vector<u8>,           // 128 bytes Groth16 proof
    public_inputs_bytes: vector<u8>,   // Public inputs (root, nullifiers, commitments)
    encrypted_notes: vector<vector<u8>>, // Encrypted notes for recipients
    ctx: &mut TxContext
)
```

**Logic:**

1. Deserialize public inputs (root, nullifiers[2], output_commitments[2])
2. Verify Merkle root matches current tree root
3. Verify Groth16 proof with transfer verification key
4. Check nullifiers are not spent (for both inputs)
5. Mark nullifiers as spent
6. Add output commitments to Merkle tree
7. Emit transfer event with encrypted notes

**New Verification Key:**

- Compile `transfer.circom` circuit
- Generate new verification key (larger than unshield circuit)
- Store in pool object during initialization

### 3. SDK Changes

**File:** `sdk/src/crypto.ts`

Add functions:

```typescript
// Generate recipient's note public key from their master public key
export function deriveNPK(mpk: bigint, random: bigint): bigint

// Encrypt note data for recipient
export function encryptNote(note: Note, recipientMPK: bigint): Uint8Array
```

**File:** `sdk/src/prover.ts`

Add function:

```typescript
export interface TransferInput {
  spendingKey: bigint;
  nullifyingKey: bigint;
  inputNotes: Note[];      // 2 notes
  outputNotes: Note[];     // 2 notes (includes change note)
  merklePaths: string[][];
  merkleIndices: number[];
}

export async function generateTransferProof(
  input: TransferInput
): Promise<{ proof: Uint8Array; publicInputs: Uint8Array }>
```

**File:** `sdk/src/sui.ts`

Add function:

```typescript
export function buildTransferTransaction(
  pool: string,
  proof: Uint8Array,
  publicInputs: Uint8Array,
  encryptedNotes: Uint8Array[],
  tokenType: string
): TransactionBlock
```

### 4. Frontend Changes

**New Component:** `web/src/components/TransferForm.tsx`

Features:

- Recipient address input (MPK or alias)
- Amount input with balance validation
- Note selection (auto-select optimal notes)
- Change note handling (auto-create)
- Progress indicator for proof generation
- Transaction confirmation

**UI Flow:**

1. User enters recipient's MPK and amount
2. SDK selects input notes to cover amount
3. Generate output notes (recipient + change)
4. Fetch Merkle proofs for input notes
5. Generate ZK proof (30-60 seconds)
6. Submit transaction
7. Update local balance

**File:** `web/src/lib/constants.ts`

Add transfer verification key URL:

```typescript
export const TRANSFER_VKEY_URL = '/circuits/transfer_vkey.json'
```

## Implementation Phases

### Phase 1: Circuit Development (Week 1-2)

- [ ] Design `transfer.circom` circuit
- [ ] Implement 2-input, 2-output logic
- [ ] Add input/output balance constraint
- [ ] Test circuit with example inputs
- [ ] Compile circuit (`./compile_transfer.sh`)
- [ ] Generate proving key (~10-20 MB)
- [ ] Generate verification key (~500 bytes)

### Phase 2: Move Contract (Week 2-3)

- [ ] Add `transfer()` entry function
- [ ] Integrate transfer verification key
- [ ] Add nullifier checks for 2 inputs
- [ ] Add commitment insertion for 2 outputs
- [ ] Write unit tests (10+ test cases)
- [ ] Test with real proofs from circuit
- [ ] Deploy to testnet

### Phase 3: SDK Integration (Week 3-4)

- [ ] Implement `generateTransferProof()`
- [ ] Add note encryption/decryption
- [ ] Implement optimal note selection algorithm
- [ ] Add change note generation
- [ ] Build `TransferInput` from user input
- [ ] Write unit tests
- [ ] Test end-to-end with testnet

### Phase 4: Frontend (Week 4-5)

- [ ] Create `TransferForm.tsx` component
- [ ] Add recipient MPK input and validation
- [ ] Implement note selection UI
- [ ] Add proof generation progress
- [ ] Deploy transfer circuit artifacts to `/public/circuits/`
- [ ] Test in browser
- [ ] Add transaction history view

### Phase 5: Testing & Optimization (Week 5-6)

- [ ] End-to-end testing (10+ scenarios)
- [ ] Test edge cases (insufficient balance, invalid recipient)
- [ ] Optimize circuit (reduce constraints if possible)
- [ ] Optimize proof generation time
- [ ] Security audit of circuit logic
- [ ] Performance benchmarking

## Files to Create/Modify

### New Files

- `circuits/transfer.circom` - Transfer circuit
- `circuits/compile_transfer.sh` - Compilation script
- `web/src/components/TransferForm.tsx` - Transfer UI
- `web/public/circuits/transfer_js/transfer.wasm` - Circuit WASM
- `web/public/circuits/transfer_final.zkey` - Proving key
- `sdk/src/__tests__/transfer.test.ts` - SDK tests
- `railgun/tests/transfer_tests.move` - Move tests

### Modified Files

- `railgun/sources/pool.move` - Add transfer() function
- `sdk/src/crypto.ts` - Add encryption functions
- `sdk/src/prover.ts` - Add generateTransferProof()
- `sdk/src/sui.ts` - Add buildTransferTransaction()
- `web/src/app/page.tsx` - Add Transfer tab
- `web/src/lib/constants.ts` - Add transfer circuit URLs

## Success Criteria

- [ ] Circuit compiles with <50K constraints
- [ ] All Move tests pass (23+ tests)
- [ ] SDK generates valid proofs in <60 seconds
- [ ] Frontend successfully sends private transfer
- [ ] Transaction verifies on-chain
- [ ] Recipient can see and spend received note
- [ ] Sender's identity remains hidden
- [ ] Zero information leaked about amount

## Testing Checklist

### Circuit Tests

- [ ] Valid 2-input, 2-output transfer
- [ ] Single input, single output (with zero padding)
- [ ] Merkle proof verification
- [ ] Nullifier computation
- [ ] Balance conservation constraint
- [ ] Invalid proof rejected

### Contract Tests

- [ ] Valid transfer succeeds
- [ ] Invalid proof rejected
- [ ] Double-spend prevented (nullifier reuse)
- [ ] Wrong root rejected
- [ ] Commitments added to tree
- [ ] Event emitted with encrypted notes

### Integration Tests

- [ ] Alice transfers 1 SUI to Bob
- [ ] Bob receives and decrypts note
- [ ] Bob spends received note
- [ ] Alice sends change note to herself
- [ ] Multiple sequential transfers
- [ ] Concurrent transfers from different users

## Security Considerations

1. **Circuit Soundness:** Ensure constraints prevent:
   - Value inflation (creating tokens out of thin air)
   - Double-spending (reusing input notes)
   - Invalid Merkle proofs

2. **Note Encryption:** Use secure encryption for recipient notes:
   - ECIES or similar scheme
   - Authenticated encryption (prevent tampering)

3. **Front-Running Protection:**
   - Nullifiers prevent front-running attacks
   - Merkle root updates handled correctly

4. **Privacy Leakage Prevention:**
   - No correlation between input/output notes
   - Transaction timing doesn't reveal patterns
   - Encrypted notes unreadable by third parties

## Performance Targets

- **Circuit Compilation:** <5 minutes
- **Proof Generation:** <60 seconds (browser)
- **Proof Verification:** <50ms (on-chain)
- **Circuit Size:** <50,000 constraints
- **Proving Key Size:** <20 MB
- **Verification Key Size:** <1 KB

## References

- [Zcash Sapling Protocol](https://github.com/zcash/zips/blob/master/protocol/sapling.pdf) - 2-input, 2-output UTXO design
- [Railgun Transfer Circuit](https://docs.railgun.org/developer-guide/wallet/transactions/transfers)
- [snarkjs Documentation](https://github.com/iden3/snarkjs) - Groth16 proof generation
- [Circom Documentation](https://docs.circom.io/) - Circuit language reference
- [Poseidon Hash](https://www.poseidon-hash.info/) - ZK-friendly hash function

## Next Steps After Completion

Once private transfers are working:

1. Add multi-note transfers (3+ inputs/outputs)
2. Implement relayer network for anonymous transaction submission
3. Enable DeFi integration (private swaps)
4. Add transaction batching for efficiency
