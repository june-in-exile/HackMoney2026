#!/bin/bash
set -e

echo "=== Deploying Octopus Privacy Pool Package ==="

# Change to contracts directory (parent of scripts/)
cd "$(dirname "$0")/.."

# Determine .env file path
ENV_FILE=""
if [ -f "../.env" ]; then
    ENV_FILE="../.env"
elif [ -f "../../.env" ]; then
    ENV_FILE="../../.env"
else
    echo "Warning: No .env file found. You'll need to manually update PACKAGE_ID later."
fi

if [ -n "$ENV_FILE" ]; then
    echo "Using .env file: $ENV_FILE"
fi

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

# Update .env file if it exists
if [ -n "$ENV_FILE" ]; then
    echo "Updating .env file with package ID..."

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

    update_env_var "PACKAGE_ID" "$PACKAGE_ID" "$ENV_FILE"

    echo "✓ Updated PACKAGE_ID in $ENV_FILE"
    echo ""
fi

echo "=== Deployment Complete ==="
echo "Package ID: $PACKAGE_ID"
echo "Network: testnet"
echo ""
echo "=== Next Steps ==="
echo "1. Update frontend/src/lib/constants.ts:"
echo "   export const PACKAGE_ID = \"$PACKAGE_ID\";"
echo ""
echo "2. Create a privacy pool by running:"
echo "   ./create_pool.sh"