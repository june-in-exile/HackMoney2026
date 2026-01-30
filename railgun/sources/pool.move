/// Privacy Pool for Railgun on Sui
/// Based on Railgun Privacy protocol architecture
/// Implements shield (deposit) and unshield (withdraw with ZK proof) functionality
module railgun::pool {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::groth16;
    use sui::event;
    use railgun::merkle_tree::{Self, MerkleTree};
    use railgun::nullifier::{Self, NullifierRegistry};

    // ============ Errors ============

    /// Nullifier has already been spent (double-spend attempt)
    const E_DOUBLE_SPEND: u64 = 1;
    /// ZK proof verification failed
    const E_INVALID_PROOF: u64 = 2;
    /// Merkle root is not valid (not current or in history)
    const E_INVALID_ROOT: u64 = 3;
    /// Insufficient balance in pool
    const E_INSUFFICIENT_BALANCE: u64 = 4;
    /// Invalid public inputs format
    const E_INVALID_PUBLIC_INPUTS: u64 = 5;

    // ============ Constants ============

    /// Number of historical roots to keep for proof validity
    const ROOT_HISTORY_SIZE: u64 = 100;

    // ============ Structs ============

    /// Main privacy pool holding shielded tokens of type T.
    /// Each token type has its own pool instance.
    public struct PrivacyPool<phantom T> has key, store {
        id: UID,
        /// Total shielded balance
        balance: Balance<T>,
        /// Merkle tree tracking note commitments
        merkle_tree: MerkleTree,
        /// Registry of spent nullifiers
        nullifiers: NullifierRegistry,
        /// Groth16 verification key (Arkworks compressed format)
        vk_bytes: vector<u8>,
        /// Historical merkle roots for proof validity window
        historical_roots: vector<vector<u8>>,
    }

    /// Event emitted when tokens are shielded (deposited) into the pool
    public struct ShieldEvent has copy, drop {
        /// Position of the commitment in the Merkle tree
        position: u64,
        /// Note commitment hash
        commitment: vector<u8>,
        /// Encrypted note data for recipient to scan
        encrypted_note: vector<u8>,
    }

    /// Event emitted when tokens are unshielded (withdrawn) from the pool
    public struct UnshieldEvent has copy, drop {
        /// Nullifier that was spent
        nullifier: vector<u8>,
        /// Recipient address
        recipient: address,
        /// Amount withdrawn
        amount: u64,
    }

    // ============ Public Functions ============

    /// Create a new privacy pool for token type T with the given verification key.
    /// The verification key is generated from the unshield circuit compilation.
    public fun create_pool<T>(
        vk_bytes: vector<u8>,
        ctx: &mut TxContext,
    ): PrivacyPool<T> {
        PrivacyPool {
            id: object::new(ctx),
            balance: balance::zero(),
            merkle_tree: merkle_tree::new(ctx),
            nullifiers: nullifier::new(ctx),
            vk_bytes,
            historical_roots: vector::empty(),
        }
    }

    /// Create and share a privacy pool as a shared object.
    /// This is the typical way to deploy a pool for public use.
    public entry fun create_shared_pool<T>(
        vk_bytes: vector<u8>,
        ctx: &mut TxContext,
    ) {
        let pool = create_pool<T>(vk_bytes, ctx);
        transfer::share_object(pool);
    }

    /// Shield tokens into the privacy pool.
    ///
    /// The commitment is computed off-chain using Railgun formulas:
    /// - MPK = Poseidon(spending_key, nullifying_key)
    /// - NPK = Poseidon(MPK, random)
    /// - commitment = Poseidon(NPK, token, value)
    ///
    /// The encrypted_note allows the recipient to scan and identify their notes.
    public entry fun shield<T>(
        pool: &mut PrivacyPool<T>,
        coin: Coin<T>,
        commitment: vector<u8>,
        encrypted_note: vector<u8>,
        _ctx: &mut TxContext,
    ) {
        // 1. Record position before insert
        let position = merkle_tree::get_next_index(&pool.merkle_tree);

        // 2. Take coin into pool balance
        balance::join(&mut pool.balance, coin::into_balance(coin));

        // 3. Insert commitment into Merkle tree
        merkle_tree::insert(&mut pool.merkle_tree, commitment);

        // 4. Save historical root for proof validity window
        save_historical_root(pool);

        // 5. Emit event for wallet scanning
        event::emit(ShieldEvent { position, commitment, encrypted_note });
    }

