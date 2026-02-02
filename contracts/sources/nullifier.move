/// Nullifier Registry to prevent double-spending.
/// A nullifier is hash(spending_key, note_position) - only the owner can compute it.
module octopus::nullifier {
    use sui::table::{Self, Table};
    use sui::poseidon;

    // ============ Constants ============

    /// BN254 field modulus for Poseidon hash
    const BN254_MAX: u256 = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    // ============ Errors ============

    /// Nullifier has already been spent
    const ENullifierAlreadySpent: u64 = 0;

    // ============ Structs ============

    /// Registry that tracks all spent nullifiers.
    /// Once a nullifier is marked spent, the corresponding note cannot be used.
    public struct NullifierRegistry has key, store {
        id: UID,
        /// Map from nullifier hash to spent status
        spent: Table<vector<u8>, bool>,
        /// Total number of spent nullifiers
        count: u64,
    }

    // ============ Public Functions ============

    /// Create a new empty nullifier registry
    public fun new(ctx: &mut TxContext): NullifierRegistry {
        NullifierRegistry {
            id: object::new(ctx),
            spent: table::new(ctx),
            count: 0,
        }
    }

    /// Check if a nullifier has been spent
    public fun is_spent(registry: &NullifierRegistry, nullifier: vector<u8>): bool {
        table::contains(&registry.spent, nullifier)
    }

    /// Mark a nullifier as spent.
    /// Aborts if the nullifier was already spent (double-spend attempt).
    public fun mark_spent(registry: &mut NullifierRegistry, nullifier: vector<u8>) {
        assert!(!is_spent(registry, nullifier), ENullifierAlreadySpent);
        table::add(&mut registry.spent, nullifier, true);
        registry.count = registry.count + 1;
    }

    /// Get the total count of spent nullifiers
    public fun get_count(registry: &NullifierRegistry): u64 {
        registry.count
    }

    /// Compute a nullifier from spending key and note position using Poseidon hash.
    /// NOTE: This is a legacy test helper. In production, nullifiers are computed
    /// off-chain using the circuit formula: Poseidon(nullifying_key, leaf_index)
    /// nullifier = Poseidon(spending_key, position)
    public fun compute_nullifier(spending_key: vector<u8>, position: u64): vector<u8> {
        // Convert spending_key to u256
        let key_u256 = bytes_to_u256(spending_key);
        let position_u256 = (position as u256);

        // Hash with Poseidon
        let inputs = vector[key_u256, position_u256];
        let hash_u256 = poseidon::poseidon_bn254(&inputs);

        // Convert back to bytes
        u256_to_bytes(hash_u256)
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
        let mut i = 0;
        while (i < 32) {
            vector::push_back(&mut bytes, ((v & 0xff) as u8));
            v = v >> 8;
            i = i + 1;
        };
        vector::reverse(&mut bytes);
        bytes
    }

    // ============ Test Helpers ============

    #[test_only]
    public fun destroy_for_testing(registry: NullifierRegistry) {
        let NullifierRegistry { id, spent, count: _ } = registry;
        table::drop(spent);
        object::delete(id);
    }
}
