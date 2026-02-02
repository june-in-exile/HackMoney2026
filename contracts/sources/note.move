/// UTXO Note structure for the privacy system.
/// Notes represent shielded tokens that can only be spent by the owner.
module octopus::note {
    use std::type_name::{Self, TypeName};
    use sui::poseidon;

    // ============ Constants ============

    /// BN254 field modulus for Poseidon hash
    const BN254_MAX: u256 = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    // ============ Structs ============

    /// A commitment to a note (stored on-chain in the Merkle tree).
    /// commitment = hash(owner_pk || amount || token_type || random)
    public struct NoteCommitment has store, drop, copy {
        value: vector<u8>,
    }

    /// Encrypted note data (emitted in events for owner to scan).
    /// Only the owner with the viewing key can decrypt this.
    public struct EncryptedNote has store, drop, copy {
        /// Encrypted ciphertext containing note details
        ciphertext: vector<u8>,
        /// Ephemeral public key for ECDH key exchange
        ephemeral_key: vector<u8>,
    }

    /// Plaintext note (never stored on-chain, used off-chain only).
    /// This is what the user decrypts from EncryptedNote.
    #[allow(unused_field)]
    public struct NotePlaintext has drop {
        /// Owner's public key (compressed)
        owner_pk: vector<u8>,
        /// Token amount
        amount: u64,
        /// Token type identifier
        token_type: TypeName,
        /// Random blinding factor for commitment
        random: vector<u8>,
    }

    // ============ Public Functions ============

    /// Compute a note commitment from its components using Poseidon hash.
    /// NOTE: This is a legacy test helper. In production, commitments are computed
    /// off-chain using the circuit formula: Poseidon(NPK, token, value)
    public fun compute_commitment(
        owner_pk: vector<u8>,
        amount: u64,
        token_type: TypeName,
        random: vector<u8>,
    ): NoteCommitment {
        let preimage = build_preimage(owner_pk, amount, token_type, random);
        // Hash the entire preimage by splitting into 32-byte chunks
        let hash_u256 = hash_preimage_with_poseidon(preimage);
        NoteCommitment { value: u256_to_bytes(hash_u256) }
    }

    /// Hash a preimage (of any length) using Poseidon by splitting into chunks
    fun hash_preimage_with_poseidon(preimage: vector<u8>): u256 {
        let len = vector::length(&preimage);
        let mut inputs = vector::empty<u256>();

        // Split preimage into 32-byte chunks and hash each
        let mut i = 0;
        while (i < len) {
            let mut chunk = vector::empty<u8>();
            let mut j = 0;
            while (j < 32 && i < len) {
                vector::push_back(&mut chunk, *vector::borrow(&preimage, i));
                i = i + 1;
                j = j + 1u64;
            };
            // Pad last chunk with zeros if needed
            while (j < 32u64) {
                vector::push_back(&mut chunk, 0u8);
                j = j + 1;
            };
            vector::push_back(&mut inputs, bytes_to_u256(chunk));
        };

        // Hash all chunks together
        poseidon::poseidon_bn254(&inputs)
    }

    /// Convert 32-byte vector to u256 (big-endian) for Poseidon with BN254 field reduction
    fun bytes_to_u256(bytes: vector<u8>): u256 {
        let mut result = 0u256;
        let len = vector::length(&bytes);
        let mut i = 0;
        // Use first 32 bytes if longer, pad with zeros if shorter
        let max_bytes = if (len > 32) { 32 } else { len };
        while (i < max_bytes) {
            result = (result << 8) | (*vector::borrow(&bytes, i) as u256);
            i = i + 1;
        };
        // Reduce modulo BN254 field to ensure validity
        result % BN254_MAX
    }

    /// Convert u256 to 32-byte vector (big-endian)
    fun u256_to_bytes(value: u256): vector<u8> {
        let mut bytes = vector::empty<u8>();
        let mut v = value;
        let mut i = 0u64;
        while (i < 32u64) {
            vector::push_back(&mut bytes, ((v & 0xff) as u8));
            v = v >> 8;
            i = i + 1;
        };
        vector::reverse(&mut bytes);
        bytes
    }

    /// Create an encrypted note (called off-chain).
    /// In production, this would use ECIES encryption.
    public fun create_encrypted_note(
        ciphertext: vector<u8>,
        ephemeral_key: vector<u8>,
    ): EncryptedNote {
        EncryptedNote { ciphertext, ephemeral_key }
    }

    /// Get the raw commitment value
    public fun commitment_value(commitment: &NoteCommitment): vector<u8> {
        commitment.value
    }

    /// Create a commitment directly from bytes (for importing from off-chain)
    public fun commitment_from_bytes(value: vector<u8>): NoteCommitment {
        NoteCommitment { value }
    }

    /// Get ciphertext from encrypted note
    public fun get_ciphertext(note: &EncryptedNote): vector<u8> {
        note.ciphertext
    }

    /// Get ephemeral key from encrypted note
    public fun get_ephemeral_key(note: &EncryptedNote): vector<u8> {
        note.ephemeral_key
    }

    // ============ Internal Functions ============

    /// Build the preimage for commitment hashing
    fun build_preimage(
        owner_pk: vector<u8>,
        amount: u64,
        token_type: TypeName,
        random: vector<u8>,
    ): vector<u8> {
        let mut preimage = owner_pk;

        // Append amount as 8 bytes (little-endian)
        let mut i = 0u64;
        let mut amt = amount;
        while (i < 8) {
            vector::push_back(&mut preimage, ((amt & 0xFF) as u8));
            amt = amt >> 8;
            i = i + 1;
        };

        // Append token type as bytes
        let type_bytes = type_name::into_string(token_type).into_bytes();
        vector::append(&mut preimage, type_bytes);

        // Append random
        vector::append(&mut preimage, random);

        preimage
    }

    // ============ Test Helpers ============

    #[test_only]
    public fun test_compute_commitment(): NoteCommitment {
        let owner_pk = x"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let amount = 1000u64;
        let token_type = type_name::get<sui::sui::SUI>();
        let random = x"fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
        compute_commitment(owner_pk, amount, token_type, random)
    }
}
