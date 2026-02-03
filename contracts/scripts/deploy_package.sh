#!/bin/bash
set -e

echo "=== Deploying Octopus Privacy Pool Package ==="

# Change to contracts directory (parent of scripts/)
cd "$(dirname "$0")/.."

echo ""
echo "Step 1: Building Move package..."
sui move build

echo ""
echo "Step 2: Publishing package to testnet..."

# Remove old Published.toml if exists
rm -f Published.toml

RAW_OUTPUT=$(sui client publish --gas-budget 500000000 --json)
PUBLISH_OUTPUT=$(echo "$RAW_OUTPUT" | sed -n '/{/,$p')

# Extract package ID from publish output
PACKAGE_ID=$(echo "$PUBLISH_OUTPUT" | jq -r '.objectChanges[] | select(.type == "published") | .packageId')

if [ -z "$PACKAGE_ID" ]; then
    echo "Error: Failed to extract package ID from publish output"
    echo "$PUBLISH_OUTPUT"
    exit 1
fi

echo "✅ Package published successfully!"
echo "Package ID: $PACKAGE_ID"

echo ""
echo "=== Deployment Complete ==="
echo "Package ID: $PACKAGE_ID"
echo "Network: testnet"
echo ""
echo "=== Next Steps ==="
echo "1. Update .env file:"
echo "   PACKAGE_ID=\"$PACKAGE_ID\""
echo ""
echo "2. Create a privacy pool by running:"
echo "   ./scripts/create_pool.sh"
echo ""
echo "3. Verify deployment on Sui explorer:"
echo "   https://testnet.suivision.xyz/package/$PACKAGE_ID"
