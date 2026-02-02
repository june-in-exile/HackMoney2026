# Milestone 4: Compliance Features

**Priority:** 🟢 Medium
**Status:** Not Started
**Estimated Complexity:** Very High
**Dependencies:** Private Transfers (Milestone 1)

## Overview

Implement compliance and regulatory features that allow users to prove their funds are legitimate while maintaining privacy. This includes Private Proofs of Innocence, view keys for selective disclosure, and integration with screening services.

## Why This Feature?

**Regulatory Reality:**

- Privacy protocols face scrutiny for potential illicit use
- Inability to prove fund legitimacy limits adoption
- Exchanges may delist privacy tokens without compliance tools
- Institutional users require audit capabilities

**With Compliance Features:**

- Users can prove their funds are not from sanctioned addresses
- Selective disclosure to auditors/regulators (view keys)
- Automated screening prevents illicit funds from entering
- Builds trust and legitimacy for privacy protocol
- Enables institutional adoption

## Core Components

### 1. Private Proofs of Innocence (PPOI)

**Concept:** Users prove their shielded funds did NOT originate from a sanctioned address list, without revealing which addresses they came from.

**How It Works:**

```
User → Generate ZK Proof → "My funds are NOT from any of these 10,000 sanctioned addresses"
     → Protocol verifies proof
     → Allow/deny shield operation
```

**Technical Challenge:** Proving non-membership in a large set (10K+ addresses) is computationally expensive in ZK circuits.

### 2. View Keys

**Concept:** Users can generate cryptographic keys that allow selective disclosure of transaction history to specific parties (auditors, tax authorities, regulators).

**Types:**

- **Full View Key:** Reveals all transactions, amounts, counterparties
- **Selective View Key:** Reveals specific transactions or time periods
- **Incoming View Key:** Reveals only incoming transactions (for tax reporting)

### 3. Compliance Database

**Concept:** Maintain an on-chain or off-chain registry of sanctioned addresses (OFAC, UN sanctions lists) that are blocked from using the protocol.

## Phase 1: Private Proofs of Innocence (Week 1-4)

### Technical Design

#### Challenge: Efficient Non-Membership Proofs

Naive approach (check each address):

```circom
for i in 0..10000:
    assert(deposit_address != sanctioned_addresses[i])
```

**Problem:** 10K constraints, circuit too large!

#### Solution: Merkle Tree Accumulator

1. Build Merkle tree of sanctioned addresses
2. User proves their address is NOT in tree
3. Use non-membership proof (complement of membership proof)

**Alternative: Polynomial Commitments**

- Represent sanctioned list as polynomial
- Prove evaluation at user's address ≠ 0
- More efficient than Merkle tree for large lists

#### Chosen Approach: Merkle Non-Membership Proof

**File:** `circuits/ppoi.circom`

```circom
template PrivateProofOfInnocence(sanctioned_tree_depth) {
    // Private inputs
    signal input deposit_address;
    signal input deposit_path[sanctioned_tree_depth];  // Merkle path
    signal input deposit_index;

    // Public inputs
    signal input sanctioned_root;  // Merkle root of sanctioned addresses
    signal input deposit_commitment;  // Hash of deposit details

    // 1. Verify deposit_commitment = Hash(deposit_address, ...)
    signal computed_commitment = Poseidon(deposit_address, ...);
    computed_commitment === deposit_commitment;

    // 2. Prove deposit_address is NOT in sanctioned tree
    // Method: Show that Merkle path leads to a DIFFERENT address
    signal path_root = ComputeMerkleRoot(ZERO, deposit_path, deposit_index);
    path_root === sanctioned_root;

    // If user's address was in tree, path would match
    // By showing path for ZERO leads to root, we prove address NOT in tree
}
```

**Key Insight:** Non-membership = membership proof for a placeholder value (zero) at that index.

### 1. Sanctioned Address List Management

**File:** `contracts/sources/compliance.move`

