pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/bitify.circom";

/// Merkle proof verifier using Poseidon hash
template MerkleProof(levels) {
    signal input leaf;
    signal input path_indices;           // Leaf position as integer
    signal input path_elements[levels];  // Sibling hashes at each level
    signal output root;

    // Convert path_indices to bits for left/right determination
    signal levelBits[levels] <== Num2Bits(levels)(path_indices);

    signal hashes[levels + 1];
    hashes[0] <== leaf;
    
    for (var i = 0; i < levels; i++) {
        // If bit is 0: current hash is on left, sibling on right
        // If bit is 1: current hash is on right, sibling on left
        // Using selector trick: a + b*(c - a) = a when b=0, c when b=1
        hashes[i + 1] <== Poseidon(2)([
            hashes[i] + levelBits[i] * (path_elements[i] - hashes[i]),
            path_elements[i] + levelBits[i] * (hashes[i] - path_elements[i])]
        );
    }

    root <== hashes[levels];
}