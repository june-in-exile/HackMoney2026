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
    component n2b = Num2Bits(levels);
    n2b.in <== path_indices;

    component hashers[levels];
    signal hashes[levels + 1];
    hashes[0] <== leaf;

    for (var i = 0; i < levels; i++) {
        hashers[i] = Poseidon(2);

        // If bit is 0: current hash is on left, sibling on right
        // If bit is 1: current hash is on right, sibling on left
        // Using selector trick: a + b*(c - a) = a when b=0, c when b=1
        hashers[i].inputs[0] <== hashes[i] + n2b.out[i] * (path_elements[i] - hashes[i]);
        hashers[i].inputs[1] <== path_elements[i] + n2b.out[i] * (hashes[i] - path_elements[i]);

        hashes[i + 1] <== hashers[i].out;
    }

    root <== hashes[levels];
}

/// Verify a Merkle proof and check against expected root
template MerkleProofVerifier(levels) {
    signal input leaf;
    signal input path_indices;
    signal input path_elements[levels];
    signal input expected_root;

    component proof = MerkleProof(levels);
    proof.leaf <== leaf;
    proof.path_indices <== path_indices;
    for (var i = 0; i < levels; i++) {
        proof.path_elements[i] <== path_elements[i];
    }

    // Constrain computed root to match expected root
    expected_root === proof.root;
}
