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

# Compile unshield circuit
print_section "1/3: Compiling Unshield Circuit"
"${SCRIPT_DIR}/compile_unshield.sh"

# Compile transfer circuit
print_section "2/3: Compiling Transfer Circuit"
"${SCRIPT_DIR}/compile_transfer.sh"

# Compile swap circuit
print_section "3/3: Compiling Swap Circuit"
"${SCRIPT_DIR}/compile_swap.sh"

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
echo "       cd ../contracts/scripts && ./deploy_package.sh"
echo "    2. Create the privacy pool with verification keys:"
echo "       ./create_pool.sh"
echo ""
echo "  For UPDATING existing deployment (VK changes only):"
echo "    - Update the on-chain VKs:"
echo "      cd ../contracts/scripts"
echo "      ./update_unshield_vk.sh"
echo "      ./update_transfer_vk.sh"
echo "      ./update_swap_vk.sh"
echo ""
