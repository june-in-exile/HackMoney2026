pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/bitify.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "./lib/merkle_proof.circom";

/// Transfer circuit for Octopus on Sui
/// Implements 2-input, 2-output private transfers within the privacy pool
///
/// Proves:
/// 1. Knowledge of spending_key and nullifying_key (ownership)
/// 2. Both input notes exist in Merkle tree (2 Merkle proofs)
/// 3. Correct nullifier computation for both inputs
/// 4. Correct commitment computation for both outputs
/// 5. Balance conservation: sum(input_values) = sum(output_values)
///
/// Based on cryptographic formulas:
/// - MPK = Poseidon(spending_key, nullifying_key)
/// - NSK = Poseidon(MPK, random)
/// - Commitment = Poseidon(NSK, token, value)
/// - Nullifier = Poseidon(nullifying_key, leaf_index)
template Transfer(levels) {
    // ============ Private Inputs ============

    // Keypair (shared for both input notes - sender owns both)
    signal input spending_key;           // User's secret spending key (256-bit)
    signal input nullifying_key;         // Secret key for nullifier generation (256-bit)

    // Input notes (notes being spent)
    signal input input_nsks[2];          // Note secret keys for input notes
    signal input input_values[2];        // Note amounts (can be 0 for dummy)
    signal input input_randoms[2];       // Random blinding factors
    signal input input_leaf_indices[2];  // Leaf positions in tree
    signal input input_path_elements[2][levels];  // Merkle proof siblings

    // Output notes (notes being created)
    signal input output_nsks[2];         // Note secret keys for recipients
    signal input output_values[2];       // Output amounts
    signal input output_randoms[2];      // Random blinding factors for outputs

    // Token type (same for all notes in a transfer)
    signal input token;                  // Token identifier (address hash)

    // ============ Public Inputs ============
    signal input merkle_root;            // Expected Merkle root
    signal input input_nullifiers[2];    // Nullifiers for both input notes
    signal input output_commitments[2];  // Commitments for both output notes

    // ============ Step 1: Compute MPK ============
    // MPK = Poseidon(spending_key, nullifying_key)
    // Proves sender knows the private keys
    component mpkHasher = Poseidon(2);
    mpkHasher.inputs[0] <== spending_key;
    mpkHasher.inputs[1] <== nullifying_key;
    signal mpk <== mpkHasher.out;

    // ============ Step 2: Verify Input Notes ============
    // For each input note:
    // 1. Verify NSK = Poseidon(MPK, random)
    // 2. Compute commitment = Poseidon(NSK, token, value)
    // 3. Verify nullifier = Poseidon(nullifying_key, leaf_index)
    // 4. Verify commitment exists in Merkle tree (skip for dummy notes with value=0)

    component inputNpkHashers[2];
    component inputCommitmentHashers[2];
    component inputNullifierHashers[2];
    component inputMerkleProofs[2];
    component isValueZero[2];  // Detect dummy notes (value == 0)
    signal enabled[2];         // 1 for real notes, 0 for dummy notes

    for (var i = 0; i < 2; i++) {
        // Check if this input is a dummy note (value == 0)
        isValueZero[i] = IsZero();
        isValueZero[i].in <== input_values[i];
        enabled[i] <== 1 - isValueZero[i].out;

        // Verify NSK ownership: NSK = Poseidon(MPK, random)
        inputNpkHashers[i] = Poseidon(2);
        inputNpkHashers[i].inputs[0] <== mpk;
        inputNpkHashers[i].inputs[1] <== input_randoms[i];
        input_nsks[i] === inputNpkHashers[i].out;

        // Compute commitment = Poseidon(NSK, token, value)
        inputCommitmentHashers[i] = Poseidon(3);
        inputCommitmentHashers[i].inputs[0] <== input_nsks[i];
        inputCommitmentHashers[i].inputs[1] <== token;
        inputCommitmentHashers[i].inputs[2] <== input_values[i];

        // Verify nullifier = Poseidon(nullifying_key, leaf_index)
        inputNullifierHashers[i] = Poseidon(2);
        inputNullifierHashers[i].inputs[0] <== nullifying_key;
        inputNullifierHashers[i].inputs[1] <== input_leaf_indices[i];
        input_nullifiers[i] === inputNullifierHashers[i].out;

        // Verify Merkle proof (commitment exists in tree at leaf_index)
        inputMerkleProofs[i] = MerkleProof(levels);
        inputMerkleProofs[i].leaf <== inputCommitmentHashers[i].out;
        inputMerkleProofs[i].path_indices <== input_leaf_indices[i];
        for (var j = 0; j < levels; j++) {
            inputMerkleProofs[i].path_elements[j] <== input_path_elements[i][j];
        }

        // Conditionally verify Merkle root:
        // - For real notes (value != 0): MUST match merkle_root
        // - For dummy notes (value == 0): root check is bypassed
        // Constraint: enabled[i] * (merkle_root - computed_root) === 0
        //   When enabled[i]=1 (real note): merkle_root must equal computed_root
        //   When enabled[i]=0 (dummy note): constraint is always satisfied
        enabled[i] * (merkle_root - inputMerkleProofs[i].root) === 0;
    }

    // ============ Step 3: Verify Output Commitments ============
    // For each output note, verify commitment = Poseidon(NSK, token, value)
    // Note: NSKs are provided directly (derived from recipient's MPK off-circuit)

    component outputCommitmentHashers[2];

    for (var i = 0; i < 2; i++) {
        outputCommitmentHashers[i] = Poseidon(3);
        outputCommitmentHashers[i].inputs[0] <== output_nsks[i];
        outputCommitmentHashers[i].inputs[1] <== token;
        outputCommitmentHashers[i].inputs[2] <== output_values[i];
        output_commitments[i] === outputCommitmentHashers[i].out;
    }

    // ============ Step 4: Balance Conservation ============
    // Verify sum(input_values) = sum(output_values)
    // This prevents value inflation attacks
    signal input_sum <== input_values[0] + input_values[1];
    signal output_sum <== output_values[0] + output_values[1];
    input_sum === output_sum;
}

// Main circuit with 16 levels (supports 2^16 = 65,536 notes)
// Public inputs: merkle_root, input_nullifiers[2], output_commitments[2]
// Total public inputs: 5 field elements (1 + 2 + 2)
component main {public [merkle_root, input_nullifiers, output_commitments]} = Transfer(16);
