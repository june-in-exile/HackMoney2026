# Circuits

This directory contains the Zero-Knowledge Succinct Non-Interactive Argument of Knowledge (ZK-SNARK) circuits for the Octopus project, implemented using `circom` and `snarkjs`.

## Circuits Overview

-   `unshield.circom`: A basic unshield circuit. Proves knowledge of an input note's private keys and its existence in a Merkle tree, allowing a user to "unshield" funds.
-   `transfer.circom`: A private transfer circuit. Allows a user to transfer funds privately between two notes (which can belong to the same or different users), preserving balance conservation. Supports 2-input, 2-output transfers.
-   `swap.circom`: A private swap circuit. Enables users to perform private token swaps through an external DEX (e.g., Cetus), proving ownership of input notes and correct swap parameters.

## Scripts Usage

The following scripts, located in the `circuits/scripts/` directory, are used for compiling circuits, generating test inputs, and converting outputs to the Sui Arkworks format. These scripts are typically executed from the `circuits/` directory.

### Compilation Scripts

| Script                        | Purpose                    | When to Use                                                                                             |
| ----------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `scripts/compile_unshield.sh` | Compiles `unshield.circom`.  | Run when `unshield.circom` is modified or to regenerate its proving/verification keys.                   |
| `scripts/compile_transfer.sh` | Compiles `transfer.circom`.  | Run when `transfer.circom` is modified or to regenerate its proving/verification keys.                   |
| `scripts/compile_swap.sh`     | Compiles `swap.circom`.      | Run when `swap.circom` is modified or to regenerate its proving/verification keys.                       |

### Test Input Generation Scripts

| Script                                  | Purpose                                      | When to Use                                                                |
| --------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| `scripts/generateUnshieldTestInput.js`  | Generates a test input for `unshield.circom`.  | Before generating a proof, to create `build/unshield_input.json` for testing. |
| `scripts/generateTransferTestInput.js`  | Generates a test input for `transfer.circom`.  | Before generating a proof, to create `build/transfer_input.json` for testing. |

### Arkworks Converter Scripts

| Script                                 | Purpose                                                                | When to Use                                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `scripts/arkworksConverter.js`         | Converts `unshield` outputs to Sui's Arkworks format.                  | After generating a proof for the unshield circuit to prepare it for on-chain verification.     |
| `scripts/arkworksConverterSwap.js`     | Converts the `swap` verification key to Sui's Arkworks format.         | After compiling the swap circuit to prepare its verification key for the smart contract.         |
| `scripts/arkworksConverterTransfer.js` | Converts `transfer` outputs to Sui's Arkworks format.                  | After generating a proof for the transfer circuit to prepare it for on-chain verification.     |

