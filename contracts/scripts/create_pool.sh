#!/bin/bash
set -e

cd ..

# Parse arguments
TOKEN_TYPE="both"
NETWORK="testnet"
while [[ $# -gt 0 ]]; do
    case $1 in
        --network)
            NETWORK="$2"
            shift 2
            ;;
        sui|usdc|both)
            TOKEN_TYPE="$1"
            shift
            ;;
        *)
            echo "Usage: $0 [sui|usdc|both] [--network testnet|mainnet]"
            echo "Default: create both SUI and USDC pools on testnet"
            exit 1
            ;;
    esac
done

if [ "$NETWORK" != "testnet" ] && [ "$NETWORK" != "mainnet" ]; then
    echo "Error: --network must be 'testnet' or 'mainnet'"
    exit 1
fi

# Determine .env file path
ENV_FILE=""
if [ -f "../.env" ]; then
    ENV_FILE="../.env"
elif [ -f "../../.env" ]; then
    ENV_FILE="../../.env"
else
    echo "Error: No .env file found"
    echo "Please copy .env.example to .env and configure it."
    exit 1
fi

echo "Using .env file: $ENV_FILE"
echo "Network: $NETWORK"

# Switch to target network
sui client switch --env "$NETWORK"

# Load environment variables from .env file (strip inline comments)
export $(cat "$ENV_FILE" | sed 's/#.*//' | sed '/^$/d' | xargs)

if [ -z "$NEXT_PUBLIC_PACKAGE_ID" ]; then
    echo "Error: NEXT_PUBLIC_PACKAGE_ID not set in .env file"
    echo "Please run scripts/deploy_package.sh first"
    exit 1
fi

echo "Package ID: $NEXT_PUBLIC_PACKAGE_ID"
echo ""

# Read verification keys from circuit build output
echo "Reading verification keys from circuit build output..."

UNSHIELD_VK=$(cat ../circuits/build/unshield_vk_bytes.hex | tr -d '\n')
if [ -z "$UNSHIELD_VK" ]; then
    echo "Error: Could not read unshield VK from ../circuits/build/unshield_vk_bytes.hex"
    echo "Please run circuits/scripts/compile.sh unshield first"
    exit 1
fi
echo "✓ Unshield VK: ${#UNSHIELD_VK} bytes (expected: 720)"

TRANSFER_VK=$(cat ../circuits/build/transfer_vk_bytes.hex | tr -d '\n')
if [ -z "$TRANSFER_VK" ]; then
    echo "Error: Could not read transfer VK from ../circuits/build/transfer_vk_bytes.hex"
    echo "Please run circuits/scripts/compile.sh transfer first"
    exit 1
fi
echo "✓ Transfer VK: ${#TRANSFER_VK} bytes (expected: 848)"

SWAP_VK=$(cat ../circuits/build/swap_vk_bytes.hex | tr -d '\n')
if [ -z "$SWAP_VK" ]; then
    echo "Error: Could not read swap VK from ../circuits/build/swap_vk_bytes.hex"
    echo "Please run circuits/scripts/compile.sh swap first"
    exit 1
fi
echo "✓ Swap VK: ${#SWAP_VK} bytes (expected: 912)"
echo ""

# Update or append an env variable in a file
update_env_var() {
    local key=$1
    local value=$2
    local file=$3

    if grep -q "^${key}=" "$file"; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|^${key}=.*|${key}=${value}|" "$file"
        else
            sed -i "s|^${key}=.*|${key}=${value}|" "$file"
        fi
    else
        echo "${key}=${value}" >> "$file"
    fi
}

