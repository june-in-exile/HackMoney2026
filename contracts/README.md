# Octopus Privacy Pool Contracts

Move contracts for the Octopus privacy protocol on Sui blockchain.

## Table of Contents

- [Contract Architecture](#contract-architecture)
- [Deployment Workflow](#deployment-workflow)
- [Updating Verification Keys](#updating-verification-keys)
- [Scripts Reference](#scripts-reference)

## Contract Architecture

### Core Modules

- **`pool`** - Main privacy pool with shield/unshield/transfer/swap operations
- **`merkle_tree`** - Incremental Merkle tree (depth 16) with Poseidon hashing
- **`nullifier`** - Nullifier registry to prevent double-spending
- **`note`** - Note structure and encryption utilities

### Admin Capability

The pool includes an admin capability system (`PoolAdminCap`) that allows updating verification keys when circuits are modified during development.

**Admin Functions:**

- `update_unshield_vk()` - Update unshield circuit verification key
- `update_transfer_vk()` - Update transfer circuit verification key
- `update_swap_vk()` - Update swap circuit verification key

## Deployment Workflow

### Initial Deployment

```bash
# 1. Compile circuits and generate verification keys
cd circuits
./compile_unshield.sh
./compile_transfer.sh
./compile_swap.sh

# 2. Update .env with VK hex strings
cd ../contracts
# Copy VK values from circuits/build/*_vk_bytes.hex to .env
# UNSHIELD_VK=<hex from circuits/build/unshield_vk_bytes.hex>
# TRANSFER_VK=<hex from circuits/build/transfer_vk_bytes.hex>
# SWAP_VK=<hex from circuits/build/swap_vk_bytes.hex>

# 3. Deploy package to testnet
./scripts/deploy_package.sh

# 4. Update .env with PACKAGE_ID from deploy output
# PACKAGE_ID=<package_id from deploy output>

# 5. Create privacy pool
./scripts/create_pool.sh

# 6. Update .env and frontend with POOL_ID
# POOL_ID=<pool_id from create_pool output>
```

### When to Use Each Script

#### `deploy_package.sh`

**Use when:**

- Initial deployment
- Contract code changes (Move source files modified)
- Adding new functions or changing contract logic

**What it does:**

1. Builds Move package (`sui move build`)
2. Publishes package to testnet (`sui client publish`)
3. Returns `PACKAGE_ID`

**Note:** Publishing creates a new immutable package. To upgrade an existing package, use `sui client upgrade` instead.

#### `create_pool.sh`

**Use when:**

- After deploying a new package
- Creating a new pool instance (different token type or fresh state)

**What it does:**

1. Calls `pool::create_shared_pool()` with verification keys from .env
2. Creates shared `PrivacyPool<T>` object
3. Transfers `PoolAdminCap` to caller
4. Returns `POOL_ID` and `ADMIN_CAP_ID`

**Note:** Each pool instance has its own Merkle tree and nullifier registry. Multiple pools can share the same package.

## Updating Verification Keys

When you modify a circuit (e.g., fixing bugs or adding features), you need to update the verification key in the deployed pool.

### Step-by-Step Process

#### 1. Modify and Recompile Circuit

```bash
cd circuits

# Edit the circuit file (e.g., transfer.circom)
# Make your changes...

# Recompile the circuit
./compile_transfer.sh

# This generates new files in build/:
# - transfer_js/transfer.wasm (circuit logic)
# - transfer_final.zkey (proving key)
# - transfer_vk_bytes.hex (verification key hex)
# - transfer_vk.json (verification key JSON)
```

#### 2. Check if VK Changed

```bash
# Compare new VK with old VK in .env
NEW_VK=$(cat build/transfer_vk_bytes.hex | tr -d '\n')
OLD_VK=$(grep TRANSFER_VK ../.env | cut -d= -f2 | tr -d '\n')

if [ "$NEW_VK" = "$OLD_VK" ]; then
    echo "✓ VK unchanged - no contract update needed"
    echo "Just update frontend circuit files (WASM, zkey)"
else
    echo "✗ VK changed - contract update required"
fi
```

#### 3a. If VK is Unchanged (Common Case)

If the VK is identical, you only need to update the frontend circuit files:

```bash
# Copy updated circuit files to frontend
cp circuits/build/transfer_js/transfer.wasm ../frontend/public/circuits/transfer_js/
cp circuits/build/transfer_final.zkey ../frontend/public/circuits/
cp circuits/build/transfer_vk.json ../frontend/public/circuits/

# No contract update needed!
```

**Why does this happen?**

- Minor circuit changes (adding conditional logic, optimizations) often don't change the VK structure
- The VK depends on the circuit's constraint system, not the specific constraints

#### 3b. If VK Changed (Rare)

If the VK is different, use the appropriate update script:

```bash
cd contracts

# For transfer circuit
./scripts/update_transfer_vk.sh

# For unshield circuit
./scripts/update_unshield_vk.sh

# For swap circuit
./scripts/update_swap_vk.sh
```

**What the script does:**

1. Loads environment variables from `.env`
2. Reads new VK from circuit build output
3. Compares with old VK to check if update is needed
4. Finds your `PoolAdminCap` object ID automatically
5. Calls the appropriate update function on-chain
6. Provides next steps for updating frontend files

**Script features:**

- ✅ Automatic VK comparison (skips update if unchanged)
- ✅ Auto-discovery of AdminCap object ID
- ✅ Clear error messages and troubleshooting
- ✅ Validation of all prerequisites

#### 4. Update Frontend

```bash
# Update circuit files
cp circuits/build/transfer_js/transfer.wasm frontend/public/circuits/transfer_js/
cp circuits/build/transfer_final.zkey frontend/public/circuits/
cp circuits/build/transfer_vk.json frontend/public/circuits/

# Update .env if VK changed
# TRANSFER_VK=<new VK hex>
```

### Update Functions Reference

All update functions require the `PoolAdminCap` object that was created with the pool.

```move
// Update unshield VK
public fun update_unshield_vk<T>(
    pool: &mut PrivacyPool<T>,
    admin_cap: &PoolAdminCap,
    new_vk_bytes: vector<u8>,
)

// Update transfer VK
public fun update_transfer_vk<T>(
    pool: &mut PrivacyPool<T>,
    admin_cap: &PoolAdminCap,
    new_vk_bytes: vector<u8>,
)

// Update swap VK
public fun update_swap_vk<T>(
    pool: &mut PrivacyPool<T>,
    admin_cap: &PoolAdminCap,
    new_vk_bytes: vector<u8>,
)
```

### Finding Your AdminCap

```bash
# List all objects you own
sui client objects

# Find AdminCap object ID
sui client objects --json | jq -r '.[] | select(.data.type | contains("PoolAdminCap")) | .data.objectId'

# View AdminCap details
sui client object <ADMIN_CAP_ID>
```

### Quick Update Examples

```bash
# Example 1: Update transfer VK after circuit modification
cd circuits
./compile_transfer.sh
cd ../contracts
./scripts/update_transfer_vk.sh

# Example 2: Update all VKs after major circuit refactor
cd circuits
./compile_unshield.sh
./compile_transfer.sh
./compile_swap.sh
cd ../contracts
./scripts/update_unshield_vk.sh
./scripts/update_transfer_vk.sh
./scripts/update_swap_vk.sh

# Example 3: Update VK and frontend in one go
cd contracts
./scripts/update_transfer_vk.sh && \
cp ../circuits/build/transfer_js/transfer.wasm ../frontend/public/circuits/transfer_js/ && \
cp ../circuits/build/transfer_final.zkey ../frontend/public/circuits/ && \
cp ../circuits/build/transfer_vk.json ../frontend/public/circuits/
```

## Scripts Reference

All scripts are located in the `scripts/` directory.

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `scripts/deploy_package.sh` | Publish Move package | Initial deploy, contract changes |
| `scripts/create_pool.sh` | Create privacy pool | After package deploy, new pool instance |
| `scripts/update_unshield_vk.sh` | Update unshield VK | After modifying unshield circuit |
| `scripts/update_transfer_vk.sh` | Update transfer VK | After modifying transfer circuit |
| `scripts/update_swap_vk.sh` | Update swap VK | After modifying swap circuit |

## Testing

```bash
# Build contracts
sui move build

# Run tests
sui move test

# Run specific test
sui move test -f test_shield_and_unshield
```
