#!/bin/bash
# Compile all circuits (unshield, transfer, swap) in sequence
# This is a convenience script that runs all three individual compilation scripts

set -e

echo "========================================"
echo "  Compiling All Octopus ZK Circuits"
echo "========================================"
echo ""
echo "This will compile:"
echo "  1. unshield.circom"
echo "  2. transfer.circom"
echo "  3. swap.circom"
echo ""
echo "⚠️  WARNING: This process is computationally intensive and will take significant time."
echo "   Each circuit compilation involves multiple steps including trusted setup ceremony."
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Function to print section headers
print_section() {
    echo ""
    echo "========================================"
    echo "  $1"
    echo "========================================"
    echo ""
}

# Pre-download Powers of Tau files to avoid race conditions
print_section "Preparing Powers of Tau Files"
BUILD_DIR="../build"
PTAU_14="$BUILD_DIR/pot14_final.ptau"
PTAU_15="$BUILD_DIR/pot15_final.ptau"

mkdir -p "$BUILD_DIR"

if [ ! -f "$PTAU_14" ]; then
    echo "Downloading pot14_final.ptau (~200MB)..."
    curl -L https://pse-trusted-setup-ppot.s3.eu-central-1.amazonaws.com/pot28_0080/ppot_0080_14.ptau \
        -o "$PTAU_14" --progress-bar
    echo "✓ pot14 download complete"
fi

if [ ! -f "$PTAU_15" ]; then
    echo "Downloading pot15_final.ptau (~400MB)..."
    curl -L https://pse-trusted-setup-ppot.s3.eu-central-1.amazonaws.com/pot28_0080/ppot_0080_15.ptau \
        -o "$PTAU_15" --progress-bar
    echo "✓ pot15 download complete"
fi

# Compile all circuits in parallel
print_section "Compiling All Circuits in Parallel"
echo "Starting parallel compilation of unshield, transfer, and swap circuits..."
echo ""

# Run all three compilations in background
"${SCRIPT_DIR}/compile_unshield.sh" > "$BUILD_DIR/compile_unshield.log" 2>&1 &
PID_UNSHIELD=$!

"${SCRIPT_DIR}/compile_transfer.sh" > "$BUILD_DIR/compile_transfer.log" 2>&1 &
PID_TRANSFER=$!

"${SCRIPT_DIR}/compile_swap.sh" > "$BUILD_DIR/compile_swap.log" 2>&1 &
PID_SWAP=$!

# Wait for all compilations to complete
echo "⏳ Waiting for unshield compilation (PID: $PID_UNSHIELD)..."
wait $PID_UNSHIELD
STATUS_UNSHIELD=$?

echo "⏳ Waiting for transfer compilation (PID: $PID_TRANSFER)..."
wait $PID_TRANSFER
STATUS_TRANSFER=$?

echo "⏳ Waiting for swap compilation (PID: $PID_SWAP)..."
wait $PID_SWAP
STATUS_SWAP=$?

# Check if all compilations succeeded
if [ $STATUS_UNSHIELD -ne 0 ] || [ $STATUS_TRANSFER -ne 0 ] || [ $STATUS_SWAP -ne 0 ]; then
    echo ""
    echo "❌ Some compilations failed!"
    echo ""
    [ $STATUS_UNSHIELD -ne 0 ] && echo "  ✗ Unshield failed (exit code: $STATUS_UNSHIELD). See: $BUILD_DIR/compile_unshield.log"
    [ $STATUS_TRANSFER -ne 0 ] && echo "  ✗ Transfer failed (exit code: $STATUS_TRANSFER). See: $BUILD_DIR/compile_transfer.log"
    [ $STATUS_SWAP -ne 0 ] && echo "  ✗ Swap failed (exit code: $STATUS_SWAP). See: $BUILD_DIR/compile_swap.log"
    exit 1
fi

# Final summary
echo ""
echo "========================================"
echo "  ✅ All Circuits Compiled Successfully!"
echo "========================================"
echo ""
echo "Generated artifacts for:"
echo "  ✓ unshield.circom"
echo "  ✓ transfer.circom"
echo "  ✓ swap.circom"
echo ""
echo "All circuit artifacts have been copied to frontend/public/circuits/"
echo ""
echo "Next steps:"
echo ""
echo "  For FIRST-TIME deployment:"
echo "    1. Deploy the Move package:"
echo "       cd ../../contracts/scripts && ./deploy_package.sh"
echo "    2. Create the privacy pool with verification keys:"
echo "       ./create_pool.sh"
echo ""
echo "  For UPDATING existing deployment (VK changes only):"
echo "    - Update the on-chain VKs:"
echo "      cd ../../contracts/scripts"
echo "      ./update_unshield_vk.sh"
echo "      ./update_transfer_vk.sh"
echo "      ./update_swap_vk.sh"
echo ""