```move
module octopus::compliance {
    use sui::object::{Self, UID};
    use sui::tx_context::TxContext;
    use std::vector;

    struct ComplianceRegistry has key {
        id: UID,
        sanctioned_root: vector<u8>,  // Merkle root (32 bytes)
        last_updated: u64,
        total_sanctioned: u64,
    }

    struct SanctionedAddress has store {
        address_hash: vector<u8>,
        added_at: u64,
        source: vector<u8>,  // "OFAC", "UN", etc.
    }

    // Admin-only function
    public entry fun update_sanctioned_root(
        registry: &mut ComplianceRegistry,
        new_root: vector<u8>,
        admin_cap: &AdminCap,
        ctx: &mut TxContext
    ) {
        registry.sanctioned_root = new_root;
        registry.last_updated = tx_context::epoch(ctx);
    }

    public fun check_sanctioned_root(
        registry: &ComplianceRegistry
    ): vector<u8> {
        registry.sanctioned_root
    }
}
```

### 2. Shield with PPOI

**Modified Function:** `contracts/sources/pool.move::shield()`

```move
public entry fun shield_with_ppoi<T>(
    pool: &mut PrivacyPool<T>,
    compliance_registry: &ComplianceRegistry,
    coin: Coin<T>,
    commitment: vector<u8>,
    encrypted_note: vector<u8>,
    ppoi_proof: vector<u8>,        // PPOI ZK proof
    ppoi_public_inputs: vector<u8>, // Address commitment + root
    ctx: &mut TxContext
) {
    // 1. Verify PPOI proof
    let sanctioned_root = compliance::check_sanctioned_root(compliance_registry);
    let valid = verifier::verify_ppoi_proof(
        ppoi_proof,
        ppoi_public_inputs,
        sanctioned_root
    );
    assert!(valid, INVALID_PPOI_PROOF);

    // 2. Proceed with normal shield operation
    let amount = coin::value(&coin);
    balance::join(&mut pool.token_balance, coin::into_balance(coin));
    merkle_tree::insert(&mut pool.tree, commitment);

    // ... rest of shield logic
}
```

### 3. SDK Changes

**File:** `sdk/src/compliance.ts` (new file)

```typescript
export interface PPOIInput {
  depositAddress: string;        // User's public address
  sanctionedRoot: Uint8Array;    // Current sanctioned list root
  merkleProof: string[];         // Non-membership proof
  merkleIndex: number;
}

export async function generatePPOIProof(
  input: PPOIInput
): Promise<{ proof: Uint8Array; publicInputs: Uint8Array }> {
  // 1. Load PPOI circuit
  const wasmPath = '/circuits/ppoi_js/ppoi.wasm';
  const zkeyPath = '/circuits/ppoi_final.zkey';

  // 2. Prepare circuit inputs
  const circuitInputs = {
    deposit_address: addressToFieldElement(input.depositAddress),
    sanctioned_root: input.sanctionedRoot,
    deposit_path: input.merkleProof,
    deposit_index: input.merkleIndex,
  };

  // 3. Generate proof
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInputs,
    wasmPath,
    zkeyPath
  );

  return {
    proof: serializeProof(proof),
    publicInputs: serializePublicInputs(publicSignals),
  };
}

export async function fetchSanctionedRoot(
  client: SuiClient,
  complianceRegistry: string
): Promise<Uint8Array> {
  const registry = await client.getObject({
    id: complianceRegistry,
    options: { showContent: true },
  });

  return parseRootFromRegistry(registry);
}
```

### 4. Frontend Changes

**Modified Component:** `frontend/src/components/ShieldForm.tsx`

Add PPOI generation step:

```typescript
const handleShield = async () => {
  // 1. Fetch current sanctioned root
  const sanctionedRoot = await fetchSanctionedRoot(suiClient, COMPLIANCE_REGISTRY_ID);

  // 2. Generate non-membership proof for user's address
  const ppoiProof = await generatePPOIProof({
    depositAddress: currentAddress,
    sanctionedRoot,
    merkleProof: await generateNonMembershipProof(currentAddress, sanctionedRoot),
    merkleIndex: 0, // Placeholder index
  });

  // 3. Submit shield transaction with PPOI proof
  const tx = buildShieldWithPPOITransaction(
    poolId,
    coin,
    commitment,
    encryptedNote,
    ppoiProof.proof,
    ppoiProof.publicInputs
  );

  await signAndExecute(tx);
};
```

### 5. Sanctioned List Updater Service

**File:** `compliance-updater/src/index.ts`

Background service that:

1. Fetches OFAC/UN sanctions lists daily
2. Hashes sanctioned addresses
3. Builds Merkle tree
4. Submits new root to on-chain registry
5. Publishes updated Merkle tree for users to download

