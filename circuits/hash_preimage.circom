pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";

// Minimal PoC circuit: Prove knowledge of a secret preimage
// Public input: hash (the Poseidon hash of the secret)
// Private input: secret (the preimage we know)
// Constraint: Poseidon(secret) === hash

template HashPreimage() {
    // Private input - the secret we want to prove we know
    signal input secret;

    // Public input - the hash that everyone can see
    signal input hash;

    // Compute Poseidon hash of the secret
    component poseidon = Poseidon(1);
    poseidon.inputs[0] <== secret;

    // Constrain: computed hash must equal public hash
    hash === poseidon.out;
}

component main {public [hash]} = HashPreimage();
