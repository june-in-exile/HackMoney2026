# Gemini Context: Octopus Privacy Protocol

This document provides a comprehensive overview of the Octopus project, its architecture, and development workflow to guide AI-assisted development.

## 1. Project Overview

**Octopus** is a privacy protocol for the Sui blockchain that enables on-chain transaction obfuscation. It implements a UTXO-based privacy pool using Groth16 ZK-SNARKs, allowing users to shield, transfer, swap, and unshield tokens privately.

The project is a "Highly Functional MVP" developed for a hackathon, with core features like private transfers fully working and DeFi (DEX) integration nearly complete.

**Key Technologies:**

* **Blockchain**: Sui
* **Smart Contracts**: Move
* **ZK Circuits**: Circom (Groth16 proofs, BN254 curve, Poseidon hash)
* **Frontend**: Next.js (React/TypeScript) with `@mysten/dapp-kit`
* **SDK**: Custom TypeScript SDK (`@octopus/sdk`) to link the frontend with the ZK circuits and contracts.
* **Tooling**: Node.js, npm, Sui CLI

## 2. Architecture

The project is a monorepo composed of four main components:

1. **`circuits/`**: Contains the Circom source code for the ZK-SNARKs. These circuits generate proofs for the core privacy-preserving actions:
    * `unshield.circom`: Proves ownership to withdraw tokens from the pool.
    * `transfer.circom`: Proves validity of a private 2-input, 2-output transfer.
    * `swap.circom`: Proves validity of a private token swap within the pool.

2. **`contracts/`**: Contains the Move smart contracts for the Sui blockchain. These contracts manage the Merkle tree of deposits, handle the nullifier set to prevent double-spends, and verify the ZK proofs on-chain.

3. **`sdk/`**: A TypeScript SDK that acts as the connective tissue. It provides an API for the frontend to interact with the circuits (e.g., generating proofs) and the smart contracts (e.g., submitting transactions).

4. **`frontend/`**: A Next.js web application that provides the user interface for interacting with the Octopus protocol. It allows users to manage keypairs, view shielded balances, and initiate shield, transfer, swap, and unshield operations.

## 3. Development Workflow & Commands

Follow this sequence to set up and run the entire project.

### Step 1: Build ZK Circuits

The circuits must be compiled first, as their artifacts (WASM, proving keys, verification keys) are used by the other components.

```bash
cd circuits
npm install
cd scripts
./compile_unshield.sh
./compile_transfer.sh
./compile_swap.sh
```

*This process is slow and generates large `_final.zkey` files.*

### Step 2: Build and Test Smart Contracts

With the circuit artifacts generated, you can build and test the Move contracts. The verification keys (`_vk.json`) are needed for on-chain proof verification.

```bash
cd contracts
sui move build
sui move test
```

*Expect around 26 tests to pass.*

### Step 3: Run the Frontend Application

The frontend ties everything together for a user-facing experience.

```bash
cd frontend
npm install
npm run dev
```

The application will be available at `http://localhost:3000`.

### Key Scripts Summary

* **Circuits (`circuits/`):**
  * `scripts/compile_*.sh`: Compiles and generates all necessary circuit artifacts.
* **Contracts (`contracts/`):**
  * `sui move build`: Compiles the Move contracts.
  * `sui move test`: Runs the test suite for the contracts.
* **Frontend (`frontend/`):**
  * `npm run dev`: Starts the Next.js development server.
  * `npm run build`: Creates a production build of the frontend.
  * `npm run lint`: Lints the frontend codebase.

## Key Cryptographic Formulas

``` txt
MPK = Poseidon(spending_key, nullifying_key)   // Master Public Key
NSK = Poseidon(MPK, random)                    // Note Secret Key
commitment = Poseidon(NSK, token, value)       // Note Commitment
nullifier = Poseidon(nullifying_key, leaf_index)
```

## Move Contract Entry Points

**Shield** (deposit): `pool::shield<T>(pool, coin, commitment, encrypted_note, ctx)`

* No ZK proof required, adds commitment to Merkle tree

**Unshield** (withdraw): `pool::unshield<T>(pool, proof_bytes, public_inputs_bytes, recipient, encrypted_change_note, ctx)`

* Requires 128-byte Groth16 proof + 128-byte public inputs (nullifier, root, change_commitment, amount)
* Supports automatic change note creation (no fund loss)
* Amount is extracted from public inputs (no separate parameter needed)
* Verifies proof, marks nullifier spent, transfers tokens, creates change note if needed

**Transfer** (private transfer): `pool::transfer<T>(pool, proof_bytes, public_inputs_bytes, encrypted_notes, ctx)`

* Requires Groth16 proof for a 2-input, 2-output private transfer.
* Public inputs (160 bytes): root, 2 input nullifiers, 2 output commitments.
* Spends two input notes and creates two new output notes within the pool.

**Swap** (private swap): `pool::swap<TokenIn, TokenOut>(pool_in, pool_out, proof_bytes, ...)`

* Requires Groth16 proof for a private swap. Public inputs (192 bytes) include root, nullifiers, and commitments.
* Spends input notes, performs a swap (currently mock), and creates new output and change notes.
* Note: Current implementation is `#[test_only]`. A `swap_production` function exists for full DEX integration.

### Milestones

Detailed implementation plans are available in the [milestones/](milestones/) directory:

1. **[Private Transfers](milestones/01-private-transfers.md)** (Fixing)
   * Extends utility beyond entry/exit
   * Foundation for all other features
   * 2-input, 2-output transfer circuit

2. **[DeFi Integration](milestones/02-defi-integration.md)** (Fixing)
   * Private swaps through Cetus DEX
   * Increases transaction volume and anonymity set
   * Requires Private Transfers first

3. **[Relayer Network](milestones/03-relayer-network.md)** (Future)
   * Improves privacy by hiding transaction origin
   * Decentralized broadcaster network
   * Fee payment in shielded tokens

4. **[Compliance Features](milestones/04-compliance-features.md)** (Future)
   * Private Proofs of Innocence (PPOI)
   * View keys for selective disclosure
   * Tax reporting tools

See [milestones/README.md](docs/README.md) for details.
