/// Unit tests for Octopus core data structures
#[test_only]
module railgun::tests {
    use sui::test_scenario::{Self as ts};
    use std::type_name;
    use railgun::merkle_tree::{Self};
    use railgun::note::{Self};
    use railgun::nullifier::{Self};

    const ADMIN: address = @0xAD;

    // ============ Merkle Tree Tests ============

    #[test]
    fun test_merkle_tree_new() {
        let mut scenario = ts::begin(ADMIN);
        {
            let ctx = ts::ctx(&mut scenario);
            let tree = merkle_tree::new(ctx);

            // Initial state
            assert!(merkle_tree::get_next_index(&tree) == 0, 0);
            let root = merkle_tree::get_root(&tree);
            assert!(vector::length(&root) == 32, 1);

            merkle_tree::destroy_for_testing(tree);
        };
        ts::end(scenario);
    }

    #[test]
    fun test_merkle_tree_insert() {
        let mut scenario = ts::begin(ADMIN);
        {
            let ctx = ts::ctx(&mut scenario);
            let mut tree = merkle_tree::new(ctx);

            // Insert first leaf
            let leaf1 = x"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
            let root_before = merkle_tree::get_root(&tree);
            merkle_tree::insert(&mut tree, leaf1);
            let root_after = merkle_tree::get_root(&tree);

            // Root should change after insertion
            assert!(root_before != root_after, 0);
            assert!(merkle_tree::get_next_index(&tree) == 1, 1);

            // Insert second leaf
            let leaf2 = x"fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
            let root_before_2 = merkle_tree::get_root(&tree);
            merkle_tree::insert(&mut tree, leaf2);
            let root_after_2 = merkle_tree::get_root(&tree);

            assert!(root_before_2 != root_after_2, 2);
            assert!(merkle_tree::get_next_index(&tree) == 2, 3);

            merkle_tree::destroy_for_testing(tree);
        };
        ts::end(scenario);
    }

    #[test]
    fun test_merkle_tree_multiple_inserts() {
        let mut scenario = ts::begin(ADMIN);
        {
            let ctx = ts::ctx(&mut scenario);
            let mut tree = merkle_tree::new(ctx);

            // Insert 10 leaves
            let mut i = 0u64;
            while (i < 10) {
                let mut leaf = vector::empty<u8>();
                let mut j = 0u64;
                while (j < 32) {
                    vector::push_back(&mut leaf, ((i + j) as u8));
                    j = j + 1;
                };
                merkle_tree::insert(&mut tree, leaf);
                i = i + 1;
            };

            assert!(merkle_tree::get_next_index(&tree) == 10, 0);

            merkle_tree::destroy_for_testing(tree);
        };
        ts::end(scenario);
    }

    #[test]
    fun test_merkle_tree_deterministic() {
        let mut scenario = ts::begin(ADMIN);
        {
            let ctx = ts::ctx(&mut scenario);
            let mut tree1 = merkle_tree::new(ctx);

            let leaf = x"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
            merkle_tree::insert(&mut tree1, leaf);
            let root1 = merkle_tree::get_root(&tree1);
            merkle_tree::destroy_for_testing(tree1);

            let ctx2 = ts::ctx(&mut scenario);
            let mut tree2 = merkle_tree::new(ctx2);
            merkle_tree::insert(&mut tree2, leaf);
            let root2 = merkle_tree::get_root(&tree2);

            // Same leaf should produce same root
            assert!(root1 == root2, 0);

            merkle_tree::destroy_for_testing(tree2);
        };
        ts::end(scenario);
    }

    // ============ Note Tests ============

    #[test]
    fun test_note_commitment() {
        let owner_pk = x"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let amount = 1000u64;
        let token_type = type_name::get<sui::sui::SUI>();
        let random = x"fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

        let commitment = note::compute_commitment(owner_pk, amount, token_type, random);
        let value = note::commitment_value(&commitment);

        // Commitment should be 32 bytes (keccak256 output)
        assert!(vector::length(&value) == 32, 0);
    }

    #[test]
    fun test_note_commitment_deterministic() {
        let owner_pk = x"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let amount = 1000u64;
        let token_type = type_name::get<sui::sui::SUI>();
        let random = x"fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

        let commitment1 = note::compute_commitment(owner_pk, amount, token_type, random);
        let commitment2 = note::compute_commitment(owner_pk, amount, token_type, random);

        // Same inputs should produce same commitment
        assert!(note::commitment_value(&commitment1) == note::commitment_value(&commitment2), 0);
    }

    #[test]
    fun test_note_commitment_different_inputs() {
        let owner_pk = x"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let amount1 = 1000u64;
        let amount2 = 2000u64;
        let token_type = type_name::get<sui::sui::SUI>();
        let random = x"fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

        let commitment1 = note::compute_commitment(owner_pk, amount1, token_type, random);
        let commitment2 = note::compute_commitment(owner_pk, amount2, token_type, random);

        // Different amounts should produce different commitments
        assert!(note::commitment_value(&commitment1) != note::commitment_value(&commitment2), 0);
    }

    #[test]
    fun test_note_encrypted() {
        let ciphertext = x"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let ephemeral_key = x"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

        let encrypted = note::create_encrypted_note(ciphertext, ephemeral_key);

        assert!(note::get_ciphertext(&encrypted) == ciphertext, 0);
        assert!(note::get_ephemeral_key(&encrypted) == ephemeral_key, 1);
    }

    #[test]
    fun test_note_commitment_from_bytes() {
        let value = x"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let commitment = note::commitment_from_bytes(value);
        assert!(note::commitment_value(&commitment) == value, 0);
    }

    // ============ Nullifier Tests ============

