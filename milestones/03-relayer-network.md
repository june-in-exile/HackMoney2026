# Milestone 3: Relayer/Broadcaster Network

**Priority:** 🟠 Medium-High
**Status:** Not Started
**Estimated Complexity:** High
**Dependencies:** Private Transfers (Milestone 1)

## Overview

Create a decentralized network of relayers that submit transactions on behalf of users, hiding their public wallet addresses and breaking the link between shielded operations and user identities.

## Why This Feature?

**Current Privacy Leak:**

- Users submit transactions directly from their wallets
- Transaction metadata reveals:
  - Sender's public address
  - Transaction timing patterns
  - Gas payment source
- Blockchain explorer shows user's transaction history
- Can link shield/unshield operations to same address

**With Relayer Network:**

- Transactions appear to originate from relayer addresses
- User's public address never touches privacy pool
- Gas paid by relayer (user reimburses in shielded tokens)
- Breaks on-chain correlation between operations
- Stronger privacy guarantees

## Technical Architecture

### Communication Flow

```
User (Browser) → Encrypted Request → Relayer Server
                                         ↓
                                  Verify Request
                                         ↓
                                  Submit Transaction
                                         ↓
                                    Sui Blockchain
                                         ↓
                                  Return TX Hash
                                         ↓
User (Browser) ← TX Confirmation ← Relayer Server
```

### Key Components

1. **Relayer Server:** Backend service that:
   - Accepts encrypted transaction requests
   - Validates requests (prevent spam/attacks)
   - Submits transactions to blockchain
   - Pays gas fees upfront
   - Returns transaction hash to user

2. **Fee Mechanism:** User reimburses relayer via:
   - Additional output note to relayer's NPK
   - Fee amount = gas_cost * (1 + fee_premium)
   - Default premium: 10% (configurable per relayer)

3. **Relayer Registry:** On-chain registry of:
   - Active relayers (address + NPK)
   - Fee rates
   - Reputation/uptime metrics
   - Stake requirements (anti-spam)

## Phase 1: Basic Relayer Implementation (Week 1-3)

### 1. Relayer Server Architecture

**Technology Stack:**

- Node.js + Express (REST API)
- TypeScript for type safety
- Sui TypeScript SDK for transaction submission
- Redis for request queuing
- PostgreSQL for transaction logging

**File Structure:**

```
relayer/
├── src/
│   ├── server.ts           # Express server
│   ├── relayer.ts          # Transaction submission logic
│   ├── validator.ts        # Request validation
│   ├── fee-calculator.ts   # Dynamic fee calculation
│   ├── queue.ts            # Request queue management
│   └── database.ts         # Transaction logging
├── config/
│   ├── relayer-config.ts   # Configuration (fee rate, RPC URL)
│   └── sui-keypair.json    # Relayer's Sui keypair
├── tests/
│   └── relayer.test.ts
└── package.json
```

### 2. API Endpoints

**POST /submit**

```typescript
interface SubmitRequest {
  transaction: {
    pool: string;
    proof: string;          // Hex-encoded proof
    publicInputs: string;   // Hex-encoded public inputs
    encryptedNotes: string[];
    tokenType: string;
  };
  signature: string;        // User signs request (anti-replay)
  feeNote: {
    commitment: string;     // Fee payment note commitment
    encryptedNote: string;  // Encrypted for relayer
  };
}

interface SubmitResponse {
  txHash: string;
  status: 'pending' | 'success' | 'failed';
  gasUsed: number;
  fee: number;
}
```

**GET /fee-quote**

```typescript
interface FeeQuoteRequest {
  transactionType: 'transfer' | 'swap' | 'unshield';
  tokenType: string;
}

interface FeeQuoteResponse {
  baseFee: number;        // Current gas cost estimate
  relayerPremium: number; // Relayer's markup (e.g., 0.1 = 10%)
  totalFee: number;       // baseFee * (1 + relayerPremium)
  expiresAt: number;      // Timestamp (quote valid for 1 minute)
}
```

**GET /relayer-info**

```typescript
interface RelayerInfo {
  address: string;         // Relayer's Sui address
  npk: string;            // Relayer's note public key (for fee payments)
  feePremium: number;     // Current fee premium
  uptime: number;         // Percentage (0-100)
  totalTransactions: number;
  supportedTokens: string[];
}
```

### 3. Transaction Submission Logic

