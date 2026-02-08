#!/bin/bash

# Deploy USDC Privacy Pool Script
# Usage: ./scripts/deploy_usdc_pool.sh [--network testnet|mainnet]

set -e  # Exit on error

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

NETWORK_UPPER=$(echo "$NETWORK" | tr '[:lower:]' '[:upper:]')

echo "Deploying USDC Privacy Pool..."
echo "Network: $NETWORK"
echo ""

# Load environment variables
source .env

PACKAGE_ID_VAR="NEXT_PUBLIC_${NETWORK_UPPER}_PACKAGE_ID"
PACKAGE_ID="${!PACKAGE_ID_VAR}"

# Check required variables
if [ -z "$PACKAGE_ID" ]; then
    echo "Error: ${PACKAGE_ID_VAR} not set in .env"
    exit 1
fi

# USDC Token Type
if [ "$NETWORK" = "mainnet" ]; then
    USDC_TYPE="0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC"
else
    USDC_TYPE="0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC"
fi

echo "Package ID: $PACKAGE_ID"
echo "USDC Type: $USDC_TYPE"
echo ""

# Get verification key object IDs
echo "Finding verification key objects..."
OBJECTS=$(sui client objects --json)

# Parse VK object IDs (you may need to adjust these based on your deployment)
echo "Note: You need to provide the VK object IDs"
echo "   Run: sui client objects"
echo "   Find the three VKBytes objects and use their IDs"
echo ""

read -p "Enter Unshield VK Object ID: " UNSHIELD_VK_ID
read -p "Enter Transfer VK Object ID: " TRANSFER_VK_ID
read -p "Enter Swap VK Object ID: " SWAP_VK_ID

echo ""
echo "Creating USDC Privacy Pool..."
echo ""

# Deploy USDC pool
sui client call \
  --package "$PACKAGE_ID" \
  --module pool \
  --function create_shared_pool \
  --type-args "$USDC_TYPE" \
  --args "$UNSHIELD_VK_ID" "$TRANSFER_VK_ID" "$SWAP_VK_ID" \
  --gas-budget 100000000 \
  --json > usdc_pool_deployment.json

# Parse the result
USDC_POOL_ID=$(cat usdc_pool_deployment.json | jq -r '.objectChanges[] | select(.objectType | contains("PrivacyPool")) | .objectId')

if [ -z "$USDC_POOL_ID" ]; then
    echo "Failed to deploy USDC pool"
    echo "Check usdc_pool_deployment.json for details"
    exit 1
fi

echo ""
echo "USDC Privacy Pool deployed successfully!"
echo ""
echo "Pool Details:"
echo "   Pool ID: $USDC_POOL_ID"
echo "   Token Type: $USDC_TYPE"
echo ""
echo "Next Steps:"
echo "1. Add to .env:"
echo "   NEXT_PUBLIC_${NETWORK_UPPER}_USDC_POOL_ID=$USDC_POOL_ID"
echo ""
echo "2. Verify the pool:"
echo "   sui client object $USDC_POOL_ID"
echo ""
echo "3. Restart your frontend:"
echo "   cd frontend && npm run dev"
echo ""

# Save to .env if it exists
if [ -f ".env" ]; then
    ENV_KEY="NEXT_PUBLIC_${NETWORK_UPPER}_USDC_POOL_ID"
    if grep -q "^${ENV_KEY}=" ".env"; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|^${ENV_KEY}=.*|${ENV_KEY}=${USDC_POOL_ID}|" ".env"
        else
            sed -i "s|^${ENV_KEY}=.*|${ENV_KEY}=${USDC_POOL_ID}|" ".env"
        fi
    else
        echo "${ENV_KEY}=${USDC_POOL_ID}" >> .env
    fi
    echo "Added ${ENV_KEY} to .env"
fi

# Clean up
rm usdc_pool_deployment.json

echo "Done!"
