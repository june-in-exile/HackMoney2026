# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Octopus (On-Chain Transaction Obfuscation Protocol Underlying Sui) is a privacy protocol for Sui implementing shielded transactions using Groth16 ZK-SNARKs. Users shield tokens into a privacy pool and unshield with ZK proofs.

## Build & Test Commands

### Circuits (Circom)

```bash
cd circuits
npm install
./compile_unshield.sh  # Generates WASM, proving key, verification key in build/
```

### Move Contracts

```bash
cd contracts
sui move build
sui move test          # 23 tests expected
sui move test -f <test_name>  # Run single test
```

### TypeScript SDK

```bash
cd sdk
npm install
npm run build          # Compile TypeScript
npm run demo           # Interactive 8-step demo
npm test               # Run Vitest tests
```

### Web Frontend

```bash
cd frontend
npm install
npm run dev            # Dev server at localhost:3000
npm run build          # Production build (uses --webpack flag for Next.js 16)
```

## Key Cryptographic Formulas

```
MPK = Poseidon(spending_key, nullifying_key)   // Master Public Key
NPK = Poseidon(MPK, random)                    // Note Public Key
commitment = Poseidon(NPK, token, value)       // Note Commitment
nullifier = Poseidon(nullifying_key, leaf_index)
```

## Move Contract Entry Points

**Shield** (deposit): `pool::shield<T>(pool, coin, commitment, encrypted_note, ctx)`

- No ZK proof required, adds commitment to Merkle tree

**Unshield** (withdraw): `pool::unshield<T>(pool, proof_bytes, public_inputs_bytes, amount, recipient, ctx)`

- Requires 128-byte Groth16 proof + 96-byte public inputs (root, nullifier, commitment)
- Verifies proof, marks nullifier spent, transfers tokens

## SDK Critical Initialization

Always call `initPoseidon()` before any cryptographic operations:

```typescript
import { initPoseidon, generateKeypair, createNote } from "@octopus/sdk";
await initPoseidon();  // Required first!
```

## Version Constraints

- `@mysten/dapp-kit@0.14.x` requires `@mysten/sui@1.24.0` (must match)
- TypeScript target must be ES2020+ for BigInt literal support
- Next.js 16 uses Turbopack by default; use `--webpack` flag for builds

## Testnet Deployment

**Octopus Privacy Pool (SUI) - Poseidon Hash (2026-01-31):**

- Package ID: `0x6458f0cc338813b938f7f75cdf56ae8ffdd4872b6e32f4229ef9e68c43032649`
- Pool ID (Shared Object): `0x55fb89a925d2f7b45ea4a847c6fb893e300eadfdf1a1f783fe0ec4910bdb4847`
- Modules: `pool`, `merkle_tree`, `nullifier`, `note`
- Network: Sui Testnet
- Verification Key: Embedded in pool (360 bytes, Arkworks compressed BN254)
- Hash Function: **Poseidon BN254** (circuit-compatible)

**Explorer Links:**

- [Package](https://suiscan.xyz/testnet/object/0xb2ab082080abf37b3e0a1130db3f656eba53c7aa6e847ae3f9d1d5112248a080)
- [Pool Object](https://suiscan.xyz/testnet/object/0x032f9f9fb7f79afe60ceb9bd22e31b5cbbc06f6c68c1608bd677886efc1f23d3)
- [Pool Creation TX](https://suiscan.xyz/testnet/tx/D8EAjXrRBmQHfdrZwJUubvd5RuawPu8eQu1Q4w1qGxzm)

## Current Implementation

### ✅ Implemented Features

- **Shield/Unshield**: Deposit tokens into privacy pool and withdraw with ZK proofs
- **ZK-SNARK Proofs**: Groth16 proof system with BN254 curve
- **Note System**: UTXO-based private notes with Poseidon commitments
- **Merkle Tree**: Incremental Merkle tree (depth 16) with Poseidon hashing
- **Nullifier System**: Prevents double-spending of notes
- **TypeScript SDK**: Browser-compatible proof generation and transaction building
- **Web Frontend**: Basic UI for shield/unshield operations with wallet integration

### Milestones

Detailed implementation plans are available in the [milestones/](milestones/) directory:

1. **[Private Transfers](milestones/01-private-transfers.md)** (Fixing)
   - Extends utility beyond entry/exit
   - Foundation for all other features
   - 2-input, 2-output transfer circuit

2. **[DeFi Integration](milestones/02-defi-integration.md)** (Fixing)
   - Private swaps through Cetus DEX
   - Increases transaction volume and anonymity set
   - Requires Private Transfers first

3. **[Relayer Network](milestones/03-relayer-network.md)** (Future)
   - Improves privacy by hiding transaction origin
   - Decentralized broadcaster network
   - Fee payment in shielded tokens

4. **[Compliance Features](milestones/04-compliance-features.md)** (Future)
   - Private Proofs of Innocence (PPOI)
   - View keys for selective disclosure
   - Tax reporting tools

See [milestones/README.md](docs/README.md) for complete roadmap and timeline
