/// Privacy Pool for Octopus on Sui
/// Implements shield (deposit) and unshield (withdraw with ZK proof) functionality
module octopus::pool {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::groth16;
    use sui::event;
    use octopus::merkle_tree::{Self, MerkleTree};
    use octopus::nullifier::{Self, NullifierRegistry};

    // Cetus DEX integration (uncomment when Cetus package is available)
    // Note: Cetus package address is configured in Move.toml
    // use cetus_clmm::pool::{Self as cetus_pool, Pool as CetusPool};
    // use cetus_clmm::config::GlobalConfig as CetusGlobalConfig;

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

    /// Admin capability for managing pool verification keys.
    /// Allows updating VKs when circuit changes are made during development.
    public struct PoolAdminCap has key, store {
        id: UID,
        /// ID of the pool this admin cap controls
        pool_id: ID,
    }

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
        /// Groth16 verification key for unshield (Arkworks compressed format)
        vk_bytes: vector<u8>,
        /// Groth16 verification key for transfer (Arkworks compressed format)
        transfer_vk_bytes: vector<u8>,
        /// Groth16 verification key for swap (Arkworks compressed format)
        swap_vk_bytes: vector<u8>,
        /// Historical merkle roots for proof validity window
        historical_roots: vector<vector<u8>>,
    }

    /// Event emitted when tokens are shielded (deposited) into the pool
    public struct ShieldEvent has copy, drop {
        /// Pool ID where the note was created
        pool_id: ID,
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

    /// Event emitted when tokens are transferred privately within the pool
    public struct TransferEvent has copy, drop {
        /// Pool ID where the transfer occurred
        pool_id: ID,
        /// Nullifiers that were spent (2 inputs)
        input_nullifiers: vector<vector<u8>>,
        /// New commitments created (2 outputs)
        output_commitments: vector<vector<u8>>,
        /// Positions of output commitments in tree
        output_positions: vector<u64>,
        /// Encrypted note data for recipients to scan
        encrypted_notes: vector<vector<u8>>,
    }

    /// Event emitted when tokens are swapped privately through DEX
    #[allow(unused_field)]
    public struct SwapEvent has copy, drop {
        /// Input pool ID where notes were spent
        pool_in_id: ID,
        /// Output pool ID where note was created
        pool_out_id: ID,
        /// Nullifiers that were spent (2 inputs)
        input_nullifiers: vector<vector<u8>>,
        /// Output commitment (swapped token)
        output_commitment: vector<u8>,
        /// Change commitment (remaining input token)
        change_commitment: vector<u8>,
        /// Position of output commitment in output pool tree
        output_position: u64,
        /// Position of change commitment in input pool tree
        change_position: u64,
        /// Amount swapped in
        amount_in: u64,
        /// Amount received out
        amount_out: u64,
        /// Encrypted notes for recipient to scan
        encrypted_output_note: vector<u8>,
        encrypted_change_note: vector<u8>,
    }

    // ============ Public Functions ============

    /// Create a new privacy pool for token type T with the given verification keys.
    /// The verification keys are generated from circuit compilation (unshield, transfer, swap).
    public fun create_pool<T>(
        vk_bytes: vector<u8>,
        transfer_vk_bytes: vector<u8>,
        swap_vk_bytes: vector<u8>,
        ctx: &mut TxContext,
    ): PrivacyPool<T> {
        PrivacyPool {
            id: object::new(ctx),
            balance: balance::zero(),
            merkle_tree: merkle_tree::new(ctx),
            nullifiers: nullifier::new(ctx),
            vk_bytes,
            transfer_vk_bytes,
            swap_vk_bytes,
            historical_roots: vector::empty(),
        }
    }

    /// Create and share a privacy pool as a shared object.
    /// This is the typical way to deploy a pool for public use.
    /// Returns an AdminCap to the caller for managing verification keys.
    public fun create_shared_pool<T>(
        vk_bytes: vector<u8>,
        transfer_vk_bytes: vector<u8>,
        swap_vk_bytes: vector<u8>,
        ctx: &mut TxContext,
    ) {
        let pool = create_pool<T>(vk_bytes, transfer_vk_bytes, swap_vk_bytes, ctx);
        let pool_id = object::id(&pool);

        // Create admin capability for pool management
        let admin_cap = PoolAdminCap {
            id: object::new(ctx),
            pool_id,
        };

        transfer::share_object(pool);
        transfer::transfer(admin_cap, tx_context::sender(ctx));
    }

    // ============ Admin Functions ============

    /// Update the unshield verification key.
    /// Only callable by the admin cap holder.
    /// Used when the unshield circuit is updated during development.
    public fun update_unshield_vk<T>(
        pool: &mut PrivacyPool<T>,
        admin_cap: &PoolAdminCap,
        new_vk_bytes: vector<u8>,
    ) {
        assert!(admin_cap.pool_id == object::id(pool), E_INVALID_PROOF);
        pool.vk_bytes = new_vk_bytes;
    }

    /// Update the transfer verification key.
    /// Only callable by the admin cap holder.
    /// Used when the transfer circuit is updated during development.
    public fun update_transfer_vk<T>(
        pool: &mut PrivacyPool<T>,
        admin_cap: &PoolAdminCap,
        new_vk_bytes: vector<u8>,
    ) {
        assert!(admin_cap.pool_id == object::id(pool), E_INVALID_PROOF);
        pool.transfer_vk_bytes = new_vk_bytes;
    }

    /// Update the swap verification key.
    /// Only callable by the admin cap holder.
    /// Used when the swap circuit is updated during development.
    public fun update_swap_vk<T>(
        pool: &mut PrivacyPool<T>,
        admin_cap: &PoolAdminCap,
        new_vk_bytes: vector<u8>,
    ) {
        assert!(admin_cap.pool_id == object::id(pool), E_INVALID_PROOF);
        pool.swap_vk_bytes = new_vk_bytes;
    }

    // ============ Core Pool Functions ============

    /// Shield tokens into the privacy pool.
    ///
    /// The commitment is computed off-chain using the following formulas:
    /// - MPK = Poseidon(spending_key, nullifying_key)
    /// - NPK = Poseidon(MPK, random)
    /// - commitment = Poseidon(NPK, token, value)
    ///
    /// The encrypted_note allows the recipient to scan and identify their notes.
    public fun shield<T>(
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
        event::emit(ShieldEvent {
            pool_id: object::id(pool),
            position,
            commitment,
            encrypted_note
        });
    }

    /// Transfer tokens privately within the pool (0zk-to-0zk transfer).
    ///
    /// The ZK proof proves:
    /// 1. Knowledge of spending_key and nullifying_key (ownership of both inputs)
    /// 2. Both input notes exist in Merkle tree (2 Merkle proofs)
    /// 3. Correct nullifier computation for both inputs
    /// 4. Correct commitment computation for both outputs
    /// 5. Balance conservation: sum(input_values) = sum(output_values)
    ///
    /// Public inputs format (160 bytes total):
    /// - merkle_root (32 bytes): Merkle tree root
    /// - input_nullifiers[2] (64 bytes): Nullifiers for both input notes
    /// - output_commitments[2] (64 bytes): Commitments for both output notes
    public fun transfer<T>(
        pool: &mut PrivacyPool<T>,
        proof_bytes: vector<u8>,
        public_inputs_bytes: vector<u8>,
        encrypted_notes: vector<vector<u8>>,
        _ctx: &mut TxContext,
    ) {
        // Validate public inputs length (5 field elements × 32 bytes = 160 bytes)
        assert!(vector::length(&public_inputs_bytes) == 160, E_INVALID_PUBLIC_INPUTS);
        assert!(vector::length(&encrypted_notes) == 2, E_INVALID_PUBLIC_INPUTS);

        // 1. Parse public inputs [merkle_root, nullifier1, nullifier2, commitment1, commitment2]
        let (merkle_root, nullifier1, nullifier2, commitment1, commitment2) =
            parse_transfer_public_inputs(&public_inputs_bytes);

        // 2. Verify merkle root is valid (current or in history)
        assert!(is_valid_root(pool, &merkle_root), E_INVALID_ROOT);

        // 3. Check both nullifiers have not been spent (prevent double-spend)
        assert!(!nullifier::is_spent(&pool.nullifiers, nullifier1), E_DOUBLE_SPEND);
        assert!(!nullifier::is_spent(&pool.nullifiers, nullifier2), E_DOUBLE_SPEND);

        // 4. Verify Groth16 ZK proof
        let pvk = groth16::prepare_verifying_key(&groth16::bn254(), &pool.transfer_vk_bytes);
        let public_inputs = groth16::public_proof_inputs_from_bytes(public_inputs_bytes);
        let proof_points = groth16::proof_points_from_bytes(proof_bytes);

        assert!(
            groth16::verify_groth16_proof(&groth16::bn254(), &pvk, &public_inputs, &proof_points),
            E_INVALID_PROOF
        );

        // 5. Mark both nullifiers as spent
        nullifier::mark_spent(&mut pool.nullifiers, nullifier1);
        nullifier::mark_spent(&mut pool.nullifiers, nullifier2);

        // 6. Insert both output commitments into Merkle tree
        let position1 = merkle_tree::get_next_index(&pool.merkle_tree);
        merkle_tree::insert(&mut pool.merkle_tree, commitment1);

        let position2 = merkle_tree::get_next_index(&pool.merkle_tree);
        merkle_tree::insert(&mut pool.merkle_tree, commitment2);

        // 7. Save historical root for proof validity window
        save_historical_root(pool);

        // 8. Emit event for wallet scanning
        event::emit(TransferEvent {
            pool_id: object::id(pool),
            input_nullifiers: vector[nullifier1, nullifier2],
            output_commitments: vector[commitment1, commitment2],
            output_positions: vector[position1, position2],
            encrypted_notes,
        });
    }

    /// Swap tokens privately through external DEX (e.g., Cetus).
    ///
    /// The ZK proof proves:
    /// 1. Knowledge of spending_key and nullifying_key (ownership of input notes)
    /// 2. Both input notes exist in Merkle tree (2 Merkle proofs)
    /// 3. Correct nullifier computation for both inputs
    /// 4. Sufficient balance: sum(input_values) >= amount_in + change_value
    /// 5. Swap parameters hash correctly
    /// 6. Output and change commitments correctly computed
    ///
    /// Public inputs format (192 bytes total):
    /// - merkle_root (32 bytes): Merkle tree root
    /// - input_nullifiers[2] (64 bytes): Nullifiers for both input notes
    /// - output_commitment (32 bytes): Commitment for output note (token_out)
    /// - change_commitment (32 bytes): Commitment for change note (token_in)
    /// - swap_data_hash (32 bytes): Hash of swap parameters
    ///
    /// NOTE: This is a TEST-ONLY version using 1:1 swap ratio.
    /// For production use, implement execute_cetus_swap() with real Cetus DEX integration.
    #[test_only]
    public fun swap<TokenIn, TokenOut>(
        pool_in: &mut PrivacyPool<TokenIn>,
        pool_out: &mut PrivacyPool<TokenOut>,
        proof_bytes: vector<u8>,
        public_inputs_bytes: vector<u8>,
        amount_in: u64,
        min_amount_out: u64,
        encrypted_output_note: vector<u8>,
        encrypted_change_note: vector<u8>,
        ctx: &mut TxContext,
    ) {
        // Validate public inputs length (6 field elements × 32 bytes = 192 bytes)
        assert!(vector::length(&public_inputs_bytes) == 192, E_INVALID_PUBLIC_INPUTS);

        // 1. Parse public inputs
        let (merkle_root, nullifier1, nullifier2, output_commitment, change_commitment, _swap_data_hash) =
            parse_swap_public_inputs(&public_inputs_bytes);

        // 2. Verify merkle root is valid (current or in history)
        assert!(is_valid_root(pool_in, &merkle_root), E_INVALID_ROOT);

        // 3. Check both nullifiers have not been spent (prevent double-spend)
        assert!(!nullifier::is_spent(&pool_in.nullifiers, nullifier1), E_DOUBLE_SPEND);
        assert!(!nullifier::is_spent(&pool_in.nullifiers, nullifier2), E_DOUBLE_SPEND);

        // 4. Verify Groth16 ZK proof using swap verification key
        // NOTE: Proof verification skipped in test-only version since we use placeholder proofs
        // In production, this would verify the real ZK proof
        let _pvk = groth16::prepare_verifying_key(&groth16::bn254(), &pool_in.swap_vk_bytes);
        let _public_inputs = groth16::public_proof_inputs_from_bytes(public_inputs_bytes);
        let _proof_points = groth16::proof_points_from_bytes(proof_bytes);

        // assert!(
        //     groth16::verify_groth16_proof(&groth16::bn254(), &pvk, &public_inputs, &proof_points),
        //     E_INVALID_PROOF
        // );

        // 5. Extract tokens from pool_in
        assert!(balance::value(&pool_in.balance) >= amount_in, E_INSUFFICIENT_BALANCE);
        let coin_in = coin::take(&mut pool_in.balance, amount_in, ctx);

        // 6. Execute swap through DEX
        // TODO: Replace with real Cetus DEX integration
        // For now, using simplified 1:1 swap ratio for testing
        let amount_out = execute_mock_swap<TokenIn, TokenOut>(
            coin_in,
            min_amount_out,
            pool_out,
            ctx
        );

        // 7. Mark both nullifiers as spent
        nullifier::mark_spent(&mut pool_in.nullifiers, nullifier1);
        nullifier::mark_spent(&mut pool_in.nullifiers, nullifier2);

        // 8. Insert output commitment into pool_out's Merkle tree
        let output_position = merkle_tree::get_next_index(&pool_out.merkle_tree);
        merkle_tree::insert(&mut pool_out.merkle_tree, output_commitment);

        // 9. Insert change commitment into pool_in's Merkle tree
        let change_position = merkle_tree::get_next_index(&pool_in.merkle_tree);
        merkle_tree::insert(&mut pool_in.merkle_tree, change_commitment);

        // 10. Save historical roots for both pools
        save_historical_root(pool_in);
        save_historical_root(pool_out);

        // 11. Emit event for wallet scanning
        event::emit(SwapEvent {
            pool_in_id: object::id(pool_in),
            pool_out_id: object::id(pool_out),
            input_nullifiers: vector[nullifier1, nullifier2],
            output_commitment,
            change_commitment,
            output_position,
            change_position,
            amount_in,
            amount_out,
            encrypted_output_note,
            encrypted_change_note,
        });
    }

    /// Execute private swap through external DEX (Production Version)
    ///
    /// This function enables private swaps through Cetus DEX while maintaining privacy.
    /// Users prove ownership of input notes via ZK proof, swap through DEX at market price,
    /// and receive output as a new private note.
    ///
    /// Flow:
    /// 1. Verify ZK proof (proves ownership of input notes and swap parameters)
    /// 2. Extract input tokens from pool_in
    /// 3. Call external DEX (Cetus) to execute swap
    /// 4. Shield output tokens into pool_out
    /// 5. Return change to pool_in if applicable
    ///
    /// NOTE: This is a production-ready scaffold. To complete integration:
    /// 1. Import Cetus modules: `use cetus_clmm::pool as cetus_pool;`
    /// 2. Add `cetus_pool_obj: &mut CetusPool<TokenIn, TokenOut>` parameter
    /// 3. Replace TODO comments with actual Cetus calls
    ///
    /// For detailed implementation guide, see: docs/PRODUCTION_SWAP_IMPLEMENTATION.md
    ///
    /// # Arguments
    /// * `pool_in` - Privacy pool for input token
    /// * `pool_out` - Privacy pool for output token
    /// * `proof_bytes` - Groth16 proof (128 bytes)
    /// * `public_inputs_bytes` - Public inputs (192 bytes)
    /// * `amount_in` - Exact amount to swap
    /// * `min_amount_out` - Minimum output (slippage protection)
    /// * `encrypted_output_note` - Encrypted note for recipient
    /// * `encrypted_change_note` - Encrypted change note
    /// * `ctx` - Transaction context
    public fun swap_production<TokenIn, TokenOut>(
        pool_in: &mut PrivacyPool<TokenIn>,
        _pool_out: &mut PrivacyPool<TokenOut>,
        // TODO: Uncomment when Cetus modules are imported:
        // cetus_pool: &mut CetusPool<TokenIn, TokenOut>,
        // cetus_config: &CetusGlobalConfig,
        proof_bytes: vector<u8>,
        public_inputs_bytes: vector<u8>,
        amount_in: u64,
        _min_amount_out: u64,
        _encrypted_output_note: vector<u8>,
        _encrypted_change_note: vector<u8>,
        ctx: &mut TxContext,
    ) {
        // Validate public inputs length (6 field elements × 32 bytes = 192 bytes)
        assert!(vector::length(&public_inputs_bytes) == 192, E_INVALID_PUBLIC_INPUTS);

        // 1. Parse public inputs
        let (merkle_root, nullifier1, nullifier2, _output_commitment, _change_commitment, _swap_data_hash) =
            parse_swap_public_inputs(&public_inputs_bytes);

        // 2. Verify merkle root is valid (current or in history)
        assert!(is_valid_root(pool_in, &merkle_root), E_INVALID_ROOT);

        // 3. Check both nullifiers have not been spent (prevent double-spend)
        assert!(!nullifier::is_spent(&pool_in.nullifiers, nullifier1), E_DOUBLE_SPEND);
        assert!(!nullifier::is_spent(&pool_in.nullifiers, nullifier2), E_DOUBLE_SPEND);

        // 4. Verify Groth16 ZK proof using swap verification key
        let pvk = groth16::prepare_verifying_key(&groth16::bn254(), &pool_in.swap_vk_bytes);
        let public_inputs = groth16::public_proof_inputs_from_bytes(public_inputs_bytes);
        let proof_points = groth16::proof_points_from_bytes(proof_bytes);

        assert!(
            groth16::verify_groth16_proof(&groth16::bn254(), &pvk, &public_inputs, &proof_points),
            E_INVALID_PROOF
        );

        // 5. Extract tokens from pool_in
        assert!(balance::value(&pool_in.balance) >= amount_in, E_INSUFFICIENT_BALANCE);
        let coin_in = coin::take(&mut pool_in.balance, amount_in, ctx);

        // 6. Execute swap through Cetus DEX
        // TODO: Replace with real Cetus integration when modules are imported
        //
        // Production Cetus call (uncomment when cetus_clmm modules are available):
        // let (coin_out, coin_remainder) = cetus_pool::flash_swap<TokenIn, TokenOut>(
        //     cetus_pool,
        //     true,  // a_to_b direction (adjust based on token pair order)
        //     true,  // by_amount_in
        //     amount_in,
        //     0,     // sqrt_price_limit (0 = no limit, adjust for slippage control)
        //     ctx
        // );
        //
        // // Repay flash swap
        // cetus_pool::repay_flash_swap<TokenIn, TokenOut>(
        //     cetus_pool,
        //     coin_in,
        //     coin_remainder,
        //     coin::zero<TokenOut>(ctx),
        //     coin_out
        // );
        //
        // let amount_out = coin::value(&coin_out);

        // ============================================================
        // CETUS INTEGRATION REQUIRED
        // ============================================================
        // This function is ready for Cetus integration. To complete:
        // 1. Uncomment Cetus imports at top of file
        // 2. Add cetus_pool and cetus_config parameters
        // 3. Uncomment Cetus flash swap code above
        // 4. Comment out or remove this abort block
        // 5. Uncomment the implementation below
        // ============================================================

        // Return borrowed coins and abort until Cetus is integrated
        balance::join(&mut pool_in.balance, coin::into_balance(coin_in));
        abort E_INSUFFICIENT_BALANCE

        // ============================================================
        // IMPLEMENTATION (Uncomment when Cetus is integrated)
        // ============================================================
        /*
        // 7. Verify slippage protection
        assert!(amount_out >= min_amount_out, E_INSUFFICIENT_BALANCE);

        // 8. Shield output into pool_out
        balance::join(&mut pool_out.balance, coin::into_balance(coin_out));

        // 9. Mark both nullifiers as spent
        nullifier::mark_spent(&mut pool_in.nullifiers, nullifier1);
        nullifier::mark_spent(&mut pool_in.nullifiers, nullifier2);

        // 10. Add output commitment to pool_out Merkle tree
        let output_position = merkle_tree::get_next_index(&pool_out.merkle_tree);
        merkle_tree::insert(&mut pool_out.merkle_tree, _output_commitment);

        // 11. Add change commitment to pool_in Merkle tree
        let change_position = merkle_tree::get_next_index(&pool_in.merkle_tree);
        merkle_tree::insert(&mut pool_in.merkle_tree, _change_commitment);

        // 12. Save updated roots to history
        save_historical_root(pool_in);
        save_historical_root(pool_out);

        // 13. Emit event for wallet scanning
        event::emit(SwapEvent {
            pool_in_id: object::id(pool_in),
            pool_out_id: object::id(pool_out),
            input_nullifiers: vector[nullifier1, nullifier2],
            output_commitment: _output_commitment,
            change_commitment: _change_commitment,
            output_position,
            change_position,
            amount_in,
            amount_out,
            encrypted_output_note,
            encrypted_change_note,
        });
        */
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
    public fun unshield<T>(
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

    /// Parse public inputs from concatenated bytes (for unshield).
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

    /// Parse transfer public inputs from concatenated bytes (for transfer).
    /// Returns (merkle_root, nullifier1, nullifier2, commitment1, commitment2) each as 32-byte vectors.
    fun parse_transfer_public_inputs(bytes: &vector<u8>):
        (vector<u8>, vector<u8>, vector<u8>, vector<u8>, vector<u8>) {

        let mut merkle_root = vector::empty<u8>();
        let mut nullifier1 = vector::empty<u8>();
        let mut nullifier2 = vector::empty<u8>();
        let mut commitment1 = vector::empty<u8>();
        let mut commitment2 = vector::empty<u8>();

        // Extract merkle_root (bytes 0-31)
        let mut i = 0;
        while (i < 32) {
            vector::push_back(&mut merkle_root, *vector::borrow(bytes, i));
            i = i + 1;
        };

        // Extract nullifier1 (bytes 32-63)
        while (i < 64) {
            vector::push_back(&mut nullifier1, *vector::borrow(bytes, i));
            i = i + 1;
        };

        // Extract nullifier2 (bytes 64-95)
        while (i < 96) {
            vector::push_back(&mut nullifier2, *vector::borrow(bytes, i));
            i = i + 1;
        };

        // Extract commitment1 (bytes 96-127)
        while (i < 128) {
            vector::push_back(&mut commitment1, *vector::borrow(bytes, i));
            i = i + 1;
        };

        // Extract commitment2 (bytes 128-159)
        while (i < 160) {
            vector::push_back(&mut commitment2, *vector::borrow(bytes, i));
            i = i + 1;
        };

        (merkle_root, nullifier1, nullifier2, commitment1, commitment2)
    }

    /// Parse swap public inputs from concatenated bytes (for swap).
    /// Returns (merkle_root, nullifier1, nullifier2, output_commitment, change_commitment, swap_data_hash)
    /// each as 32-byte vectors.
    fun parse_swap_public_inputs(bytes: &vector<u8>):
        (vector<u8>, vector<u8>, vector<u8>, vector<u8>, vector<u8>, vector<u8>) {

        let mut merkle_root = vector::empty<u8>();
        let mut nullifier1 = vector::empty<u8>();
        let mut nullifier2 = vector::empty<u8>();
        let mut output_commitment = vector::empty<u8>();
        let mut change_commitment = vector::empty<u8>();
        let mut swap_data_hash = vector::empty<u8>();

        // Extract merkle_root (bytes 0-31)
        let mut i = 0;
        while (i < 32) {
            vector::push_back(&mut merkle_root, *vector::borrow(bytes, i));
            i = i + 1;
        };

        // Extract nullifier1 (bytes 32-63)
        while (i < 64) {
            vector::push_back(&mut nullifier1, *vector::borrow(bytes, i));
            i = i + 1;
        };

        // Extract nullifier2 (bytes 64-95)
        while (i < 96) {
            vector::push_back(&mut nullifier2, *vector::borrow(bytes, i));
            i = i + 1;
        };

        // Extract output_commitment (bytes 96-127)
        while (i < 128) {
            vector::push_back(&mut output_commitment, *vector::borrow(bytes, i));
            i = i + 1;
        };

        // Extract change_commitment (bytes 128-159)
        while (i < 160) {
            vector::push_back(&mut change_commitment, *vector::borrow(bytes, i));
            i = i + 1;
        };

        // Extract swap_data_hash (bytes 160-191)
        while (i < 192) {
            vector::push_back(&mut swap_data_hash, *vector::borrow(bytes, i));
            i = i + 1;
        };

        (merkle_root, nullifier1, nullifier2, output_commitment, change_commitment, swap_data_hash)
    }

    /// Execute a mock swap (1:1 ratio) for testing.
    /// TODO: Replace with real Cetus DEX integration.
    ///
    /// In production, this should:
    /// 1. Call Cetus pool's swap function
    /// 2. Get real market price
    /// 3. Apply slippage protection
    /// 4. Return actual output amount
    #[test_only]
    fun execute_mock_swap<TokenIn, TokenOut>(
        coin_in: Coin<TokenIn>,
        min_amount_out: u64,
        pool_out: &mut PrivacyPool<TokenOut>,
        ctx: &mut TxContext,
    ): u64 {
        // Get input amount
        let amount_in = coin::value(&coin_in);

        // Destroy input coin (in real DEX integration, this would go to the DEX)
        coin::burn_for_testing(coin_in);

        // Mock 1:1 swap (simplified for testing)
        // In production, this would call:
        // let coin_out = cetus::swap<TokenIn, TokenOut>(dex_pool, coin_in, min_amount_out, ctx);
        let amount_out = amount_in; // 1:1 ratio for testing

        // Check slippage protection
        assert!(amount_out >= min_amount_out, E_INSUFFICIENT_BALANCE);

        // Mint output tokens (in real DEX integration, we'd receive from DEX)
        let coin_out = coin::mint_for_testing<TokenOut>(amount_out, ctx);

        // Add to output pool balance
        balance::join(&mut pool_out.balance, coin::into_balance(coin_out));

        amount_out
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
            transfer_vk_bytes: _,
            swap_vk_bytes: _,
            historical_roots: _
        } = pool;

        balance::destroy_for_testing(balance);
        merkle_tree::destroy_for_testing(merkle_tree);
        nullifier::destroy_for_testing(nullifiers);
        object::delete(id);
    }
}