**File:** `relayer/src/relayer.ts`

```typescript
import { SuiClient, TransactionBlock } from '@mysten/sui.js';

export class Relayer {
  private client: SuiClient;
  private keypair: Ed25519Keypair;
  private feePremium: number;

  async submitTransaction(request: SubmitRequest): Promise<string> {
    // 1. Validate request signature (prevent replay attacks)
    this.validateSignature(request);

    // 2. Build transaction from request data
    const tx = new TransactionBlock();
    tx.moveCall({
      target: `${PACKAGE_ID}::pool::transfer`,
      arguments: [
        tx.object(request.transaction.pool),
        tx.pure(hexToBytes(request.transaction.proof)),
        tx.pure(hexToBytes(request.transaction.publicInputs)),
        // ... other arguments
      ],
      typeArguments: [request.transaction.tokenType],
    });

    // 3. Sign and submit transaction
    const result = await this.client.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      signer: this.keypair,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });

    // 4. Verify fee note was included (user paid relayer)
    await this.verifyFeePayment(result, request.feeNote);

    // 5. Log transaction for accounting
    await this.logTransaction(result);

    return result.digest;
  }

  private async verifyFeePayment(
    result: SuiTransactionBlockResponse,
    feeNote: FeeNote
  ): Promise<void> {
    // Check that fee note commitment appears in transaction
    // Decrypt note to verify amount matches quote
    // Mark fee as received
  }
}
```

### 4. Move Contract Changes

**File:** `railgun/sources/pool.move`

No contract changes needed! Relayers simply submit transactions on behalf of users using existing entry functions.

**Key Insight:** The ZK proof already proves user authorization. Relayer is just a transaction broadcaster, not a trusted party.

### 5. SDK Changes

**File:** `sdk/src/relayer.ts` (new file)

```typescript
export interface RelayerConfig {
  url: string;
  npk: bigint;
  feePremium: number;
}

export class RelayerClient {
  constructor(private config: RelayerConfig) {}

  async getFeeQuote(
    transactionType: string,
    tokenType: string
  ): Promise<FeeQuote> {
    const response = await fetch(`${this.config.url}/fee-quote`, {
      method: 'POST',
      body: JSON.stringify({ transactionType, tokenType }),
    });
    return response.json();
  }

  async submitTransaction(
    transaction: Transaction,
    userKeypair: Keypair,
    feeNote: Note
  ): Promise<string> {
    // 1. Get fee quote
    const quote = await this.getFeeQuote(
      transaction.type,
      transaction.tokenType
    );

    // 2. Create fee payment note to relayer
    const feeNoteToRelayer = createNote(
      this.config.npk,
      transaction.tokenType,
      quote.totalFee
    );

    // 3. Sign request (anti-replay)
    const signature = signRequest(transaction, userKeypair);

    // 4. Submit to relayer
    const response = await fetch(`${this.config.url}/submit`, {
      method: 'POST',
      body: JSON.stringify({
        transaction,
        signature,
        feeNote: {
          commitment: feeNoteToRelayer.commitment,
          encryptedNote: encryptNote(feeNoteToRelayer, this.config.npk),
        },
      }),
    });

    return response.json().txHash;
  }
}
```

**File:** `sdk/src/crypto.ts`

Add signing functions:

```typescript
export function signRequest(
  transaction: Transaction,
  keypair: Keypair
): string {
  // Sign transaction data with user's spending key
  // Prevents replay attacks
}

export function verifySignature(
  transaction: Transaction,
  signature: string,
  publicKey: bigint
): boolean
```

### 6. Frontend Changes

**New Component:** `web/src/components/RelayerSelector.tsx`

Features:

- List of available relayers
- Display fee rates for each relayer
- Uptime/reputation indicators
- Select preferred relayer
- Option to use direct submission (no relayer)

**Modified Component:** `web/src/components/TransferForm.tsx`

Add relayer option:

```typescript
const [useRelayer, setUseRelayer] = useState(true);
const [selectedRelayer, setSelectedRelayer] = useState<RelayerConfig>();

// When submitting transaction
if (useRelayer && selectedRelayer) {
  const relayerClient = new RelayerClient(selectedRelayer);
  const txHash = await relayerClient.submitTransaction(tx, keypair, feeNote);
} else {
  // Direct submission (current behavior)
  const txHash = await suiClient.submitTransaction(tx);
}
```

