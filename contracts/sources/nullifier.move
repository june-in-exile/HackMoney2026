/// Nullifier Registry to prevent double-spending.
/// A nullifier is hash(spending_key, note_position) - only the owner can compute it.
module octopus::nullifier {
    use sui::table::{Self, Table};

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

    // ============ Test Helpers ============

    #[test_only]
    public fun destroy_for_testing(registry: NullifierRegistry) {
        let NullifierRegistry { id, spent, count: _ } = registry;
        table::drop(spent);
        object::delete(id);
    }
}
