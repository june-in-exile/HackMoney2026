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
cd circuits/scripts
./compile.sh

# 2. Update .env with VK hex strings
cd ../../contracts/scripts
# Copy VK values from circuits/build/*_vk_bytes.hex to .env
# UNSHIELD_VK=<hex from circuits/build/unshield_vk_bytes.hex>
# TRANSFER_VK=<hex from circuits/build/transfer_vk_bytes.hex>
# SWAP_VK=<hex from circuits/build/swap_vk_bytes.hex>

# 3. Deploy package to testnet
./deploy_package.sh

# 4. Update .env with PACKAGE_ID from deploy output
# PACKAGE_ID=<package_id from deploy output>

# 5. Create privacy pools (SUI + USDC by default)
./create_pool.sh

# 6. Update .env and frontend with SUI_POOL_ID and USDC_POOL_ID
# SUI_POOL_ID=<auto-updated by create_pool.sh>
# USDC_POOL_ID=<auto-updated by create_pool.sh>
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
- Creating pool instances for SUI and/or USDC tokens

**Usage:**

```bash
./create_pool.sh        # Create both SUI and USDC pools (default)
./create_pool.sh sui    # Create only SUI pool
./create_pool.sh usdc   # Create only USDC pool
```

**What it does:**

1. Calls `pool::create_shared_pool<T>()` with verification keys from .env
2. Creates shared `PrivacyPool<T>` object(s)
3. Transfers `PoolAdminCap` to caller
4. Updates `SUI_POOL_ID` / `USDC_POOL_ID` in `.env` automatically

**Note:** Each pool instance has its own Merkle tree and nullifier registry. USDC pool enables private swaps via DeepBook.

> ⚠️ **DeepBook V3 is only available on Mainnet.** Swap functionality requires a Mainnet deployment.

## Updating Verification Keys

When you modify a circuit (e.g., fixing bugs or adding features), you need to update the verification key in the deployed pool.

```bash
cd circuits

# Edit the circuit file (e.g., transfer.circom)
# Make your changes...

# Recompile the circuit
./compile.sh transfer

# This generates new files in build/:
# - transfer_js/transfer.wasm (circuit logic)
# - transfer_final.zkey (proving key)
# - transfer_vk_bytes.hex (verification key hex)
# - transfer_vk.json (verification key JSON)

# And copied artifacts to frontend
# cp circuits/build/transfer_js/transfer.wasm ../frontend/public/circuits/transfer_js/
# cp circuits/build/transfer_final.zkey ../frontend/public/circuits/
# cp circuits/build/transfer_vk.json ../frontend/public/circuits/

cd ../contracts/scripts

# Update transfer VK for both pools (default)
./update_vk.sh transfer

# Update for specific pool only
./update_vk.sh transfer sui
./update_vk.sh transfer usdc
```

### Update Script Usage

`update_vk.sh` accepts an optional VK type and pool type:

```bash
./update_vk.sh                    # all VKs, both pools (default)
./update_vk.sh unshield           # unshield VK, both pools
./update_vk.sh transfer sui       # transfer VK, SUI pool only
./update_vk.sh swap usdc          # swap VK, USDC pool only
```

**What the script does:**

1. Loads environment variables from `.env`
2. Reads new VK from circuit build output
3. Compares with old VK to check if update is needed
4. Finds your `PoolAdminCap` object ID automatically
5. Calls the appropriate update function on-chain
6. Updates the VK in `.env`

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
cd circuits && ./scripts/compile.sh transfer
cd ../contracts/scripts && ./update_vk.sh transfer

# Example 2: Update all VKs after major circuit refactor
cd circuits && ./scripts/compile.sh
cd ../contracts/scripts && ./update_vk.sh
```

## Scripts Reference

All scripts are located in the `scripts/` directory.

| Script | Purpose | Usage | When to Use |
|--------|---------|-------|-------------|
| `deploy_package.sh` | Publish Move package | `./deploy_package.sh` | Initial deploy, contract changes |
| `create_pool.sh` | Create privacy pool(s) | `./create_pool.sh [sui\|usdc]` | After package deploy (defaults to both) |
| `update_vk.sh` | Update verification key(s) | `./update_vk.sh [vk] [pool]` | After modifying any circuit |

**`update_vk.sh` arguments:** `vk` = `unshield` \| `transfer` \| `swap` \| `all` (default), `pool` = `sui` \| `usdc` \| `both` (default).

## Testing

```bash
# Build contracts
sui move build

# Run tests
sui move test

# Run specific test
sui move test -f test_shield_and_unshield
```
