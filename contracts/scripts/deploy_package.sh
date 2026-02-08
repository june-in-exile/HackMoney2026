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
    NETWORK_UPPER=$(echo "$NETWORK" | tr '[:lower:]' '[:upper:]')
    echo "Warning: No .env file found. You'll need to manually update NEXT_PUBLIC_${NETWORK_UPPER}_PACKAGE_ID later."
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
NEXT_PUBLIC_PACKAGE_ID=$(echo "$PUBLISH_OUTPUT" | jq -r '.objectChanges[]? | select(.type == "published") | .packageId' 2>/dev/null)

# Fallback: read from Published.toml if jq extraction failed
if [ -z "$NEXT_PUBLIC_PACKAGE_ID" ]; then
    NEXT_PUBLIC_PACKAGE_ID=$(awk '/\[published\.'"$NETWORK"'\]/{found=1} found && /published-at =/{match($0, /0x[a-f0-9]+/); print substr($0, RSTART, RLENGTH); exit}' Published.toml)
fi

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

    NETWORK_UPPER=$(echo "$NETWORK" | tr '[:lower:]' '[:upper:]')
    ENV_KEY="NEXT_PUBLIC_${NETWORK_UPPER}_PACKAGE_ID"
    update_env_var "$ENV_KEY" "$NEXT_PUBLIC_PACKAGE_ID" "$ENV_FILE"

    echo "✓ Updated $ENV_KEY in $ENV_FILE"
    echo ""
fi

echo "=== Deployment Complete ==="
echo "Package ID: $NEXT_PUBLIC_PACKAGE_ID"
echo "Network: $NETWORK"
echo ""
echo "=== Next Steps ==="
echo "1. Create privacy pools by running:"
echo "   ./create_pool.sh --network $NETWORK"