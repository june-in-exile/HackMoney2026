#!/bin/bash
set -e

cd ..

echo "=== Creating Privacy Pool ==="
echo ""

# Determine .env file path
ENV_FILE=""
if [ -f "../.env" ]; then
    ENV_FILE="../.env"
elif [ -f "../../.env" ]; then
    ENV_FILE="../../.env"
else
    echo "Error: No .env file found"
    echo "Please copy .env.example to .env and configure it."
    exit 1
fi

echo "Using .env file: $ENV_FILE"

# Load environment variables from .env file
export $(cat "$ENV_FILE" | grep -v '^#' | xargs)

# Validate required environment variables
if [ -z "$PACKAGE_ID" ]; then
    echo "Error: PACKAGE_ID not set in .env file"
    echo "Please run scripts/deploy_package.sh first and update .env with the PACKAGE_ID"
    exit 1
fi

echo "Package ID: $PACKAGE_ID"
echo ""

# Read verification keys from circuit build output
echo "Reading verification keys from circuit build output..."

UNSHIELD_VK=$(cat ../circuits/build/unshield_vk_bytes.hex | tr -d '\n')
if [ -z "$UNSHIELD_VK" ]; then
    echo "Error: Could not read unshield VK from ../circuits/build/unshield_vk_bytes.hex"
    echo "Please run circuits/scripts/compile_unshield.sh first"
    exit 1
fi
echo "✓ Unshield VK: ${#UNSHIELD_VK} bytes (expected: 720)"

TRANSFER_VK=$(cat ../circuits/build/transfer_vk_bytes.hex | tr -d '\n')
if [ -z "$TRANSFER_VK" ]; then
    echo "Error: Could not read transfer VK from ../circuits/build/transfer_vk_bytes.hex"
    echo "Please run circuits/scripts/compile_transfer.sh first"
    exit 1
fi
echo "✓ Transfer VK: ${#TRANSFER_VK} bytes (expected: 848)"

SWAP_VK=$(cat ../circuits/build/swap_vk_bytes.hex | tr -d '\n')
if [ -z "$SWAP_VK" ]; then
    echo "Error: Could not read swap VK from ../circuits/build/swap_vk_bytes.hex"
    echo "Please run circuits/scripts/compile_swap.sh first"
    exit 1
fi
echo "✓ Swap VK: ${#SWAP_VK} bytes (expected: 912)"
echo ""

# Create pool
echo "Creating pool with verification keys..."
POOL_OUTPUT=$(sui client call \
    --package "$PACKAGE_ID" \
    --module pool \
    --function create_shared_pool \
    --type-args "0x2::sui::SUI" \
    --args "0x$UNSHIELD_VK" "0x$TRANSFER_VK" "0x$SWAP_VK" \
    --gas-budget 100000000 \
    --json)

# Extract pool object ID
POOL_ID=$(echo "$POOL_OUTPUT" | jq -r '.objectChanges[] | select(.objectType | contains("PrivacyPool")) | .objectId')

if [ -z "$POOL_ID" ]; then
    echo "Error: Failed to extract pool ID from pool creation output"
    echo "$POOL_OUTPUT"
    exit 1
fi

echo "✅ Privacy Pool created successfully!"
echo "Pool ID: $POOL_ID"
echo ""

# Update .env file
echo "Updating .env file with pool ID and verification keys..."

# Function to update or append env variable
update_env_var() {
    local key=$1
    local value=$2
    local file=$3

    if grep -q "^${key}=" "$file"; then
        # Update existing variable (macOS compatible)
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|^${key}=.*|${key}=${value}|" "$file"
        else
            sed -i "s|^${key}=.*|${key}=${value}|" "$file"
        fi
    else
        # Append new variable
        echo "${key}=${value}" >> "$file"
    fi
}

update_env_var "POOL_ID" "$POOL_ID" "$ENV_FILE"
update_env_var "UNSHIELD_VK" "$UNSHIELD_VK" "$ENV_FILE"
update_env_var "TRANSFER_VK" "$TRANSFER_VK" "$ENV_FILE"
update_env_var "SWAP_VK" "$SWAP_VK" "$ENV_FILE"

echo "✓ Updated POOL_ID in $ENV_FILE"
echo "✓ Updated UNSHIELD_VK in $ENV_FILE"
echo "✓ Updated TRANSFER_VK in $ENV_FILE"
echo "✓ Updated SWAP_VK in $ENV_FILE"
echo ""

echo "=== Pool Creation Summary ==="
echo "Package ID: $PACKAGE_ID"
echo "Pool ID: $POOL_ID"
echo "Network: testnet"
echo "Unshield VK: ${#UNSHIELD_VK} bytes"
echo "Transfer VK: ${#TRANSFER_VK} bytes"
echo "Swap VK: ${#SWAP_VK} bytes"
echo ""

echo "=== Next Steps ==="
echo "1. Update frontend/src/lib/constants.ts:"
echo "   export const POOL_ID = \"$POOL_ID\";"