```typescript
import { fetchOFACSanctionsList } from './ofac-api';
import { buildMerkleTree } from './merkle';
import { updateOnChainRegistry } from './sui-updater';

async function updateSanctionedList() {
  // 1. Fetch latest sanctions
  const ofacList = await fetchOFACSanctionsList();
  const unList = await fetchUNSanctionsList();
  const combined = [...ofacList, ...unList];

  // 2. Hash addresses
  const hashes = combined.map(addr => hashAddress(addr));

  // 3. Build Merkle tree
  const tree = buildMerkleTree(hashes);
  const root = tree.getRoot();

  // 4. Update on-chain registry
  await updateOnChainRegistry(root);

  // 5. Publish tree for users
  await publishTreeToIPFS(tree);
}

// Run daily
setInterval(updateSanctionedList, 24 * 60 * 60 * 1000);
```

## Phase 2: View Keys (Week 4-6)

### Technical Design

**Key Derivation:**

```
Master Spending Key (MSK)
    ↓
Master Public Key (MPK)
    ↓
View Key (VK) = Hash(MSK, "view_key_derivation")
    ↓
View Key reveals: All transactions associated with MPK
```

### 1. View Key Generation

**File:** `sdk/src/viewkey.ts`

```typescript
export interface ViewKey {
  vk: bigint;           // Viewing key
  mpk: bigint;          // Master public key (for matching notes)
  createdAt: number;
}

export function generateViewKey(masterSpendingKey: bigint): ViewKey {
  const mpk = deriveMPK(masterSpendingKey);
  const vk = poseidon([masterSpendingKey, stringToField('view_key')]);

  return {
    vk,
    mpk,
    createdAt: Date.now(),
  };
}

export function exportViewKey(viewKey: ViewKey): string {
  // Encode as base64 for sharing
  return btoa(JSON.stringify(viewKey));
}

export function importViewKey(encoded: string): ViewKey {
  return JSON.parse(atob(encoded));
}
```

### 2. Transaction Decryption with View Key

**File:** `sdk/src/viewkey.ts`

```typescript
export async function decryptTransactionHistory(
  viewKey: ViewKey,
  poolId: string,
  client: SuiClient
): Promise<Transaction[]> {
  // 1. Fetch all events from pool
  const events = await client.queryEvents({
    query: {
      MoveEventType: `${PACKAGE_ID}::pool::NoteAdded`,
    },
  });

  // 2. Attempt to decrypt each note
  const transactions: Transaction[] = [];

  for (const event of events) {
    const encryptedNote = event.parsedJson.encrypted_note;

    try {
      // Decrypt using view key
      const note = decryptNoteWithViewKey(encryptedNote, viewKey);

      // Check if note belongs to this view key (matches MPK)
      if (note.npk === viewKey.mpk) {
        transactions.push({
          timestamp: event.timestampMs,
          type: event.type,
          amount: note.amount,
          token: note.token,
          commitment: event.parsedJson.commitment,
        });
      }
    } catch (e) {
      // Not our note, skip
      continue;
    }
  }

  return transactions;
}
```

### 3. Frontend View Key Management

**New Component:** `frontend/src/components/ViewKeyManager.tsx`

Features:

- Generate view key from master key
- Export view key (QR code, text)
- Import view key
- Revoke view key (time-limited keys)
- Preview transaction history with view key

**New Page:** `frontend/src/app/audit/page.tsx`

Auditor portal:

- Import view key from user
- Display full transaction history
- Filter by date range
- Export report (CSV, PDF)
- Verify specific transactions

### 4. Selective Disclosure

**Enhanced Feature:** Time-limited view keys

```typescript
export interface SelectiveViewKey extends ViewKey {
  startDate: number;
  endDate: number;
  txTypes: ('shield' | 'unshield' | 'transfer')[];
}

export function generateSelectiveViewKey(
  masterSpendingKey: bigint,
  options: SelectiveViewKeyOptions
): SelectiveViewKey {
  const baseViewKey = generateViewKey(masterSpendingKey);

  return {
    ...baseViewKey,
    startDate: options.startDate,
    endDate: options.endDate,
    txTypes: options.txTypes,
  };
}

export function decryptWithSelectiveKey(
  viewKey: SelectiveViewKey,
  poolId: string,
  client: SuiClient
): Promise<Transaction[]> {
  // Only decrypt transactions within date range and matching types
  const allTxs = await decryptTransactionHistory(viewKey, poolId, client);

  return allTxs.filter(tx =>
    tx.timestamp >= viewKey.startDate &&
    tx.timestamp <= viewKey.endDate &&
    viewKey.txTypes.includes(tx.type)
  );
}
```