    /// Unshield tokens from the privacy pool with ZK proof verification.
    ///
    /// The ZK proof proves:
    /// 1. Knowledge of spending_key and nullifying_key (ownership)
    /// 2. Correct commitment computation
    /// 3. Correct nullifier computation: nullifier = Poseidon(nullifying_key, leaf_index)
    /// 4. Commitment exists in Merkle tree at the claimed position
    ///
    /// Public inputs format (96 bytes total):
    /// - merkle_root (32 bytes): Merkle tree root
    /// - nullifier (32 bytes): Unique identifier preventing double-spend
    /// - commitment (32 bytes): The note commitment being spent
    public entry fun unshield<T>(
        pool: &mut PrivacyPool<T>,
        proof_bytes: vector<u8>,
        public_inputs_bytes: vector<u8>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext,
    ) {
        // Validate public inputs length (3 field elements × 32 bytes = 96 bytes)
        assert!(vector::length(&public_inputs_bytes) == 96, E_INVALID_PUBLIC_INPUTS);

        // 1. Parse public inputs [merkle_root, nullifier, commitment]
        let (merkle_root, nullifier_bytes, _commitment) = parse_public_inputs(&public_inputs_bytes);

        // 2. Verify merkle root is valid (current or in history)
        assert!(is_valid_root(pool, &merkle_root), E_INVALID_ROOT);

        // 3. Check nullifier has not been spent (prevent double-spend)
        assert!(!nullifier::is_spent(&pool.nullifiers, nullifier_bytes), E_DOUBLE_SPEND);

        // 4. Verify Groth16 ZK proof
        let pvk = groth16::prepare_verifying_key(&groth16::bn254(), &pool.vk_bytes);
        let public_inputs = groth16::public_proof_inputs_from_bytes(public_inputs_bytes);
        let proof_points = groth16::proof_points_from_bytes(proof_bytes);

        assert!(
            groth16::verify_groth16_proof(&groth16::bn254(), &pvk, &public_inputs, &proof_points),
            E_INVALID_PROOF
        );

        // 5. Mark nullifier as spent
        nullifier::mark_spent(&mut pool.nullifiers, nullifier_bytes);

        // 6. Transfer tokens to recipient
        assert!(balance::value(&pool.balance) >= amount, E_INSUFFICIENT_BALANCE);
        let withdrawn = coin::take(&mut pool.balance, amount, ctx);
        transfer::public_transfer(withdrawn, recipient);

        // 7. Emit event
        event::emit(UnshieldEvent {
            nullifier: nullifier_bytes,
            recipient,
            amount
        });
    }

    // ============ View Functions ============

    /// Get the current Merkle root
    public fun get_merkle_root<T>(pool: &PrivacyPool<T>): vector<u8> {
        merkle_tree::get_root(&pool.merkle_tree)
    }

    /// Get the number of notes in the pool
    public fun get_note_count<T>(pool: &PrivacyPool<T>): u64 {
        merkle_tree::get_next_index(&pool.merkle_tree)
    }

    /// Get the total shielded balance
    public fun get_balance<T>(pool: &PrivacyPool<T>): u64 {
        balance::value(&pool.balance)
    }

    /// Check if a nullifier has been spent
    public fun is_nullifier_spent<T>(pool: &PrivacyPool<T>, nullifier: vector<u8>): bool {
        nullifier::is_spent(&pool.nullifiers, nullifier)
    }

    // ============ Internal Functions ============

    /// Save the current root to historical roots
    fun save_historical_root<T>(pool: &mut PrivacyPool<T>) {
        let root = merkle_tree::get_root(&pool.merkle_tree);
        vector::push_back(&mut pool.historical_roots, root);

        // Keep only last ROOT_HISTORY_SIZE roots
        while (vector::length(&pool.historical_roots) > ROOT_HISTORY_SIZE) {
            vector::remove(&mut pool.historical_roots, 0);
        };
    }

    /// Check if a root is valid (current or in history)
    fun is_valid_root<T>(pool: &PrivacyPool<T>, root: &vector<u8>): bool {
        // Check current root
        if (*root == merkle_tree::get_root(&pool.merkle_tree)) {
            return true
        };

        // Check historical roots
        let len = vector::length(&pool.historical_roots);
        let mut i = 0;
        while (i < len) {
            if (*root == *vector::borrow(&pool.historical_roots, i)) {
                return true
            };
            i = i + 1;
        };

        false
    }

    /// Parse public inputs from concatenated bytes.
    /// Returns (merkle_root, nullifier, commitment) each as 32-byte vectors.
    fun parse_public_inputs(bytes: &vector<u8>): (vector<u8>, vector<u8>, vector<u8>) {
        let mut merkle_root = vector::empty<u8>();
        let mut nullifier = vector::empty<u8>();
        let mut commitment = vector::empty<u8>();

        // Extract merkle_root (bytes 0-31)
        let mut i = 0;
        while (i < 32) {
            vector::push_back(&mut merkle_root, *vector::borrow(bytes, i));
            i = i + 1;
        };

        // Extract nullifier (bytes 32-63)
        while (i < 64) {
            vector::push_back(&mut nullifier, *vector::borrow(bytes, i));
            i = i + 1;
        };

        // Extract commitment (bytes 64-95)
        while (i < 96) {
            vector::push_back(&mut commitment, *vector::borrow(bytes, i));
            i = i + 1;
        };

        (merkle_root, nullifier, commitment)
    }

    // ============ Test Helpers ============

    #[test_only]
    public fun destroy_for_testing<T>(pool: PrivacyPool<T>) {
        let PrivacyPool {
            id,
            balance,
            merkle_tree,
            nullifiers,
            vk_bytes: _,
            historical_roots: _
        } = pool;

        balance::destroy_for_testing(balance);
        merkle_tree::destroy_for_testing(merkle_tree);
        nullifier::destroy_for_testing(nullifiers);
        object::delete(id);
    }
}
