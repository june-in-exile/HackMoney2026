pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/bitify.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "./lib/merkle_proof.circom";

/// Unshield circuit for Octopus on Sui
/// Implements 1-input, 1-output (change note) private unshield with automatic change handling
///
/// Proves:
/// 1. Knowledge of spending_key and nullifying_key (ownership)
/// 2. Input note exists in Merkle tree
/// 3. Correct nullifier computation
/// 4. Balance conservation: value = unshield_amount + change_value
/// 5. Correct change commitment computation
///
/// Based on cryptographic formulas:
/// - MPK = Poseidon(spending_key, nullifying_key)
/// - NSK = Poseidon(MPK, random)
/// - Commitment = Poseidon(NSK, token, value)
/// - Nullifier = Poseidon(nullifying_key, leaf_index)
template Unshield(levels) {
    // ============ Private Inputs ============

    // Keypair
    signal input spending_key;           // User's secret spending key (256-bit)
    signal input nullifying_key;         // Secret key for nullifier generation (256-bit)

    // Input note (note being spent/unshielded)
    signal input random;                 // Random blinding factor
    signal input value;                  // Note amount
    signal input token;                  // Token identifier (address hash)
    signal input leaf_index;             // Leaf position in tree
    signal input path_elements[levels];  // Merkle proof siblings
    signal input change_random;          // Random blinding factor for change

    // ============ Public Inputs ============
    signal input unshield_amount;         // Amount to unshield to public address
    signal output nullifier;              // Nullifier for input note
    signal output merkle_root;            // Merkle root
    signal output change_commitment;      // Commitment for change note

    // ============ Step 1: Compute MPK ============
    // MPK = Poseidon(spending_key, nullifying_key)
    signal mpk <== Poseidon(2)([spending_key, nullifying_key]);

    // ============ Step 2: Compute NSK ============
    // NSK = Poseidon(MPK, random)
    signal nsk <== Poseidon(2)([mpk, random]);

    // ============ Step 3: Compute Commitment ============
    // commitment = Poseidon(NSK, token, value)
    signal commitment <== Poseidon(3)([nsk, token, value]);

    // ============ Step 4: Verify Nullifier ============
    // nullifier = Poseidon(nullifying_key, leaf_index)
    nullifier <== Poseidon(2)([nullifying_key, leaf_index]);

    // ============ Step 5: Verify Merkle Proof ============
    // Prove that input commitment exists in the Merkle tree
    merkle_root <== MerkleProof(levels)(commitment, leaf_index, path_elements);

    // ============ Step 6: Range Check ============
    // Ensure unshield_amount <= value
    signal rangeCheck <== LessEqThan(120)([unshield_amount, value]);
    rangeCheck === 1;

    // ============ Step 7: Calculate Change Value ============
    signal change_value <== value - unshield_amount;

    // ============ Step 8: Compute Change Commitment ============
    signal change_nsk <== Poseidon(2)([mpk, change_random]);
    change_commitment <== Poseidon(3)([change_nsk, token, change_value]);
}

// Main circuit with 16 levels (supports 2^16 = 65,536 notes)
component main {public [unshield_amount]} = Unshield(16);
