#!/bin/bash
# Compile transfer.circom and generate proving/verification keys for Groth16 ZK-SNARKs

set -e

CIRCUIT_NAME="transfer"
CIRCUIT_NAME_UPPER=$(echo "$CIRCUIT_NAME" | tr 'a-z' 'A-Z')
BUILD_DIR="build"
PTAU_FILE="$BUILD_DIR/pot15_final.ptau"

echo "=== Compiling $CIRCUIT_NAME circuit ==="

cd ..

# Check and create build directory if it doesn't exist
if [ ! -d "$BUILD_DIR" ]; then
    echo "Creating build directory..."
    mkdir -p "$BUILD_DIR"
fi

# Check and download powers of tau file if it doesn't exist
if [ ! -f "$PTAU_FILE" ]; then
    echo "Powers of tau file not found. Downloading from AWS..."
    echo "Downloading powersOfTau28_hez_final_15.ptau (~400MB)..."
    curl -L https://pse-trusted-setup-ppot.s3.eu-central-1.amazonaws.com/pot28_0080/ppot_0080_15.ptau \
        -o "$PTAU_FILE" \
        --progress-bar
    echo "✓ Download complete"
fi

# Step 1: Compile circom to R1CS, WASM, and SYM
echo "[1/12] Compiling circom..."
circom $CIRCUIT_NAME.circom \
    --r1cs \
    --wasm \
    --sym \
    -o $BUILD_DIR

# Step 2: View circuit info
echo "[2/12] Circuit info:"
snarkjs r1cs info $BUILD_DIR/${CIRCUIT_NAME}.r1cs

# Step 3: Generate zkey (Groth16 setup)
echo "[3/12] Generating zkey..."
snarkjs groth16 setup \
    $BUILD_DIR/${CIRCUIT_NAME}.r1cs \
    $PTAU_FILE \
    $BUILD_DIR/${CIRCUIT_NAME}_0000.zkey

# Step 4: Contribute to ceremony (for production, use multiple contributors)
echo "[4/12] Contributing to ceremony..."
snarkjs zkey contribute \
    $BUILD_DIR/${CIRCUIT_NAME}_0000.zkey \
    $BUILD_DIR/${CIRCUIT_NAME}_final.zkey \
    --name="Octopus Transfer Circuit" \
    -v -e="random entropy $(date +%s)"

# Step 5: Export verification key
echo "[5/12] Exporting verification key..."
snarkjs zkey export verificationkey \
    $BUILD_DIR/${CIRCUIT_NAME}_final.zkey \
    $BUILD_DIR/${CIRCUIT_NAME}_vk.json

# Step 6: Print summary
echo "[6/12] Circuit compilation complete!"
echo ""
echo "Generated files:"
echo "  - $BUILD_DIR/${CIRCUIT_NAME}.r1cs"
echo "  - $BUILD_DIR/${CIRCUIT_NAME}.sym"
echo "  - $BUILD_DIR/${CIRCUIT_NAME}_js/ (WASM prover)"
echo "  - $BUILD_DIR/${CIRCUIT_NAME}_final.zkey"
echo "  - $BUILD_DIR/${CIRCUIT_NAME}_vk.json"
echo ""
echo "Constraint count:"
snarkjs r1cs info $BUILD_DIR/${CIRCUIT_NAME}.r1cs | grep "# of Constraints"
echo ""

# Step 7: Generate test input
echo "[7/12] Generating test input..."
node scripts/generateTransferTestInput.js

# Step 8: Generate witness and proof
echo "[8/12] Generating witness and proof..."
snarkjs groth16 fullprove \
    ${BUILD_DIR}/transfer_input.json \
    ${BUILD_DIR}/transfer_js/transfer.wasm \
    ${BUILD_DIR}/transfer_final.zkey \
    ${BUILD_DIR}/transfer_proof.json \
    ${BUILD_DIR}/transfer_public.json

# Step 9: Verify the proof
echo "[9/12] Verifying proof..."
snarkjs groth16 verify \
    ${BUILD_DIR}/transfer_vk.json \
    ${BUILD_DIR}/transfer_public.json \
    ${BUILD_DIR}/transfer_proof.json

# Step 10: Convert VK to Sui format
echo "[10/12] Converting VK to Sui format..."
node scripts/arkworksConverterTransfer.js

# Step 11: Copy artifacts to frontend
echo "[11/12] Copying artifacts to frontend..."
mkdir -p ../frontend/public/circuits/${CIRCUIT_NAME}_js
cp ${BUILD_DIR}/${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm ../frontend/public/circuits/${CIRCUIT_NAME}_js/
cp ${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey ../frontend/public/circuits/
cp ${BUILD_DIR}/${CIRCUIT_NAME}_vk.json ../frontend/public/circuits/
echo "✓ Artifacts copied to frontend/public/circuits/"

# Step 12: Final summary
echo "[12/12] ✅ Circuit compilation complete!"
echo ""
echo "Next steps:"
echo ""
echo "  For FIRST-TIME deployment:"
echo "    1. Compile all three circuits (unshield, transfer, swap)"
echo "    2. Deploy the Move package:"
echo "       cd ../contracts/scripts && ./deploy_package.sh"
echo "    3. Create the privacy pool with verification keys:"
echo "       ./create_pool.sh"
echo ""
echo "  For UPDATING existing deployment (VK changes only):"
echo "    - Update the on-chain VK:"
echo "      cd ../../contracts/scripts && ./update_transfer_vk.sh"