# Create a single pool by token type
create_pool() {
    local token=$1
    local type_args=$2
    local token_upper=$(echo "$token" | tr '[:lower:]' '[:upper:]')

    echo "=== Creating $token_upper Privacy Pool ==="
    [ "$token" = "usdc" ] && echo "Token Type: $type_args"
    echo ""

    echo "Creating $token_upper privacy pool..."
    echo "Command: sui client call --function create_shared_pool --type-args \"$type_args\""
    echo ""

    set +e
    POOL_OUTPUT=$(sui client call \
        --package "$NEXT_PUBLIC_PACKAGE_ID" \
        --module pool \
        --function create_shared_pool \
        --type-args "$type_args" \
        --args "0x$UNSHIELD_VK" "0x$TRANSFER_VK" "0x$SWAP_VK" \
        --gas-budget 200000000 \
        --json 2>&1 | grep -v '^\[warning\]')
    EXIT_CODE=$?
    set -e

    if [ $EXIT_CODE -ne 0 ]; then
        echo "❌ Transaction failed with exit code: $EXIT_CODE"
        echo "$POOL_OUTPUT"
        return 1
    fi

    if ! echo "$POOL_OUTPUT" | jq empty 2>/dev/null; then
        echo "❌ Transaction output is not valid JSON!"
        echo "$POOL_OUTPUT"
        return 1
    fi

    # Support both old format (effects.status.status) and new format (effects.V2.status)
    local tx_status
    tx_status=$(echo "$POOL_OUTPUT" | jq -r '
        if .effects.status.status then .effects.status.status
        elif .effects.V2.status then .effects.V2.status
        else "unknown"
        end' 2>/dev/null)

    if [ "$tx_status" != "success" ] && [ "$tx_status" != "Success" ]; then
        echo "❌ Transaction executed but failed! (status: $tx_status)"
        echo "$POOL_OUTPUT" | jq '.effects.status // .effects.V2.status // .clever_error'
        return 1
    fi

    local pool_id
    # Try old format first (objectChanges with objectType containing PrivacyPool)
    pool_id=$(echo "$POOL_OUTPUT" | jq -r '
        (.objectChanges // [])[]
        | select(.objectType? | strings | contains("PrivacyPool"))
        | .objectId' 2>/dev/null)

    # New format: find shared object in effects.V2.changed_objects
    if [ -z "$pool_id" ] || [ "$pool_id" = "null" ]; then
        pool_id=$(echo "$POOL_OUTPUT" | jq -r '
            .effects.V2.changed_objects[]?
            | select(.[1].output_state.ObjectWrite?[1].Shared?)
            | .[0]' 2>/dev/null)
    fi

    if [ -z "$pool_id" ] || [ "$pool_id" = "null" ]; then
        echo "❌ Failed to extract pool ID from transaction output"
        echo "$POOL_OUTPUT" | jq '.objectChanges // .changed_objects'
        return 1
    fi

    echo "✅ $token_upper Privacy Pool created: $pool_id"
    echo ""

    # Update .env
    if [ "$token" = "sui" ]; then
        update_env_var "NEXT_PUBLIC_SUI_POOL_ID" "$pool_id" "$ENV_FILE"
        update_env_var "UNSHIELD_VK" "$UNSHIELD_VK" "$ENV_FILE"
        update_env_var "TRANSFER_VK" "$TRANSFER_VK" "$ENV_FILE"
        update_env_var "SWAP_VK" "$SWAP_VK" "$ENV_FILE"
        echo "✓ Updated NEXT_PUBLIC_SUI_POOL_ID"
        echo "✓ Updated UNSHIELD_VK, TRANSFER_VK, SWAP_VK"
    else
        update_env_var "NEXT_PUBLIC_USDC_POOL_ID" "$pool_id" "$ENV_FILE"
        update_env_var "NEXT_PUBLIC_USDC_TYPE" "$type_args" "$ENV_FILE"
        echo "✓ Updated NEXT_PUBLIC_USDC_POOL_ID, NEXT_PUBLIC_USDC_TYPE"
    fi
    echo ""

    # Export pool ID for summary
    if [ "$token" = "sui" ]; then
        SUI_POOL_RESULT="$pool_id"
    else
        USDC_POOL_RESULT="$pool_id"
    fi
}

SUI_TYPE="0x2::sui::SUI"
USDC_TYPE="0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC"

case "$TOKEN_TYPE" in
    sui)  create_pool sui "$SUI_TYPE" ;;
    usdc) create_pool usdc "$USDC_TYPE" ;;
    both)
        create_pool sui "$SUI_TYPE"
        create_pool usdc "$USDC_TYPE"
        ;;
esac

echo "=== Summary ==="
echo "Package ID: $NEXT_PUBLIC_PACKAGE_ID"
[ -n "$SUI_POOL_RESULT" ]  && echo "SUI Pool ID:  $SUI_POOL_RESULT"
[ -n "$USDC_POOL_RESULT" ] && echo "USDC Pool ID: $USDC_POOL_RESULT"
echo "Network: $NETWORK"
echo "Unshield VK: ${#UNSHIELD_VK} bytes"
echo "Transfer VK: ${#TRANSFER_VK} bytes"
echo "Swap VK: ${#SWAP_VK} bytes"
