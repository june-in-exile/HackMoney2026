#!/bin/bash
set -e

echo "=== Updating Swap Verification Key ==="

# Load environment variables from .env file
if [ -f "../../.env" ]; then
    echo "Loading environment variables from .env..."
    export $(cat ../../.env | grep -v '^#' | xargs)
elif [ -f "../.env" ]; then
    echo "Loading environment variables from .env..."
    export $(cat ../.env | grep -v '^#' | xargs)
else
    echo "Error: No .env file found"
    exit 1
fi

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
NEW_VK=$(cat ../../circuits/build/swap_vk_bytes.hex | tr -d '\n')

if [ -z "$NEW_VK" ]; then
    echo "Error: Could not read new VK from ../../circuits/build/swap_vk_bytes.hex"
    echo "Please run circuits/compile_swap.sh first"
    exit 1
fi

# Check if VK changed
OLD_VK=$(echo "$SWAP_VK" | tr -d '\n')
if [ "$NEW_VK" = "$OLD_VK" ]; then
    echo "✓ VK unchanged - no contract update needed"
    echo "The verification key is identical to the one in .env"
    echo ""
    echo "You only need to update the frontend circuit files:"
    echo "  cp circuits/build/swap_js/swap.wasm frontend/public/circuits/swap_js/"
    echo "  cp circuits/build/swap_final.zkey frontend/public/circuits/"
    echo "  cp circuits/build/swap_vk.json frontend/public/circuits/"
    exit 0
fi

echo "✗ VK changed - contract update required"
echo ""

# Find AdminCap object ID
echo "Looking for PoolAdminCap..."
ADMIN_CAP_ID=$(sui client objects --json 2>/dev/null | jq -r '.[] | select(.data.type | contains("PoolAdminCap")) | .data.objectId' | head -1)

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
echo "New VK length: ${#NEW_VK} bytes (expected: 912)"
echo ""

# Call update function
echo "Calling update_swap_vk..."
sui client call \
    --package "$PACKAGE_ID" \
    --module pool \
    --function update_swap_vk \
    --type-args "0x2::sui::SUI" \
    --args "$POOL_ID" "$ADMIN_CAP_ID" "0x$NEW_VK" \
    --gas-budget 10000000

echo ""
echo "✅ Swap VK updated successfully!"
echo ""
echo "Next steps:"
echo "1. Update .env file:"
echo "   SWAP_VK=\"$NEW_VK\""
echo ""
echo "2. Update frontend circuit files:"
echo "   cp circuits/build/swap_js/swap.wasm frontend/public/circuits/swap_js/"
echo "   cp circuits/build/swap_final.zkey frontend/public/circuits/"
echo "   cp circuits/build/swap_vk.json frontend/public/circuits/"
