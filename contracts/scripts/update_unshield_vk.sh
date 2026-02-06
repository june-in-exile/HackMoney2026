#!/bin/bash
set -e

echo "=== Updating Unshield Verification Key ==="

# Determine .env file path
ENV_FILE=""
if [ -f "../../.env" ]; then
    ENV_FILE="../../.env"
elif [ -f "../.env" ]; then
    ENV_FILE="../.env"
else
    echo "Error: No .env file found"
    exit 1
fi

echo "Using .env file: $ENV_FILE"

# Load environment variables from .env file
export $(cat "$ENV_FILE" | grep -v '^#' | xargs)

# Validate required environment variables
if [ -z "$PACKAGE_ID" ]; then
    echo "Error: PACKAGE_ID not set in .env file"
    exit 1
fi

if [ -z "$POOL_ID" ]; then
    echo "Error: POOL_ID not set in .env file"
    exit 1
fi

# Read new VK from circuit build output
NEW_VK=$(cat ../../circuits/build/unshield_vk_bytes.hex | tr -d '\n')

if [ -z "$NEW_VK" ]; then
    echo "Error: Could not read new VK from ../../circuits/build/unshield_vk_bytes.hex"
    echo "Please run circuits/compile_unshield.sh first"
    exit 1
fi

# Check if VK changed
OLD_VK=$(echo "$UNSHIELD_VK" | tr -d '\n')
if [ "$NEW_VK" = "$OLD_VK" ]; then
    echo "✓ VK unchanged - no contract update needed"
    echo "The verification key is identical to the one in .env"
    echo ""
    echo "You only need to update the frontend circuit files:"
    echo "  cp circuits/build/unshield_js/unshield.wasm frontend/public/circuits/unshield_js/"
    echo "  cp circuits/build/unshield_final.zkey frontend/public/circuits/"
    echo "  cp circuits/build/unshield_vk.json frontend/public/circuits/"
    exit 0
fi

echo "✗ VK changed - contract update required"
echo ""

# Find AdminCap object ID that matches both package and pool
echo "Looking for PoolAdminCap..."
ADMIN_CAP_ID=$(sui client objects --json 2>/dev/null | jq -r --arg pkg "$PACKAGE_ID" --arg pool "$POOL_ID" '.[] | select(.data.type == ($pkg + "::pool::PoolAdminCap") and .data.content.fields.pool_id == $pool) | .data.objectId' | head -1)

if [ -z "$ADMIN_CAP_ID" ]; then
    echo "Error: PoolAdminCap not found in your wallet"
    echo ""
    echo "This can happen if:"
    echo "  1. The pool was created before AdminCap feature was added"
    echo "  2. You're using a different wallet address"
    echo ""
    echo "Solution: Deploy a new pool with scripts/create_pool.sh"
    exit 1
fi

echo "Package ID: $PACKAGE_ID"
echo "Pool ID: $POOL_ID"
echo "AdminCap ID: $ADMIN_CAP_ID"
echo "New VK length: ${#NEW_VK} bytes (expected: 720)"
echo ""

# Call update function
echo "Calling update_unshield_vk..."
sui client call \
    --package "$PACKAGE_ID" \
    --module pool \
    --function update_unshield_vk \
    --type-args "0x2::sui::SUI" \
    --args "$POOL_ID" "$ADMIN_CAP_ID" "0x$NEW_VK" \
    --gas-budget 10000000

echo ""
echo "✅ Unshield VK updated successfully!"
echo ""

# Update .env file
echo "Updating .env file with new verification key..."

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

update_env_var "UNSHIELD_VK" "$NEW_VK" "$ENV_FILE"

echo "✓ Updated UNSHIELD_VK in $ENV_FILE"