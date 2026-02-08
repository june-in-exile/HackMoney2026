pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/bitify.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "./lib/merkle_proof.circom";

/// Swap circuit for private DEX swaps on Sui
/// Implements private token swaps through external DEX (e.g., DeepBook)
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
    signal input input_values[2];        // Note amounts (can be 0 for dummy)
    signal input input_randoms[2];       // Random blinding factors
    signal input input_leaf_indices[2];  // Leaf positions in tree
    signal input input_path_elements[2][levels];  // Merkle proof siblings

    // Swap parameters
    signal input amount_in;              // Exact amount to swap
    signal input min_amount_out;         // Minimum output (slippage protection)
    signal input dex_pool_id;            // DEX pool identifier hash

    // Output note (single output with swapped tokens)
    signal input output_value;           // Output amount (actual swap result)
    signal input output_random;          // Random blinding factor for output

    // Change note (if input > amount_in, return change with token_in)
    signal input change_value;           // Change amount
    signal input change_random;          // Random blinding factor for change

    // ============ Public Inputs ============
    signal input token_in;               // Input token type (e.g., SUI)
    signal input token_out;              // Output token type (e.g., USDC)
    signal input merkle_root;            // Expected Merkle root

    // ============ Public Outputs ============
    signal output input_nullifiers[2];    // Nullifiers for both input notes
    signal output swap_data_hash;        // Hash of swap parameters
    signal output output_commitment;      // Commitment for output note (token_out)
    signal output change_commitment;      // Commitment for change note (token_in)

    // ============ Step 1: Range Check ============
    signal positiveAmount <== GreaterThan(120)([amount_in, 0]);
    positiveAmount === 1;

    // ============ Step 2: Balance Conservation ============
    // Verify sum(input_sum) = sum(output_sum)
    // Ensure sum(input_values) >= amount_in + change_value
    signal input_sum <== input_values[0] + input_values[1];
    signal output_sum <== amount_in + change_value;
    input_sum === output_sum;

    // ============ Step 3: Compute MPK ============
    // MPK = Poseidon(spending_key, nullifying_key)
    // Proves sender knows the private keys
    signal mpk <== Poseidon(2)([spending_key, nullifying_key]);

    // ============ Step 4: Verify Input Notes ============
    // For each input note:
    // 1. Verify NSK = Poseidon(MPK, random)
    // 2. Compute commitment = Poseidon(NSK, token_in, value)
    // 3. Verify nullifier = Poseidon(nullifying_key, leaf_index)
    // 4. Verify commitment exists in Merkle tree

    signal input_nsks[2];             // Note secret keys
    signal input_commitments[2];
    signal isValueZero[2];            // Detect dummy notes (value == 0)
    signal calculated_nullifiers[2];
    signal calculated_roots[2];

    for (var i = 0; i < 2; i++) {
        // Verify note ownership: NSK = Poseidon(MPK, random)
        input_nsks[i] <== Poseidon(2)([mpk, input_randoms[i]]);

        // Compute commitment = Poseidon(NSK, token, value)
        input_commitments[i] <== Poseidon(3)([input_nsks[i], token_in, input_values[i]]);

        // Verify Merkle proof (commitment exists in tree at leaf_index)
        calculated_roots[i] <== MerkleProof(levels)(input_commitments[i], input_leaf_indices[i], input_path_elements[i]);

        // Check if this input is a dummy note (value == 0)
        isValueZero[i] <== IsZero()(input_values[i]);

        // Conditionally generate nullifier = Poseidon(nullifying_key, leaf_index)
        // - For real notes (value != 0): use real nullifier
        // - For dummy notes (value == 0): set nullifier to 0
        calculated_nullifiers[i] <== Poseidon(2)([nullifying_key, input_leaf_indices[i]]);
        input_nullifiers[i] <== (1 - isValueZero[i]) * calculated_nullifiers[i];

        // Conditionally verify Merkle root:
        // - For real notes (value != 0): MUST match merkle_root
        // - For dummy notes (value == 0): root check is bypassed
        (1 - isValueZero[i]) * (calculated_roots[i] - merkle_root) === 0;
    }

    // ============ Step 5: Verify Swap Data Hash ============
    // Verify swap_data_hash = Poseidon(token_in, token_out, amount_in, min_amount_out, dex_pool_id)
    // This ensures swap parameters cannot be tampered with
    swap_data_hash <== Poseidon(5)([token_in, token_out, amount_in, min_amount_out, dex_pool_id]);

    // ============ Step 6: Verify Output Commitment ============
    // Output note commitment = Poseidon(NSK, token_out, output_value)
    // Note: Output uses token_out (swapped token)
    signal output_nsk <== Poseidon(2)([mpk, output_random]);
    output_commitment <== Poseidon(3)([output_nsk, token_out, output_value]);

    // ============ Step 7: Verify Change Commitment ============
    // Change note commitment = Poseidon(NSK, token_in, change_value)
    // Note: Change uses token_in (original token)
    // If no change, commitment will be 0
    signal change_nsk <== Poseidon(2)([mpk, change_random]);
    signal real_change_commitment <== Poseidon(3)([change_nsk, token_in, change_value]);
    signal no_change <== IsZero()(change_value);
    change_commitment <== real_change_commitment * (1 - no_change);

    // ============ Step 8: Output Validation ============
    // Ensure output_value >= min_amount_out (slippage protection)
    // This will be enforced by the smart contract, but we include it for completeness
    signal outputCheck <== GreaterEqThan(64)([output_value, min_amount_out]);
    outputCheck === 1;
}

// Main circuit with 16 levels (supports 2^16 = 65,536 notes)
component main {public [token_in, token_out, merkle_root]} = Swap(16);