## Phase 2: Relayer Discovery & Registry (Week 3-4)

### 1. Relayer Registry Contract

**File:** `railgun/sources/relayer_registry.move`

```move
module railgun::relayer_registry {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::table::{Self, Table};

    struct RelayerRegistry has key {
        id: UID,
        relayers: Table<address, RelayerInfo>,
    }

    struct RelayerInfo has store {
        npk: vector<u8>,          // Note public key (32 bytes)
        fee_premium_bps: u64,     // Basis points (1000 = 10%)
        stake: u64,               // Staked SUI (anti-spam)
        total_txs: u64,
        failed_txs: u64,
        registered_at: u64,
    }

    public entry fun register_relayer(
        registry: &mut RelayerRegistry,
        npk: vector<u8>,
        fee_premium_bps: u64,
        stake: Coin<SUI>,
        ctx: &mut TxContext
    ) {
        // Minimum stake: 100 SUI
        assert!(coin::value(&stake) >= 100_000_000_000, INSUFFICIENT_STAKE);

        let relayer_addr = tx_context::sender(ctx);
        table::add(&mut registry.relayers, relayer_addr, RelayerInfo {
            npk,
            fee_premium_bps,
            stake: coin::value(&stake),
            total_txs: 0,
            failed_txs: 0,
            registered_at: tx_context::epoch(ctx),
        });

        // Lock stake in registry
        // ... transfer stake logic
    }

    public entry fun update_fee(
        registry: &mut RelayerRegistry,
        new_fee_premium_bps: u64,
        ctx: &mut TxContext
    ) {
        let relayer = table::borrow_mut(
            &mut registry.relayers,
            tx_context::sender(ctx)
        );
        relayer.fee_premium_bps = new_fee_premium_bps;
    }
}
```

### 2. Frontend Relayer Discovery

**File:** `web/src/lib/relayerRegistry.ts`

```typescript
export async function fetchRelayers(
  client: SuiClient,
  registryId: string
): Promise<RelayerConfig[]> {
  const registry = await client.getObject({
    id: registryId,
    options: { showContent: true },
  });

  // Parse relayers from registry table
  // Sort by fee rate, uptime, reputation
  return relayers.map(r => ({
    address: r.address,
    url: lookupRelayerUrl(r.address), // From off-chain directory
    npk: BigInt(r.npk),
    feePremium: r.fee_premium_bps / 10000,
    uptime: calculateUptime(r),
    reputation: calculateReputation(r),
  }));
}
```

## Phase 3: Advanced Features (Week 4-6)

### 1. Request Batching

Relayers can batch multiple user transactions:

- Submit 5-10 transactions in single block
- Split gas costs across users
- Reduce per-transaction fees
- Increase privacy (harder to correlate users)

### 2. Failover & Redundancy

If primary relayer fails:

- Client automatically retries with backup relayer
- Maintain list of 3-5 trusted relayers
- Timeout detection (30 seconds)

### 3. Decentralized Relayer Network

Long-term vision:

- Anyone can run a relayer node
- Reputation system based on uptime
- Economic incentives (fee market)
- Slashing for misbehavior

### 4. MEV Protection

Relayers commit to:

- First-come-first-served ordering
- No front-running user transactions
- Transparent fee calculation
- Reputation loss if violated

## Implementation Phases

### Phase 1: Single Relayer (Week 1-2)

- [ ] Set up relayer server (Node.js + Express)
- [ ] Implement transaction submission endpoint
- [ ] Add fee calculation logic
- [ ] Deploy relayer with testnet keypair
- [ ] Test transaction submission
- [ ] Logging and monitoring

### Phase 2: SDK Integration (Week 2-3)

- [ ] Create `sdk/src/relayer.ts`
- [ ] Implement `RelayerClient` class
- [ ] Add fee quote fetching
- [ ] Add request signing (anti-replay)
- [ ] Write SDK tests
- [ ] Test end-to-end with relayer

### Phase 3: Frontend (Week 3-4)

- [ ] Create `RelayerSelector.tsx`
- [ ] Add relayer toggle to transfer form
- [ ] Display fee comparison (direct vs. relayer)
- [ ] Show transaction status from relayer
- [ ] Test in browser

### Phase 4: Registry Contract (Week 4-5)

- [ ] Write `relayer_registry.move`
- [ ] Add registration/staking logic
- [ ] Deploy registry to testnet
- [ ] Register first relayers
- [ ] Frontend fetches from registry

