/// Nullifier Registry to prevent double-spending.
/// A nullifier is hash(spending_key, note_position) - only the owner can compute it.
module octopus::nullifier {
    use sui::dynamic_field;

    // ============ Structs ============

    /// Registry that tracks all spent nullifiers.
    /// Once a nullifier is marked spent, the corresponding note cannot be used.
    /// Uses dynamic fields for storage - each nullifier is stored as a dynamic field on the UID.
    public struct NullifierRegistry has key, store {
        id: UID,
        // Nullifiers are stored as dynamic fields: dynamic_field::add(&mut id, nullifier, true)
        count: u64,
    }

    // ============ Public Functions ============

    /// Create a new empty nullifier registry
    public fun new(ctx: &mut TxContext): NullifierRegistry {
        NullifierRegistry {
            id: object::new(ctx),
            count: 0,
        }
    }

    /// Check if a nullifier has been spent
    public fun is_spent(registry: &NullifierRegistry, nullifier: vector<u8>): bool {
        dynamic_field::exists_<vector<u8>>(&registry.id, nullifier)
    }

    /// Mark a nullifier as spent.
    /// Aborts if the nullifier was already spent (double-spend attempt).
    /// Uses Sui's dynamic_field::add which automatically aborts on duplicate keys.
    public fun mark_spent(registry: &mut NullifierRegistry, nullifier: vector<u8>) {
        dynamic_field::add(&mut registry.id, nullifier, true);
        registry.count = registry.count + 1;
    }

    /// Return the total number of spent nullifiers
    public fun count(registry: &NullifierRegistry): u64 {
        registry.count
    }

    // ============ Test Helpers ============

    #[test_only]
    public fun destroy_for_testing(registry: NullifierRegistry) {
        let NullifierRegistry { id, count: _ } = registry;
        object::delete(id);
    }
}
