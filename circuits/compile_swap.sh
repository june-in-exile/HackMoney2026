#!/bin/bash
# Compile swap.circom and generate proving/verification keys for Groth16 ZK-SNARKs

set -e

CIRCUIT_NAME="swap"
BUILD_DIR="build"
PTAU_FILE="$BUILD_DIR/pot15_final.ptau"

echo "=== Compiling $CIRCUIT_NAME circuit ==="

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
    --name="Octopus Dev" \
    -v -e="random entropy for dev"

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
echo "  1. Test circuit with test inputs"
echo "  2. Convert verification key to Sui format"
echo "  3. Update pool.move with swap verification key"
echo "  4. Deploy swap circuit artifacts to web/public/circuits/"
