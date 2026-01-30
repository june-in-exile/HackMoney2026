pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/bitify.circom";
include "./lib/merkle_proof.circom";

/// Unshield circuit for Railgun on Sui
/// Simplified version of Railgun's JoinSplit circuit (1 input, no EdDSA)
///
/// Proves:
/// 1. Knowledge of spending_key and nullifying_key (ownership)
/// 2. Correct commitment computation
/// 3. Correct nullifier computation
/// 4. Commitment exists in Merkle tree
///
/// Based on Railgun cryptographic formulas:
/// - MPK = Poseidon(spending_key, nullifying_key)
/// - NPK = Poseidon(MPK, random)
/// - Commitment = Poseidon(NPK, token, value)
/// - Nullifier = Poseidon(nullifying_key, leaf_index)
template Unshield(levels) {
    // ============ Private Inputs ============
    signal input spending_key;           // User's secret spending key (256-bit)
    signal input nullifying_key;         // Secret key for nullifier generation (256-bit)
    signal input random;                 // Random blinding factor (256-bit)
    signal input value;                  // Note amount (120-bit max in Railgun)
    signal input token;                  // Token identifier (address hash)
    signal input path_elements[levels];  // Merkle proof siblings
    signal input path_indices;           // Leaf position in tree (as integer)

    // ============ Public Inputs ============
    signal input merkle_root;            // Expected Merkle root
    signal input nullifier;              // Nullifier to prevent double-spend
    signal input commitment;             // Note commitment being spent

    // ============ Step 1: Compute MPK ============
    // MPK = Poseidon(spending_key, nullifying_key)
    // Simplified from Railgun: MPK = Poseidon(pubkey_x, pubkey_y, nullifying_key)
    component mpkHasher = Poseidon(2);
    mpkHasher.inputs[0] <== spending_key;
    mpkHasher.inputs[1] <== nullifying_key;
    signal mpk <== mpkHasher.out;

    // ============ Step 2: Compute NPK ============
    // NPK = Poseidon(MPK, random)
    component npkHasher = Poseidon(2);
    npkHasher.inputs[0] <== mpk;
    npkHasher.inputs[1] <== random;
    signal npk <== npkHasher.out;

    // ============ Step 3: Verify Commitment ============
    // commitment === Poseidon(NPK, token, value)
    component commitmentHasher = Poseidon(3);
    commitmentHasher.inputs[0] <== npk;
    commitmentHasher.inputs[1] <== token;
    commitmentHasher.inputs[2] <== value;
    commitment === commitmentHasher.out;

    // ============ Step 4: Verify Nullifier ============
    // nullifier === Poseidon(nullifying_key, path_indices)
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== nullifying_key;
    nullifierHasher.inputs[1] <== path_indices;
    nullifier === nullifierHasher.out;

    // ============ Step 5: Verify Merkle Proof ============
    // Prove that commitment exists in the Merkle tree at path_indices
    component merkleProof = MerkleProof(levels);
    merkleProof.leaf <== commitment;
    merkleProof.path_indices <== path_indices;
    for (var i = 0; i < levels; i++) {
        merkleProof.path_elements[i] <== path_elements[i];
    }
    merkle_root === merkleProof.root;
}

// Main circuit with 16 levels (supports 2^16 = 65,536 notes)
// Public inputs: merkle_root, nullifier, commitment
component main {public [merkle_root, nullifier, commitment]} = Unshield(16);
