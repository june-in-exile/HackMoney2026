#!/bin/bash

# Deploy USDC Privacy Pool Script
# Usage: ./scripts/deploy_usdc_pool.sh

set -e  # Exit on error

echo "🚀 Deploying USDC Privacy Pool..."
echo ""

# Load environment variables
source .env

# Check required variables
if [ -z "$NEXT_PUBLIC_PACKAGE_ID" ]; then
    echo "❌ Error: NEXT_PUBLIC_PACKAGE_ID not set in .env"
    exit 1
fi

# USDC Token Type (Sui Testnet)
USDC_TYPE="0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC"

echo "📦 Package ID: $NEXT_PUBLIC_PACKAGE_ID"
echo "🪙 USDC Type: $USDC_TYPE"
echo ""

# Get verification key object IDs
echo "🔍 Finding verification key objects..."
OBJECTS=$(sui client objects --json)

# Parse VK object IDs (you may need to adjust these based on your deployment)
echo "⚠️  Note: You need to provide the VK object IDs"
echo "   Run: sui client objects"
echo "   Find the three VKBytes objects and use their IDs"
echo ""

read -p "Enter Unshield VK Object ID: " UNSHIELD_VK_ID
read -p "Enter Transfer VK Object ID: " TRANSFER_VK_ID
read -p "Enter Swap VK Object ID: " SWAP_VK_ID

echo ""
echo "🔧 Creating USDC Privacy Pool..."
echo ""

# Deploy USDC pool
sui client call \
  --package "$NEXT_PUBLIC_PACKAGE_ID" \
  --module pool \
  --function create_shared_pool \
  --type-args "$USDC_TYPE" \
  --args "$UNSHIELD_VK_ID" "$TRANSFER_VK_ID" "$SWAP_VK_ID" \
  --gas-budget 100000000 \
  --json > usdc_pool_deployment.json

# Parse the result
NEXT_PUBLIC_USDC_POOL_ID=$(cat usdc_pool_deployment.json | jq -r '.objectChanges[] | select(.objectType | contains("PrivacyPool")) | .objectId')

if [ -z "$NEXT_PUBLIC_USDC_POOL_ID" ]; then
    echo "❌ Failed to deploy USDC pool"
    echo "Check usdc_pool_deployment.json for details"
    exit 1
fi

echo ""
echo "✅ USDC Privacy Pool deployed successfully!"
echo ""
echo "📋 Pool Details:"
echo "   Pool ID: $NEXT_PUBLIC_USDC_POOL_ID"
echo "   Token Type: $USDC_TYPE"
echo ""
echo "📝 Next Steps:"
echo "1. Add to .env:"
echo "   NEXT_PUBLIC_USDC_POOL_ID=$NEXT_PUBLIC_USDC_POOL_ID"
echo ""
echo "2. Verify the pool:"
echo "   sui client object $NEXT_PUBLIC_USDC_POOL_ID"
echo ""
echo "3. Restart your frontend:"
echo "   cd frontend && npm run dev"
echo ""

# Save to .env if it exists
if [ -f ".env" ]; then
    echo "NEXT_PUBLIC_USDC_POOL_ID=$NEXT_PUBLIC_USDC_POOL_ID" >> .env
    echo "✅ Added to .env"
fi

# Clean up
rm usdc_pool_deployment.json

echo "🎉 Done!"
