# Octopus - On-chain Transaction Obfuscated Protocol Underlying Sui

**OCTOPUS** stands for **On-chain Transaction Obfuscated Protocol Underlying Sui**.

A privacy protocol implementation for the Sui blockchain, enabling shielded transactions using zero-knowledge proofs.

[**ETHGlobal HackMoney 2026**](https://ethglobal.com/events/hackmoney2026)

## Overview

Octopus enables private token transfers on Sui by implementing a UTXO-based privacy pool with Groth16 ZK-SNARKs verification. Users can:

- **Shield**: Deposit tokens into the privacy pool, creating encrypted notes
- **Unshield**: Withdraw tokens with ZK proof verification, preserving privacy

```
┌─────────────┐     Shield      ┌──────────────────┐
│  Public     │ ───────────────►│  Privacy Pool    │
│  Wallet     │                 │  (Merkle Tree)   │
│             │ ◄───────────────│                  │
└─────────────┘     Unshield    └──────────────────┘
                   (ZK Proof)
```

## Architecture

### Cryptographic Primitives

| Component | Implementation |
|-----------|----------------|
| Curve | BN254 (alt_bn128) |
| Hash | Poseidon (ZK-friendly) |
| Proof System | Groth16 |
| Merkle Tree | Incremental, depth 16 (65,536 notes) |

### Key Formulas

```
MPK = Poseidon(spending_key, nullifying_key)   // Master Public Key
NPK = Poseidon(MPK, random)                    // Note Public Key
commitment = Poseidon(NPK, token, value)       // Note Commitment
nullifier = Poseidon(nullifying_key, leaf_index) // Prevents double-spend
```

## Project Structure

```
octopus/
├── circuits/              # Circom ZK circuits
│   ├── unshield.circom   # Main unshield circuit
│   ├── lib/              # Circuit libraries (Merkle proof)
│   └── build/            # Compiled circuits & keys
├── railgun/              # Sui Move contracts
│   └── sources/
│       ├── pool.move         # Privacy pool (shield/unshield)
│       ├── merkle_tree.move  # Incremental Merkle tree
│       ├── nullifier.move    # Nullifier registry
│       └── note.move         # Note structure
└── sdk/                  # TypeScript SDK
    └── src/
        ├── crypto.ts     # Poseidon, key derivation
        ├── prover.ts     # Groth16 proof generation
        ├── sui.ts        # Sui transaction builders
        └── demo.ts       # Interactive demo
```

## Quick Start

### Prerequisites

- [Sui CLI](https://docs.sui.io/guides/developer/getting-started/sui-install) >= 1.64.0
- [Node.js](https://nodejs.org/) >= 18
- [Circom](https://docs.circom.io/getting-started/installation/) >= 2.1.0

### 1. Build Circuits

```bash
cd circuits
npm install
./compile_unshield.sh
```

This generates:
- `build/unshield_js/unshield.wasm` - Circuit WASM
- `build/unshield_final.zkey` - Proving key
- `build/unshield_vk.json` - Verification key

### 2. Build & Test Move Contracts

```bash
cd railgun
sui move build
sui move test
```

Expected output: **23 tests passing**

### 3. Run SDK Demo

```bash
cd sdk
npm install
npm run demo
```

Demo output:
```
Octopus SDK Demo

Step 1: Initialize Poseidon Hash
✓ Poseidon initialized

Step 2: Generate Keypair
✓ Keypair generated

Step 3: Create Note (Simulating Shield)
✓ Note created

Step 4: Build Merkle Proof
✓ Merkle proof built

Step 5: Compute Nullifier
✓ Nullifier computed

Step 6: Generate ZK Proof (Groth16)
✓ Proof generated in 425ms

Step 7: Verify Proof Locally
✓ Proof verified successfully!

Step 8: Convert to Sui Format
✓ Ready for Sui transaction!
```

## SDK Usage

```typescript
import {
  initPoseidon,
  generateKeypair,
  createNote,
  generateUnshieldProof,
  convertProofToSui,
  OctopusClient,
} from "@octopus/sdk";

// Initialize cryptographic primitives
await initPoseidon();

// Generate a keypair
const keypair = generateKeypair();

// Create a shielded note
const note = createNote(
  keypair.masterPublicKey,
  tokenId,
  amount
);

// Generate ZK proof for unshield
const { proof, publicSignals } = await generateUnshieldProof({
  note,
  leafIndex: 0,
  pathElements,
  keypair,
});

// Convert to Sui format
const suiProof = convertProofToSui(proof, publicSignals);

// Execute on Sui
const client = new OctopusClient({
  rpcUrl: "https://fullnode.testnet.sui.io:443",
  packageId: "0x...",
  poolId: "0x...",
});

await client.unshield(coinType, suiProof, amount, recipient, signer);
```

## Move Contract API

### Shield (Deposit)

```move
public entry fun shield<T>(
    pool: &mut PrivacyPool<T>,
    coin: Coin<T>,
    commitment: vector<u8>,      // 32 bytes
    encrypted_note: vector<u8>,  // For recipient scanning
    ctx: &mut TxContext,
)
```

### Unshield (Withdraw with ZK Proof)

```move
public entry fun unshield<T>(
    pool: &mut PrivacyPool<T>,
    proof_bytes: vector<u8>,         // 128 bytes (Groth16 proof)
    public_inputs_bytes: vector<u8>, // 96 bytes (root, nullifier, commitment)
    amount: u64,
    recipient: address,
    ctx: &mut TxContext,
)
```

## Circuit Details

**Unshield Circuit** (`unshield.circom`)

| Property | Value |
|----------|-------|
| Constraints | 10,477 |
| Public Inputs | 3 (merkle_root, nullifier, commitment) |
| Private Inputs | 7 (keys, note data, Merkle path) |
| Merkle Depth | 16 levels |

The circuit proves:
1. Knowledge of spending_key and nullifying_key (ownership)
2. Correct commitment computation
3. Commitment exists in Merkle tree
4. Correct nullifier derivation (prevents double-spend)

## Security Considerations

- **MVP Simplifications**: This is a hackathon proof-of-concept
  - 1-input-1-output transactions only
  - Simplified note encryption (not production-ready)
  - No viewing key separation
- **For Production**: Add EdDSA signature verification, proper ECIES encryption, and audit all cryptographic implementations

## Testnet Deployment

| Contract | Address |
|----------|---------|
| Verifier PoC | `0xb963001568c4672969bc91a4b3e76305008621cd79830329bfb88c721ce9208b` |

## Milestones

- [x] **Milestone 1**: Environment setup, Sui CLI, Move basics
- [x] **Milestone 2**: Groth16 verification PoC on Sui
- [x] **Milestone 3**: Core data structures (Merkle tree, nullifiers)
- [x] **Milestone 4**: Shield/Unshield with ZK verification
- [x] **Milestone 5**: TypeScript SDK & Demo

## Acknowledgments

This project was inspired by privacy protocol architectures, particularly [Railgun](https://railgun.org/).

- [Sui](https://sui.io/) - Native Groth16 verification support
- [circomlib](https://github.com/iden3/circomlib) - Poseidon hash implementation
- [snarkjs](https://github.com/iden3/snarkjs) - Groth16 proof generation

## License

MIT