### Phase 5: Production Deployment (Week 5-6)

- [ ] Set up production relayer infrastructure
- [ ] Add load balancing (multiple relayer instances)
- [ ] Monitoring and alerting
- [ ] Rate limiting (prevent spam)
- [ ] Security audit
- [ ] Launch 3-5 relayer nodes

## Files to Create/Modify

### New Files

- `relayer/src/server.ts` - Relayer server
- `relayer/src/relayer.ts` - Transaction logic
- `relayer/src/validator.ts` - Request validation
- `relayer/src/fee-calculator.ts` - Fee logic
- `relayer/tests/relayer.test.ts` - Tests
- `railgun/sources/relayer_registry.move` - Registry contract
- `sdk/src/relayer.ts` - Relayer client SDK
- `web/src/components/RelayerSelector.tsx` - UI component
- `web/src/lib/relayerRegistry.ts` - Registry fetching

### Modified Files

- `sdk/src/crypto.ts` - Add signing functions
- `web/src/components/TransferForm.tsx` - Add relayer option
- `web/src/lib/constants.ts` - Add relayer URLs

## Success Criteria

- [ ] Relayer server runs stably (99%+ uptime)
- [ ] Transaction submission succeeds within 5 seconds
- [ ] Fee calculation accurate (±5%)
- [ ] User's address never appears on-chain
- [ ] No transaction correlation between operations
- [ ] Multiple relayers available (3+ nodes)
- [ ] Frontend seamlessly switches to relayer
- [ ] Registry displays relayer info correctly

## Testing Checklist

### Relayer Tests

- [ ] Valid transaction submission
- [ ] Invalid signature rejected
- [ ] Fee verification works
- [ ] Transaction logging accurate
- [ ] Rate limiting prevents spam
- [ ] Graceful failure handling

### Integration Tests

- [ ] Alice submits transfer via relayer
- [ ] Transaction appears from relayer's address
- [ ] Fee note received by relayer
- [ ] Transaction succeeds on-chain
- [ ] No link to Alice's public address
- [ ] Multiple users use same relayer

## Security Considerations

1. **Anti-Spam Protection:**
   - Rate limiting per IP address
   - Request signing (prevent replay)
   - Relayer stake requirement (registry)

2. **Fee Manipulation Prevention:**
   - Fee quotes expire after 1 minute
   - User can reject if fee too high
   - Multiple relayers compete on price

3. **Privacy Guarantees:**
   - Relayer cannot decrypt transaction data
   - Relayer cannot link users across requests
   - No logging of user IP addresses (optional Tor support)

4. **Relayer Trustworthiness:**
   - Stake slashing for misbehavior
   - Reputation system
   - Transparent fee calculation

## Performance Targets

- **Transaction Submission:** <5 seconds
- **Fee Quote Response:** <500ms
- **Relayer Uptime:** >99%
- **Concurrent Users:** 100+ per relayer
- **Request Queue Depth:** 1000+ pending
- **Gas Optimization:** <10% overhead vs. direct

## References

- [Railgun Broadcaster Network](https://docs.railgun.org/wiki/learn/privacy-system/broadcaster-network)
- [Tornado Cash Relayer](https://github.com/tornadocash/tornado-relayer) - Reference implementation
- [Aztec Falafel](https://aztec.network/falafel/) - ZK-rollup relayer architecture
- [zkBob Relayer](https://docs.zkbob.com/implementation/relayer) - Privacy relayer design

## Economic Model

### Relayer Revenue Streams

1. **Transaction Fees:** 10% premium on gas costs
2. **Batching Savings:** Keep portion of batching benefits
3. **MEV Extraction:** Order flow revenue (if allowed)

### Costs

1. **Infrastructure:** Server hosting ($100-500/month)
2. **Gas Fees:** ~1-5 SUI per transaction
3. **Stake Lockup:** 100 SUI minimum (opportunity cost)

### Break-Even Analysis

- Need ~100-500 transactions/day to break even
- Profit margin improves with scale
- Network effects (more users = lower per-tx cost)

## Next Steps After Completion

Once relayer network is live:

1. Add transaction batching (5-10 tx/batch)
2. Implement failover and load balancing
3. Launch decentralized relayer marketplace
4. Add Tor/VPN support for IP privacy
5. Integrate with DeFi operations (private swaps via relayer)
