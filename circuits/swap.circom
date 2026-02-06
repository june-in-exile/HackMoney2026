pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/bitify.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "./lib/merkle_proof.circom";

/// Swap circuit for private DEX swaps on Sui
/// Implements private token swaps through external DEX (e.g., Cetus)
///
/// Proves:
/// 1. Knowledge of spending_key and nullifying_key (ownership)
/// 2. Both input notes exist in Merkle tree (2 Merkle proofs)
/// 3. Correct nullifier computation for both inputs
/// 4. Sufficient balance for swap: sum(input_values) >= amount_in
/// 5. Swap parameters hash correctly
/// 6. Output commitment correctly computed with token_out
///
/// Flow:
/// - User has notes with token_in (e.g., SUI)
/// - Circuit proves ownership and sufficient balance
/// - Contract swaps token_in → token_out via DEX
/// - Output note created with token_out (e.g., USDC)
template Swap(levels) {
    // ============ Private Inputs ============

    // Keypair (user owns input notes)
    signal input spending_key;           // User's secret spending key (256-bit)
    signal input nullifying_key;         // Secret key for nullifier generation (256-bit)

    // Input notes (notes being spent - same token type)
    signal input input_nsks[2];          // Note secret keys for input notes
    signal input input_values[2];        // Note amounts (can be 0 for dummy)
    signal input input_randoms[2];       // Random blinding factors
    signal input input_leaf_indices[2];  // Leaf positions in tree
    signal input input_path_elements[2][levels];  // Merkle proof siblings

    // Swap parameters
    signal input token_in;               // Input token type (e.g., SUI)
    signal input token_out;              // Output token type (e.g., USDC)
    signal input amount_in;              // Exact amount to swap
    signal input min_amount_out;         // Minimum output (slippage protection)
    signal input dex_pool_id;            // DEX pool identifier hash

    // Output note (single output with swapped tokens)
    signal input output_nsk;             // Note secret key for recipient
    signal input output_value;           // Output amount (actual swap result)
    signal input output_random;          // Random blinding factor for output

    // Change note (if input > amount_in, return change with token_in)
    signal input change_nsk;             // Note secret key for change
    signal input change_value;           // Change amount
    signal input change_random;          // Random blinding factor for change

    // ============ Public Inputs ============
    signal input merkle_root;            // Expected Merkle root
    signal input input_nullifiers[2];    // Nullifiers for both input notes
    signal input output_commitment;      // Commitment for output note (token_out)
    signal input change_commitment;      // Commitment for change note (token_in)
    signal input swap_data_hash;         // Hash of swap parameters

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
    // 2. Compute commitment = Poseidon(NSK, token_in, value)
    // 3. Verify nullifier = Poseidon(nullifying_key, leaf_index)
    // 4. Verify commitment exists in Merkle tree

    component inputNpkHashers[2];
    component inputCommitmentHashers[2];
    component inputNullifierHashers[2];
    component inputMerkleProofs[2];

    for (var i = 0; i < 2; i++) {
        // Verify NSK ownership: NSK = Poseidon(MPK, random)
        inputNpkHashers[i] = Poseidon(2);
        inputNpkHashers[i].inputs[0] <== mpk;
        inputNpkHashers[i].inputs[1] <== input_randoms[i];
        input_nsks[i] === inputNpkHashers[i].out;

        // Compute commitment = Poseidon(NSK, token_in, value)
        // All input notes must have same token type (token_in)
        inputCommitmentHashers[i] = Poseidon(3);
        inputCommitmentHashers[i].inputs[0] <== input_nsks[i];
        inputCommitmentHashers[i].inputs[1] <== token_in;
        inputCommitmentHashers[i].inputs[2] <== input_values[i];

        // Verify nullifier = Poseidon(nullifying_key, leaf_index)
        inputNullifierHashers[i] = Poseidon(2);
        inputNullifierHashers[i].inputs[0] <== nullifying_key;
        inputNullifierHashers[i].inputs[1] <== input_leaf_indices[i];
        input_nullifiers[i] === inputNullifierHashers[i].out;

        // Verify Merkle proof (commitment exists in tree at leaf_index)
        inputMerkleProofs[i] = MerkleProof(levels);
        inputMerkleProofs[i].leaf <== inputCommitmentHashers[i].out;
        inputMerkleProofs[i].leaf_index <== input_leaf_indices[i];
        for (var j = 0; j < levels; j++) {
            inputMerkleProofs[i].path_elements[j] <== input_path_elements[i][j];
        }
        // Both inputs must be in the same tree (same root)
        merkle_root === inputMerkleProofs[i].root;
    }

    // ============ Step 3: Verify Sufficient Balance ============
    // Ensure sum(input_values) >= amount_in + change_value
    signal input_sum <== input_values[0] + input_values[1];
    signal required_sum <== amount_in + change_value;

    // input_sum must equal required_sum (exact balance)
    input_sum === required_sum;

    // ============ Step 4: Verify Swap Data Hash ============
    // Verify swap_data_hash = Poseidon(token_in, token_out, amount_in, min_amount_out, dex_pool_id)
    // This ensures swap parameters cannot be tampered with
    component swapHasher = Poseidon(5);
    swapHasher.inputs[0] <== token_in;
    swapHasher.inputs[1] <== token_out;
    swapHasher.inputs[2] <== amount_in;
    swapHasher.inputs[3] <== min_amount_out;
    swapHasher.inputs[4] <== dex_pool_id;
    swap_data_hash === swapHasher.out;

    // ============ Step 5: Verify Output Commitment ============
    // Output note commitment = Poseidon(NSK, token_out, output_value)
    // Note: Output uses token_out (swapped token)
    component outputCommitmentHasher = Poseidon(3);
    outputCommitmentHasher.inputs[0] <== output_nsk;
    outputCommitmentHasher.inputs[1] <== token_out;
    outputCommitmentHasher.inputs[2] <== output_value;
    output_commitment === outputCommitmentHasher.out;

    // ============ Step 6: Verify Change Commitment ============
    // Change note commitment = Poseidon(NSK, token_in, change_value)
    // Note: Change uses token_in (original token)
    // If no change, commitment will be for value=0 note
    component changeCommitmentHasher = Poseidon(3);
    changeCommitmentHasher.inputs[0] <== change_nsk;
    changeCommitmentHasher.inputs[1] <== token_in;
    changeCommitmentHasher.inputs[2] <== change_value;
    change_commitment === changeCommitmentHasher.out;

    // ============ Step 7: Output Validation ============
    // Ensure output_value >= min_amount_out (slippage protection)
    // This will be enforced by the smart contract, but we include it for completeness
    component outputCheck = GreaterEqThan(64);
    outputCheck.in[0] <== output_value;
    outputCheck.in[1] <== min_amount_out;
    outputCheck.out === 1;
}

// Main circuit with 16 levels (supports 2^16 = 65,536 notes)
// Public inputs: merkle_root, input_nullifiers[2], output_commitment, change_commitment, swap_data_hash
// Total public inputs: 6 field elements (1 + 2 + 1 + 1 + 1)
component main {public [merkle_root, input_nullifiers, output_commitment, change_commitment, swap_data_hash]} = Swap(16);
