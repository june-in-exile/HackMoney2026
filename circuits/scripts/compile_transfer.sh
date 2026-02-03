#!/bin/bash
# Compile transfer.circom and generate proving/verification keys for Groth16 ZK-SNARKs

set -e

CIRCUIT_NAME="transfer"
BUILD_DIR="build"
PTAU_FILE="$BUILD_DIR/pot15_final.ptau"

echo "=== Compiling $CIRCUIT_NAME circuit ==="

cd ..

# Check if build directory exists
if [ ! -d "$BUILD_DIR" ]; then
    echo "Error: Build directory not found. Please run ./compile_unshield.sh first to set up the build environment."
    exit 1
fi

# Check if powers of tau file exists
if [ ! -f "$PTAU_FILE" ]; then
    echo "Error: Powers of tau file not found at $PTAU_FILE"
    echo "Please download it first:"
    echo "  cd $BUILD_DIR && wget https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_15.ptau -O pot15_final.ptau"
    exit 1
fi

# Step 1: Compile circom to R1CS, WASM, and SYM
echo "[1/6] Compiling circom..."
circom $CIRCUIT_NAME.circom \
    --r1cs \
    --wasm \
    --sym \
    -o $BUILD_DIR

# Step 2: View circuit info
echo "[2/6] Circuit info:"
snarkjs r1cs info $BUILD_DIR/${CIRCUIT_NAME}.r1cs

# Step 3: Generate zkey (Groth16 setup)
echo "[3/6] Generating zkey..."
snarkjs groth16 setup \
    $BUILD_DIR/${CIRCUIT_NAME}.r1cs \
    $PTAU_FILE \
    $BUILD_DIR/${CIRCUIT_NAME}_0000.zkey

# Step 4: Contribute to ceremony (for production, use multiple contributors)
echo "[4/6] Contributing to ceremony..."
snarkjs zkey contribute \
    $BUILD_DIR/${CIRCUIT_NAME}_0000.zkey \
    $BUILD_DIR/${CIRCUIT_NAME}_final.zkey \
    --name="Octopus Transfer Circuit" \
    -v -e="random entropy $(date +%s)"

# Step 5: Export verification key
echo "[5/6] Exporting verification key..."
snarkjs zkey export verificationkey \
    $BUILD_DIR/${CIRCUIT_NAME}_final.zkey \
    $BUILD_DIR/${CIRCUIT_NAME}_vk.json

# Step 6: Print summary
echo "[6/6] Done!"
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
echo "Next steps:"
echo "  1. Go to parent directory: cd .."
echo "  2. Generate test input: node scripts/generateTransferTestInput.js"
echo "  3. Generate witness and proof:"
echo "     snarkjs groth16 fullprove ${BUILD_DIR}/transfer_input.json \\"
echo "       ${BUILD_DIR}/transfer_js/transfer.wasm \\"
echo "       ${BUILD_DIR}/transfer_final.zkey \\"
echo "       ${BUILD_DIR}/transfer_proof.json \\"
echo "       ${BUILD_DIR}/transfer_public.json"
echo "  4. Verify the proof:"
echo "     snarkjs groth16 verify ${BUILD_DIR}/transfer_vk.json \\"
echo "       ${BUILD_DIR}/transfer_public.json \\"
echo "       ${BUILD_DIR}/transfer_proof.json"
echo "  5. Convert to Sui format:"
echo "     node scripts/arkworksConverterTransfer.js"
echo "  6. Copy artifacts to frontend:"
echo "     mkdir -p ../frontend/public/circuits/${CIRCUIT_NAME}_js"
echo "     cp ${BUILD_DIR}/${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm ../frontend/public/circuits/${CIRCUIT_NAME}_js/"
echo "     cp ${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey ../frontend/public/circuits/"
echo "     cp ${BUILD_DIR}/${CIRCUIT_NAME}_vk.json ../frontend/public/circuits/"
