/// Groth16 Verifier PoC for Railgun on Sui
/// Verifies hash preimage proofs using BN254 curve
module verifier::groth16_verifier {
    use sui::groth16;
    use sui::event;

    // ========== Errors ==========
    const EInvalidProof: u64 = 1;

    // ========== Events ==========
    /// Emitted when a proof is successfully verified
    public struct ProofVerified has copy, drop {
        public_inputs_hash: vector<u8>,
    }

    // ========== Public Functions ==========

    /// Verify a Groth16 proof
    /// @param vk_bytes: Arkworks serialized verifying key
    /// @param public_inputs_bytes: Concatenated 32-byte scalars (little-endian)
    /// @param proof_points_bytes: Arkworks serialized proof (A || B || C)
    public fun verify_proof(
        vk_bytes: vector<u8>,
        public_inputs_bytes: vector<u8>,
        proof_points_bytes: vector<u8>,
    ): bool {
        // Prepare the verifying key (this computes one pairing)
        let pvk = groth16::prepare_verifying_key(&groth16::bn254(), &vk_bytes);

        // Parse proof points and public inputs
        let public_inputs = groth16::public_proof_inputs_from_bytes(public_inputs_bytes);
        let proof_points = groth16::proof_points_from_bytes(proof_points_bytes);

        // Verify the proof
        groth16::verify_groth16_proof(&groth16::bn254(), &pvk, &public_inputs, &proof_points)
    }

    /// Entry function to verify proof and emit event
    /// Aborts if proof is invalid
    public entry fun verify_and_emit(
        vk_bytes: vector<u8>,
        public_inputs_bytes: vector<u8>,
        proof_points_bytes: vector<u8>,
    ) {
        let is_valid = verify_proof(vk_bytes, public_inputs_bytes, proof_points_bytes);
        assert!(is_valid, EInvalidProof);

        event::emit(ProofVerified {
            public_inputs_hash: public_inputs_bytes,
        });
    }
}

#[test_only]
module verifier::groth16_verifier_tests {
    use verifier::groth16_verifier;

    #[test]
    fun test_verify_valid_proof() {
        // Verifying key (Arkworks compressed format)
        let vk = x"e2f26dbea299f5223b646cb1fb33eadb059d9407559d7441dfd902e3a79a4d2dabb73dc17fbc13021e2471e0c08bd67d8401f52b73d6d07483794cad4778180e0c06f33bbc4c79a9cadef253a68084d382f17788f885c9afd176f7cb2f036789edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e191d47682eceaa492945c8fb9249f724867edc3b39447bd1521d0d5b05f1f4fc1470fdf2c375a9a73ab4a9d6766325c448756fa5c61bb02f2aae0ee438c276a2850200000000000000c0e162d8d58c343e466e6c67162264dc3e6cb6006c88ed7d92356492b466389d5ea5ac3db97c931a6231fee6624e7a977f9d883ac48d68624f227007bd0e612e";

        // Proof points (pi_a || pi_b || pi_c)
        let proof_points = x"5eff46c3381a14a6b5e92540d392784768fdf28472c46857d14fe34fb19a8714516472381e72e82fb9901bd23e00bae7973b0d6321a9b6758b89c4c7991a6e161679f5ae77bb931e4c7d4980abe22948a9107e36dbeedd32ed7c4edf43a72592c29de0418e3d3bd83ba3c02ddf500bb4a51b10b5b1561486366f31d09a51ac25";

        // Public inputs (hash = Poseidon(12345))
        let public_inputs = x"b634a4b18daaf9a4a5dcf70aff8ed0939f6467099dc7eff5f4bcf83ea9566f09";

        // Should return true for valid proof
        let is_valid = groth16_verifier::verify_proof(vk, public_inputs, proof_points);
        assert!(is_valid, 0);
    }

    #[test]
    #[expected_failure]
    fun test_verify_invalid_proof() {
        // Same VK
        let vk = x"e2f26dbea299f5223b646cb1fb33eadb059d9407559d7441dfd902e3a79a4d2dabb73dc17fbc13021e2471e0c08bd67d8401f52b73d6d07483794cad4778180e0c06f33bbc4c79a9cadef253a68084d382f17788f885c9afd176f7cb2f036789edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e191d47682eceaa492945c8fb9249f724867edc3b39447bd1521d0d5b05f1f4fc1470fdf2c375a9a73ab4a9d6766325c448756fa5c61bb02f2aae0ee438c276a2850200000000000000c0e162d8d58c343e466e6c67162264dc3e6cb6006c88ed7d92356492b466389d5ea5ac3db97c931a6231fee6624e7a977f9d883ac48d68624f227007bd0e612e";

        // Same proof
        let proof_points = x"5eff46c3381a14a6b5e92540d392784768fdf28472c46857d14fe34fb19a8714516472381e72e82fb9901bd23e00bae7973b0d6321a9b6758b89c4c7991a6e161679f5ae77bb931e4c7d4980abe22948a9107e36dbeedd32ed7c4edf43a72592c29de0418e3d3bd83ba3c02ddf500bb4a51b10b5b1561486366f31d09a51ac25";

        // WRONG public inputs (different hash value)
        let public_inputs = x"0000000000000000000000000000000000000000000000000000000000000001";

        // This should fail (return false)
        let is_valid = groth16_verifier::verify_proof(vk, public_inputs, proof_points);
        assert!(is_valid, 0); // Will fail because is_valid is false
    }
}
