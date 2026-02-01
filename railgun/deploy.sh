#!/bin/bash
set -e

echo "=== Deploying Railgun Privacy Pool with Transfer Support ==="

# Verification keys (hex format)
UNSHIELD_VK="e2f26dbea299f5223b646cb1fb33eadb059d9407559d7441dfd902e3a79a4d2dabb73dc17fbc13021e2471e0c08bd67d8401f52b73d6d07483794cad4778180e0c06f33bbc4c79a9cadef253a68084d382f17788f885c9afd176f7cb2f036789edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e1953e4f1664311bdc62b4509eb4e8e07f6008ce903d3497f7b0e95cb082a4dec11d9b87aa74e30aa03656c88b0ba942e1f6c3e50fb4c0234deceb0ca4786bad69d0400000000000000191f71d49c7ecfcc3643957f0d503d24e713cf91937a8a33b7c118a6afef44891ef0fa65bcfbe5a8f6a5a1bb098b6e508467a66a10af02338ce1560ff9609f1588d71006852b8f431fd5d3de34357325e41f3252748926d16c27ed7cb789478068d1e927470885642b8adcd4b38f20583984d85f9274e93b39f834daacf80b0b"

TRANSFER_VK="e2f26dbea299f5223b646cb1fb33eadb059d9407559d7441dfd902e3a79a4d2dabb73dc17fbc13021e2471e0c08bd67d8401f52b73d6d07483794cad4778180e0c06f33bbc4c79a9cadef253a68084d382f17788f885c9afd176f7cb2f036789edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e19254488230865cdf0004e3394def78922eaffdd386a42de824557a48dbb155525804e55638b8da97b3961d7464a01f77b512216180796380738e1e1a80941d2230600000000000000fb53f6f8431ad415cbb03d866aff5e579f8ec309ccce75d267f81b60f4aa55a3d1a19815b7c4874a2313234c35dfa6267653b8e0f0df8b4b86678e83be0add1f6914f81400f705003436d9914d0cacb6c1f3b6c9355c19c61a0cc3cb1fe84e8b3a98028f73e490a3e9ccb5d2608e50b07e381989c9d42d1d7fad976139f62f0b38f9d4d37a4203b2487f93f7f5e85805ad8abfb5c88c5fe8f18ed04782045014a8cb7c8b7b4feb961d5813058c826f7babd8c080f8ae9de51f2af782a46c2c1d"

echo ""
echo "Step 1: Building Move package..."
sui move build

echo ""
echo "Step 2: Publishing package to testnet..."
echo "Gas budget: 500000000 MIST (0.5 SUI)"

PUBLISH_OUTPUT=$(sui client publish --gas-budget 500000000 --json)

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
echo "Step 3: Creating shared privacy pool for SUI..."

# Call create_shared_pool<SUI>
POOL_OUTPUT=$(sui client call \
    --package "$PACKAGE_ID" \
    --module pool \
    --function create_shared_pool \
    --type-args "0x2::sui::SUI" \
    --args "[$UNSHIELD_VK]" "[$TRANSFER_VK]" \
    --gas-budget 100000000 \
    --json)

# Extract pool object ID
POOL_ID=$(echo "$POOL_OUTPUT" | jq -r '.objectChanges[] | select(.objectType | contains("PrivacyPool")) | .objectId')

if [ -z "$POOL_ID" ]; then
    echo "Error: Failed to extract pool ID from pool creation output"
    echo "$POOL_OUTPUT"
    exit 1
fi

echo "✅ Privacy pool created successfully!"
echo "Pool ID: $POOL_ID"

echo ""
echo "=== Deployment Summary ==="
echo "Package ID: $PACKAGE_ID"
echo "Pool ID: $POOL_ID"
echo "Network: testnet"
echo "Unshield VK: ${#UNSHIELD_VK} bytes (360 bytes)"
echo "Transfer VK: ${#TRANSFER_VK} bytes (424 bytes)"

echo ""
echo "=== Next Steps ==="
echo "1. Update web/src/lib/constants.ts:"
echo "   export const PACKAGE_ID = \"$PACKAGE_ID\";"
echo "   export const POOL_ID = \"$POOL_ID\";"
echo ""
echo "2. Update CLAUDE.md with new deployment info"
echo ""
echo "3. Verify deployment on Sui explorer:"
echo "   https://suiscan.xyz/testnet/object/$PACKAGE_ID"
echo "   https://suiscan.xyz/testnet/object/$POOL_ID"
