/// UTXO Note structure for the privacy system.
/// Notes represent shielded tokens that can only be spent by the owner.
module railgun::note {
    use std::type_name::{Self, TypeName};
    use sui::hash::keccak256;

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

    /// Compute a note commitment from its components.
    /// This is called off-chain to generate the commitment before shielding.
    public fun compute_commitment(
        owner_pk: vector<u8>,
        amount: u64,
        token_type: TypeName,
        random: vector<u8>,
    ): NoteCommitment {
        let preimage = build_preimage(owner_pk, amount, token_type, random);
        NoteCommitment { value: keccak256(&preimage) }
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
