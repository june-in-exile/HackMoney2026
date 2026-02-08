#!/bin/bash
set -e

# Parse arguments
NETWORK="testnet"
while [[ $# -gt 0 ]]; do
    case $1 in
        --network)
            NETWORK="$2"
            shift 2
            ;;
        *)
            echo "Usage: $0 [--network testnet|mainnet]"
            exit 1
            ;;
    esac
done

if [ "$NETWORK" != "testnet" ] && [ "$NETWORK" != "mainnet" ]; then
    echo "Error: --network must be 'testnet' or 'mainnet'"
    exit 1
fi

echo "=== Deploying Octopus Privacy Pool Package ==="
echo "Network: $NETWORK"

# Change to contracts directory (parent of scripts/)
cd "$(dirname "$0")/.."

# Determine .env file path
ENV_FILE=""
if [ -f "../.env" ]; then
    ENV_FILE="../.env"
elif [ -f "../../.env" ]; then
    ENV_FILE="../../.env"
else
    echo "Warning: No .env file found. You'll need to manually update NEXT_PUBLIC_PACKAGE_ID later."
fi

if [ -n "$ENV_FILE" ]; then
    echo "Using .env file: $ENV_FILE"
fi

echo ""
echo "Step 1: Switching to $NETWORK..."
sui client switch --env "$NETWORK"

echo ""
echo "Step 2: Building Move package..."
sui move build

echo ""
echo "Step 3: Publishing package to $NETWORK..."

# Remove old Published.toml if exists
rm -f Published.toml

RAW_OUTPUT=$(sui client publish --gas-budget 500000000 --json)
PUBLISH_OUTPUT=$(echo "$RAW_OUTPUT" | sed -n '/{/,$p')

# Extract package ID from publish output
NEXT_PUBLIC_PACKAGE_ID=$(echo "$PUBLISH_OUTPUT" | jq -r '.objectChanges[] | select(.type == "published") | .packageId')

if [ -z "$NEXT_PUBLIC_PACKAGE_ID" ]; then
    echo "Error: Failed to extract package ID from publish output"
    echo "$PUBLISH_OUTPUT"
    exit 1
fi

echo "✅ Package published successfully!"
echo "Package ID: $NEXT_PUBLIC_PACKAGE_ID"
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

    update_env_var "NEXT_PUBLIC_PACKAGE_ID" "$NEXT_PUBLIC_PACKAGE_ID" "$ENV_FILE"

    echo "✓ Updated NEXT_PUBLIC_PACKAGE_ID in $ENV_FILE"
    echo ""
fi

echo "=== Deployment Complete ==="
echo "Package ID: $NEXT_PUBLIC_PACKAGE_ID"
echo "Network: $NETWORK"
echo ""
echo "=== Next Steps ==="
echo "1. Create privacy pools by running:"
echo "   ./create_pool.sh --network $NETWORK"