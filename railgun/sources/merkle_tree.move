/// Incremental Merkle Tree for tracking note commitments.
/// Uses Poseidon hash (BN254) and supports 2^16 leaves.
module railgun::merkle_tree {
    use sui::poseidon;

    // ============ Constants ============

    /// Tree depth (supports 2^16 = 65536 notes)
    const TREE_DEPTH: u64 = 16;
    const TREE_DEPTH_U8: u8 = 16;

    /// BN254 field modulus for Poseidon hash
    const BN254_MAX: u256 = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    // ============ Errors ============

    /// Tree is full (all 2^TREE_DEPTH leaves used)
    const ETreeFull: u64 = 0;
    /// Invalid proof length
    const EInvalidProofLength: u64 = 1;
    /// Invalid bytes length (must be 32 bytes)
    const EInvalidLength: u64 = 2;

    // ============ Structs ============

    /// Incremental Merkle Tree that efficiently tracks note commitments.
    /// Only stores filled subtrees and the current root.
    public struct MerkleTree has key, store {
        id: UID,
        /// Current Merkle root
        root: vector<u8>,
        /// Index of the next leaf to insert
        next_index: u64,
        /// Filled subtrees at each level (from leaf to root)
        filled_subtrees: vector<vector<u8>>,
        /// Precomputed zero hashes at each level
        zeros: vector<vector<u8>>,
    }

    // ============ Public Functions ============

    /// Create a new empty Merkle Tree
    public fun new(ctx: &mut TxContext): MerkleTree {
        let zeros = compute_zeros();
        let root = *vector::borrow(&zeros, TREE_DEPTH);

        MerkleTree {
            id: object::new(ctx),
            root,
            next_index: 0,
            filled_subtrees: vector::empty(),
            zeros,
        }
    }

    /// Insert a new leaf into the tree
    public fun insert(tree: &mut MerkleTree, leaf: vector<u8>) {
        assert!(tree.next_index < (1u64 << TREE_DEPTH_U8), ETreeFull);

        let mut current_index = tree.next_index;
        let mut current_hash = leaf;
        let mut i = 0u64;

        while (i < TREE_DEPTH) {
            let is_left = current_index % 2 == 0;

            if (is_left) {
                // Left child: pair with zero hash
                // Store this as the filled subtree at this level
                if (vector::length(&tree.filled_subtrees) <= i) {
                    vector::push_back(&mut tree.filled_subtrees, current_hash);
                } else {
                    *vector::borrow_mut(&mut tree.filled_subtrees, i) = current_hash;
                };
                let zero = *vector::borrow(&tree.zeros, i);
                current_hash = hash_pair(current_hash, zero);
            } else {
                // Right child: pair with filled subtree
                let left = *vector::borrow(&tree.filled_subtrees, i);
                current_hash = hash_pair(left, current_hash);
            };

            current_index = current_index / 2;
            i = i + 1;
        };

        tree.root = current_hash;
        tree.next_index = tree.next_index + 1;
    }

    /// Get the current root
    public fun get_root(tree: &MerkleTree): vector<u8> {
        tree.root
    }

    /// Get the number of inserted leaves
    public fun get_next_index(tree: &MerkleTree): u64 {
        tree.next_index
    }

    /// Verify a Merkle proof
    /// Returns true if the leaf at the given index produces the expected root
    public fun verify_proof(
        tree: &MerkleTree,
        leaf: vector<u8>,
        index: u64,
        proof: vector<vector<u8>>,
    ): bool {
        assert!(vector::length(&proof) == TREE_DEPTH, EInvalidProofLength);

        let mut current_hash = leaf;
        let mut current_index = index;
        let mut i = 0u64;

        while (i < TREE_DEPTH) {
            let sibling = *vector::borrow(&proof, i);
            let is_left = current_index % 2 == 0;

            if (is_left) {
                current_hash = hash_pair(current_hash, sibling);
            } else {
                current_hash = hash_pair(sibling, current_hash);
            };

            current_index = current_index / 2;
            i = i + 1;
        };

        current_hash == tree.root
    }

    // ============ Internal Functions ============

    /// Hash two nodes together using Poseidon
    fun hash_pair(left: vector<u8>, right: vector<u8>): vector<u8> {
        // Convert 32-byte vectors to u256
        let left_u256 = bytes_to_u256(left);
        let right_u256 = bytes_to_u256(right);

        // Hash with Poseidon
        let inputs = vector[left_u256, right_u256];
        let hash_u256 = poseidon::poseidon_bn254(&inputs);

        // Convert back to 32-byte vector
        u256_to_bytes(hash_u256)
    }

    /// Convert 32-byte vector to u256 (little-endian for Sui groth16 compatibility)
    fun bytes_to_u256(bytes: vector<u8>): u256 {
        assert!(vector::length(&bytes) == 32, EInvalidLength);

        let mut result = 0u256;
        let mut i = 32;
        // Read from high byte to low byte (LE format)
        while (i > 0) {
            i = i - 1;
            result = (result << 8) | (*vector::borrow(&bytes, i) as u256);
        };

        // Reduce modulo BN254 field to ensure validity
        result % BN254_MAX
    }

    /// Convert u256 to 32-byte vector (little-endian for Sui groth16 compatibility)
    fun u256_to_bytes(value: u256): vector<u8> {
        let mut bytes = vector::empty<u8>();
        let mut v = value;
        let mut i = 0;
        while (i < 32) {
            vector::push_back(&mut bytes, ((v & 0xff) as u8));
            v = v >> 8;
            i = i + 1;
        };
        // REMOVED vector::reverse() - now returns little-endian
        bytes
    }

    /// Compute zero hashes for each level
    /// zeros[0] = hash of empty leaf (32 zero bytes)
    /// zeros[i] = hash(zeros[i-1], zeros[i-1])
    fun compute_zeros(): vector<vector<u8>> {
        let mut zeros = vector::empty<vector<u8>>();

        // Level 0: empty leaf (32 zero bytes)
        let mut zero_leaf = vector::empty<u8>();
        let mut j = 0u64;
        while (j < 32) {
            vector::push_back(&mut zero_leaf, 0u8);
            j = j + 1;
        };
        vector::push_back(&mut zeros, zero_leaf);

        // Compute zero hashes for each level
        let mut i = 0u64;
        while (i < TREE_DEPTH) {
            let prev_zero = *vector::borrow(&zeros, i);
            let next_zero = hash_pair(prev_zero, prev_zero);
            vector::push_back(&mut zeros, next_zero);
            i = i + 1;
        };

        zeros
    }

    // ============ Test Helpers ============

    #[test_only]
    public fun destroy_for_testing(tree: MerkleTree) {
        let MerkleTree { id, root: _, next_index: _, filled_subtrees: _, zeros: _ } = tree;
        object::delete(id);
    }
}
