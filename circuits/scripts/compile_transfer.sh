#!/bin/bash
set -e

CIRCUIT_NAME="transfer"
BUILD_DIR="build"
PTAU_FILE="$BUILD_DIR/pot15_final.ptau"

echo "=== Compiling $CIRCUIT_NAME circuit ==="

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

echo "Step 1: Compiling circuit..."
circom $CIRCUIT_NAME.circom --r1cs --wasm --sym -o $BUILD_DIR

echo ""
echo "Step 2: Circuit info..."
snarkjs r1cs info $BUILD_DIR/${CIRCUIT_NAME}.r1cs

echo ""
echo "Step 3: Groth16 setup..."
snarkjs groth16 setup \
    $BUILD_DIR/${CIRCUIT_NAME}.r1cs \
    $PTAU_FILE \
    $BUILD_DIR/${CIRCUIT_NAME}_0000.zkey

echo ""
echo "Step 4: Contribute to ceremony..."
snarkjs zkey contribute \
    $BUILD_DIR/${CIRCUIT_NAME}_0000.zkey \
    $BUILD_DIR/${CIRCUIT_NAME}_final.zkey \
    --name="Octopus Transfer Circuit" \
    -v -e="random entropy $(date +%s)"

echo ""
echo "Step 5: Export verification key..."
snarkjs zkey export verificationkey \
    $BUILD_DIR/${CIRCUIT_NAME}_final.zkey \
    $BUILD_DIR/${CIRCUIT_NAME}_vk.json

echo ""
echo "=== Summary ==="
echo "✓ Circuit compiled: $BUILD_DIR/${CIRCUIT_NAME}.r1cs"
echo "✓ WASM prover: $BUILD_DIR/${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm"
echo "✓ Proving key: $BUILD_DIR/${CIRCUIT_NAME}_final.zkey"
echo "✓ Verification key: $BUILD_DIR/${CIRCUIT_NAME}_vk.json"
echo ""
echo "Next steps:"
echo "1. Test the circuit: node scripts/generateTransferTestInput.js"
echo "2. Generate a proof:"
echo "   snarkjs groth16 fullprove build/transfer_input.json \\"
echo "     build/transfer_js/transfer.wasm \\"
echo "     build/transfer_final.zkey \\"
echo "     build/transfer_proof.json \\"
echo "     build/transfer_public.json"
echo "3. Verify the proof:"
echo "   snarkjs groth16 verify build/transfer_vk.json \\"
echo "     build/transfer_public.json \\"
echo "     build/transfer_proof.json"
echo "4. Copy artifacts to frontend:"
echo "   mkdir -p ../frontend/public/circuits/transfer_js"
echo "   cp build/transfer_js/transfer.wasm ../frontend/public/circuits/transfer_js/"
echo "   cp build/transfer_final.zkey ../frontend/public/circuits/"
echo "   cp build/transfer_vk.json ../frontend/public/circuits/"