## Phase 3: Tax Reporting (Week 6-7)

### 1. Tax Report Generator

**File:** `sdk/src/tax.ts`

```typescript
export interface TaxReport {
  userId: string;
  taxYear: number;
  totalShielded: bigint;
  totalUnshielded: bigint;
  capitalGains: bigint;
  transactions: TaxTransaction[];
}

export async function generateTaxReport(
  viewKey: ViewKey,
  taxYear: number,
  client: SuiClient
): Promise<TaxReport> {
  // 1. Fetch all transactions for tax year
  const startDate = new Date(taxYear, 0, 1).getTime();
  const endDate = new Date(taxYear, 11, 31).getTime();

  const transactions = await decryptTransactionHistory(viewKey, POOL_ID, client);
  const yearTxs = transactions.filter(tx =>
    tx.timestamp >= startDate && tx.timestamp <= endDate
  );

  // 2. Calculate totals
  const totalShielded = yearTxs
    .filter(tx => tx.type === 'shield')
    .reduce((sum, tx) => sum + tx.amount, 0n);

  const totalUnshielded = yearTxs
    .filter(tx => tx.type === 'unshield')
    .reduce((sum, tx) => sum + tx.amount, 0n);

  // 3. Calculate capital gains (price at shield vs. unshield)
  const capitalGains = calculateCapitalGains(yearTxs);

  return {
    userId: viewKey.mpk.toString(),
    taxYear,
    totalShielded,
    totalUnshielded,
    capitalGains,
    transactions: yearTxs,
  };
}

export function exportTaxReportCSV(report: TaxReport): string {
  // Export as CSV for TurboTax, CoinTracker, etc.
  const csv = [
    'Date,Type,Amount,Token,Price,Capital Gain',
    ...report.transactions.map(tx =>
      `${new Date(tx.timestamp).toISOString()},${tx.type},${tx.amount},${tx.token},${tx.price},${tx.capitalGain}`
    )
  ].join('\n');

  return csv;
}
```

### 2. Frontend Tax Dashboard

**New Page:** `frontend/src/app/tax/page.tsx`

Features:

- Select tax year
- Generate tax report
- Display summary (total in/out, gains)
- Export CSV for tax software
- Download PDF report

## Implementation Phases

### Phase 1: PPOI Circuit & Contract (Week 1-2)

- [ ] Design `ppoi.circom` circuit
- [ ] Implement non-membership proof logic
- [ ] Compile circuit and generate keys
- [ ] Create `compliance.move` registry
- [ ] Modify `shield()` to require PPOI
- [ ] Write tests (10+ cases)

### Phase 2: Sanctioned List Management (Week 2-3)

- [ ] Build sanctioned list updater service
- [ ] Integrate OFAC API
- [ ] Build Merkle tree builder
- [ ] Deploy updater service
- [ ] Publish initial sanctioned list
- [ ] Test PPOI generation with real list

### Phase 3: SDK & Frontend (Week 3-4)

- [ ] Implement `sdk/src/compliance.ts`
- [ ] Add PPOI proof generation to SDK
- [ ] Modify `ShieldForm` to include PPOI
- [ ] Deploy PPOI circuit artifacts
- [ ] Test end-to-end shield with PPOI
- [ ] User testing

### Phase 4: View Keys (Week 4-5)

- [ ] Implement view key generation
- [ ] Add transaction decryption with view key
- [ ] Create `ViewKeyManager` component
- [ ] Build auditor portal
- [ ] Test selective disclosure
- [ ] Privacy audit

### Phase 5: Tax Reporting (Week 5-6)

- [ ] Implement tax report generator
- [ ] Add capital gains calculation
- [ ] Build tax dashboard UI
- [ ] CSV export for tax software
- [ ] Test with real data
- [ ] Documentation for accountants

### Phase 6: Testing & Launch (Week 6-7)

- [ ] End-to-end compliance testing
- [ ] Security audit of circuits
- [ ] Legal review of compliance features
- [ ] User documentation
- [ ] Launch compliance features
- [ ] Monitor adoption

## Files to Create/Modify

### New Files