    #[test]
    fun test_nullifier_registry_new() {
        let mut scenario = ts::begin(ADMIN);
        {
            let ctx = ts::ctx(&mut scenario);
            let registry = nullifier::new(ctx);

            assert!(nullifier::get_count(&registry) == 0, 0);

            nullifier::destroy_for_testing(registry);
        };
        ts::end(scenario);
    }

    #[test]
    fun test_nullifier_mark_spent() {
        let mut scenario = ts::begin(ADMIN);
        {
            let ctx = ts::ctx(&mut scenario);
            let mut registry = nullifier::new(ctx);

            let nullifier_hash = x"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

            // Not spent initially
            assert!(!nullifier::is_spent(&registry, nullifier_hash), 0);

            // Mark as spent
            nullifier::mark_spent(&mut registry, nullifier_hash);

            // Now it should be spent
            assert!(nullifier::is_spent(&registry, nullifier_hash), 1);
            assert!(nullifier::get_count(&registry) == 1, 2);

            nullifier::destroy_for_testing(registry);
        };
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = railgun::nullifier::ENullifierAlreadySpent)]
    fun test_nullifier_double_spend() {
        let mut scenario = ts::begin(ADMIN);
        {
            let ctx = ts::ctx(&mut scenario);
            let mut registry = nullifier::new(ctx);

            let nullifier_hash = x"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

            // First spend should succeed
            nullifier::mark_spent(&mut registry, nullifier_hash);

            // Second spend should fail (double-spend)
            nullifier::mark_spent(&mut registry, nullifier_hash);

            nullifier::destroy_for_testing(registry);
        };
        ts::end(scenario);
    }

    #[test]
    fun test_nullifier_multiple_different() {
        let mut scenario = ts::begin(ADMIN);
        {
            let ctx = ts::ctx(&mut scenario);
            let mut registry = nullifier::new(ctx);

            let nullifier1 = x"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
            let nullifier2 = x"fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
            let nullifier3 = x"1111111111111111111111111111111111111111111111111111111111111111";

            nullifier::mark_spent(&mut registry, nullifier1);
            nullifier::mark_spent(&mut registry, nullifier2);
            nullifier::mark_spent(&mut registry, nullifier3);

            assert!(nullifier::is_spent(&registry, nullifier1), 0);
            assert!(nullifier::is_spent(&registry, nullifier2), 1);
            assert!(nullifier::is_spent(&registry, nullifier3), 2);
            assert!(nullifier::get_count(&registry) == 3, 3);

            // Unspent nullifier
            let nullifier4 = x"2222222222222222222222222222222222222222222222222222222222222222";
            assert!(!nullifier::is_spent(&registry, nullifier4), 4);

            nullifier::destroy_for_testing(registry);
        };
        ts::end(scenario);
    }

    #[test]
    fun test_nullifier_compute() {
        let spending_key = x"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let position = 42u64;

        let nullifier1 = nullifier::compute_nullifier(spending_key, position);
        let nullifier2 = nullifier::compute_nullifier(spending_key, position);

        // Same inputs should produce same nullifier
        assert!(nullifier1 == nullifier2, 0);
        // Nullifier should be 32 bytes
        assert!(vector::length(&nullifier1) == 32, 1);

        // Different position should produce different nullifier
        let nullifier3 = nullifier::compute_nullifier(spending_key, 43);
        assert!(nullifier1 != nullifier3, 2);
    }

    // ============ Integration Tests ============

    #[test]
    fun test_note_in_merkle_tree() {
        let mut scenario = ts::begin(ADMIN);
        {
            let ctx = ts::ctx(&mut scenario);
            let mut tree = merkle_tree::new(ctx);

            // Create a note commitment
            let owner_pk = x"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
            let amount = 1000u64;
            let token_type = type_name::get<sui::sui::SUI>();
            let random = x"fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

            let commitment = note::compute_commitment(owner_pk, amount, token_type, random);
            let commitment_bytes = note::commitment_value(&commitment);

            // Insert commitment into Merkle tree
            merkle_tree::insert(&mut tree, commitment_bytes);

            assert!(merkle_tree::get_next_index(&tree) == 1, 0);

            merkle_tree::destroy_for_testing(tree);
        };
        ts::end(scenario);
    }

    #[test]
    fun test_full_utxo_lifecycle() {
        let mut scenario = ts::begin(ADMIN);
        {
            let ctx = ts::ctx(&mut scenario);
            let mut tree = merkle_tree::new(ctx);

            let ctx2 = ts::ctx(&mut scenario);
            let mut registry = nullifier::new(ctx2);

            // 1. Create note commitment (shield)
            let owner_pk = x"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
            let spending_key = x"fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
            let amount = 1000u64;
            let token_type = type_name::get<sui::sui::SUI>();
            let random = x"1111111111111111111111111111111111111111111111111111111111111111";

            let commitment = note::compute_commitment(owner_pk, amount, token_type, random);

            // 2. Insert into Merkle tree
            let position = merkle_tree::get_next_index(&tree);
            merkle_tree::insert(&mut tree, note::commitment_value(&commitment));

            // 3. Compute nullifier for spending
            let nullifier_hash = nullifier::compute_nullifier(spending_key, position);

            // 4. Check nullifier not spent
            assert!(!nullifier::is_spent(&registry, nullifier_hash), 0);

            // 5. Spend (unshield) - mark nullifier
            nullifier::mark_spent(&mut registry, nullifier_hash);

            // 6. Cannot double-spend
            assert!(nullifier::is_spent(&registry, nullifier_hash), 1);

            merkle_tree::destroy_for_testing(tree);
            nullifier::destroy_for_testing(registry);
        };
        ts::end(scenario);
    }
}
