#!/bin/bash
set -e

# Load environment variables from .env file
if [ -f "../../.env" ]; then
    echo "Loading environment variables from .env..."
    export $(cat ../../.env | grep -v '^#' | xargs)
elif [ -f "../.env" ]; then
    echo "Loading environment variables from .env..."
    export $(cat ../.env | grep -v '^#' | xargs)
else
    echo "Warning: No .env file found. Please copy .env.example to .env and configure it."
    exit 1
fi

# Validate required environment variables
if [ -z "$PACKAGE_ID" ]; then
    echo "Error: PACKAGE_ID not set in .env file"
    echo "Please run scripts/deploy_package.sh first and update .env with the PACKAGE_ID"
    exit 1
fi

if [ -z "$UNSHIELD_VK" ]; then
    echo "Error: UNSHIELD_VK not set in .env file"
    exit 1
fi

if [ -z "$TRANSFER_VK" ]; then
    echo "Error: TRANSFER_VK not set in .env file"
    exit 1
fi

if [ -z "$SWAP_VK" ]; then
    echo "Error: SWAP_VK not set in .env file"
    exit 1
fi

echo "=== Creating Privacy Pool ==="
echo "Package ID: $PACKAGE_ID"

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
echo "=== Pool Creation Summary ==="
echo "Package ID: $PACKAGE_ID"
echo "Pool ID: $POOL_ID"
echo "Network: testnet"
echo "Unshield VK: ${#UNSHIELD_VK} bytes (360 bytes)"
echo "Transfer VK: ${#TRANSFER_VK} bytes (424 bytes)"
echo "Swap VK: ${#SWAP_VK} bytes (456 bytes)"

echo ""
echo "=== Next Steps ==="
echo "1. Update frontend/src/lib/constants.ts:"
echo "   export const PACKAGE_ID = \"$PACKAGE_ID\";"
echo "   export const POOL_ID = \"$POOL_ID\";"
echo ""
echo "2. Verify pool on Sui explorer:"
echo "   https://testnet.suivision.xyz/object/$POOL_ID"
