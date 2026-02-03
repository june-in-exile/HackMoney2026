pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/bitify.circom";
include "./lib/merkle_proof.circom";

/// Unshield circuit for Octopus on Sui
/// Simplified version of a privacy circuit (1 input, no EdDSA)
///
/// Proves:
/// 1. Knowledge of spending_key and nullifying_key (ownership)
/// 2. Correct commitment computation
/// 3. Correct nullifier computation
/// 4. Commitment exists in Merkle tree
///
/// Based on cryptographic formulas:
/// - MPK = Poseidon(spending_key, nullifying_key)
/// - NPK = Poseidon(MPK, random)
/// - Commitment = Poseidon(NPK, token, value)
/// - Nullifier = Poseidon(nullifying_key, leaf_index)
template Unshield(levels) {
    // ============ Private Inputs ============
    signal input spending_key;           // User's secret spending key (256-bit)
    signal input nullifying_key;         // Secret key for nullifier generation (256-bit)
    signal input random;                 // Random blinding factor (256-bit)
    signal input value;                  // Note amount (120-bit max)
    signal input token;                  // Token identifier (address hash)
    signal input path_elements[levels];  // Merkle proof siblings
    signal input path_indices;           // Leaf position in tree (as integer)

    // ============ Public Inputs ============
    signal input merkle_root;            // Expected Merkle root
    signal input nullifier;              // Nullifier to prevent double-spend

    // ============ Step 1: Compute MPK ============
    // MPK = Poseidon(spending_key, nullifying_key)
    signal mpk <== Poseidon(2)([spending_key, nullifying_key]);

    // ============ Step 2: Compute NPK ============
    // NPK = Poseidon(MPK, random)
    signal npk <== Poseidon(2)([mpk, random]);

    // ============ Step 3: Verify Commitment ============
    // commitment = Poseidon(NPK, token, value)
    signal commitment <== Poseidon(3)([npk, token, value]);

    // ============ Step 4: Verify Nullifier ============
    // nullifier === Poseidon(nullifying_key, path_indices)
    signal expected_nullifier <== Poseidon(2)([nullifying_key, path_indices]);
    nullifier === expected_nullifier;

    // ============ Step 5: Verify Merkle Proof ============
    // Prove that commitment exists in the Merkle tree at path_indices
    signal expected_merkle_root <== MerkleProof(levels)(commitment, path_indices, path_elements);
    merkle_root === expected_merkle_root;
}

// Main circuit with 16 levels (supports 2^16 = 65,536 notes)
// Public inputs: merkle_root, nullifier, commitment
component main {public [merkle_root, nullifier]} = Unshield(16);