- `circuits/ppoi.circom` - PPOI circuit
- `circuits/compile_ppoi.sh` - Compilation script
- `contracts/sources/compliance.move` - Compliance registry
- `compliance-updater/src/index.ts` - List updater
- `sdk/src/compliance.ts` - PPOI SDK
- `sdk/src/viewkey.ts` - View key SDK
- `sdk/src/tax.ts` - Tax reporting
- `frontend/src/components/ViewKeyManager.tsx` - View key UI
- `frontend/src/app/audit/page.tsx` - Auditor portal
- `frontend/src/app/tax/page.tsx` - Tax dashboard

### Modified Files

- `contracts/sources/pool.move` - Add shield_with_ppoi()
- `frontend/src/components/ShieldForm.tsx` - Add PPOI step

## Success Criteria

- [ ] PPOI circuit compiles with <100K constraints
- [ ] Sanctioned list updates daily
- [ ] Shield with PPOI succeeds
- [ ] Sanctioned addresses blocked from shielding
- [ ] View key reveals full transaction history
- [ ] Selective view key works correctly
- [ ] Tax report generates accurate data
- [ ] CSV export compatible with tax software

## Testing Checklist

### PPOI Tests

- [ ] Valid non-membership proof succeeds
- [ ] Sanctioned address proof fails
- [ ] Merkle tree updates correctly
- [ ] Circuit constraints sound
- [ ] Invalid proof rejected

### View Key Tests

- [ ] View key decrypts all user transactions
- [ ] View key cannot decrypt others' transactions
- [ ] Selective view key filters correctly
- [ ] Time-limited view key expires
- [ ] View key export/import works

### Tax Report Tests

- [ ] Correct totals calculated
- [ ] Capital gains accurate
- [ ] Date filtering works
- [ ] CSV export valid
- [ ] Multi-year reports

## Security Considerations

1. **PPOI Soundness:**
   - Ensure non-membership proof is cryptographically sound
   - Prevent proof forgery
   - Regularly update sanctioned list

2. **View Key Protection:**
   - View keys should be generated securely
   - Warn users about sharing view keys
   - Implement key revocation (time-limits)

3. **Privacy Preservation:**
   - PPOI reveals NO information about deposit source
   - View keys are opt-in (user-controlled disclosure)
   - Auditors cannot decrypt without view key

4. **List Management:**
   - Admin key security for registry updates
   - Multi-sig for list updates
   - Transparent list sources (OFAC, UN)

## Performance Targets

- **PPOI Proof Generation:** <120 seconds
- **PPOI Verification:** <100ms on-chain
- **PPOI Circuit Size:** <100K constraints
- **View Key Decryption:** <5 seconds for 100 transactions
- **Tax Report Generation:** <10 seconds
- **List Update Frequency:** Daily

## Legal Considerations

**DISCLAIMER:** This is technical documentation only. Legal review required.

### Regulatory Compliance

1. **Know Your Customer (KYC):**
   - PPOI provides "negative KYC" (prove NOT sanctioned)
   - Does not identify user
   - May not satisfy all jurisdictions

2. **Anti-Money Laundering (AML):**
   - Blocks known illicit addresses
   - View keys enable post-hoc investigation
   - Transparent compliance process

3. **Tax Compliance:**
   - Tax reporting tools assist users
   - Users responsible for reporting
   - Coordinate with tax professionals

4. **Jurisdictional Variations:**
   - US: OFAC compliance
   - EU: GDPR considerations
   - Asia: Varies by country

**Recommendation:** Consult legal counsel before deploying compliance features.

## References

- [Railgun Private Proofs of Innocence](https://docs.octopus.org/wiki/learn/privacy-system/private-proofs-of-innocence)
- [Zcash Viewing Keys](https://z.cash/technology/viewing-keys/)
- [OFAC Sanctions Lists](https://ofac.treasury.gov/specially-designated-nationals-and-blocked-persons-list-sdn-human-readable-lists)
- [Chainalysis Compliance Solutions](https://www.chainalysis.com/solutions/compliance/)
- [TRM Labs Compliance](https://www.trmlabs.com/products/compliance)

## Next Steps After Completion

Once compliance features are live:

1. Integrate with compliance services (Chainalysis, TRM)
2. Add KYC integration for institutional users
3. Implement multi-jurisdiction compliance
4. Build compliance API for exchanges
5. Regular security audits and penetration testing
