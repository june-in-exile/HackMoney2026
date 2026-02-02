// Convert snarkjs output to Sui's Arkworks compressed format
// For swap circuit
// BN254 curve: G1 = 32 bytes compressed, G2 = 64 bytes compressed, Fr = 32 bytes LE

const fs = require("fs");
const path = require("path");

// BN254 field modulus
const FIELD_MODULUS = BigInt("21888242871839275222246405745257275088696311157297823662689037894645226208583");
const SCALAR_MODULUS = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");

// Convert a BigInt to 32-byte little-endian buffer
function bigIntToLE32(n) {
    const buf = Buffer.alloc(32);
    let val = BigInt(n);
    for (let i = 0; i < 32; i++) {
        buf[i] = Number(val & 0xFFn);
        val >>= 8n;
    }
    return buf;
}

// Compress G1 point (Arkworks format): x-coordinate with sign bit in most significant bit of last byte
function compressG1(point) {
    const x = BigInt(point[0]);
    const y = BigInt(point[1]);

    // Convert x to 32-byte little-endian
    const buf = bigIntToLE32(x);

    // Set the sign bit (y > p/2 means negative, set bit in last byte)
    const yNeg = y > (FIELD_MODULUS / 2n);
    if (yNeg) {
        buf[31] |= 0x80;
    }

    return buf;
}

// Compress G2 point: similar but 64 bytes (two Fq elements for x)
function compressG2(point) {
    const x0 = BigInt(point[0][0]);
    const x1 = BigInt(point[0][1]);
    const y0 = BigInt(point[1][0]);
    const y1 = BigInt(point[1][1]);

    const buf = Buffer.alloc(64);

    // Write x0 (c0) in little-endian
    let val = x0;
    for (let i = 0; i < 32; i++) {
        buf[i] = Number(val & 0xFFn);
        val >>= 8n;
    }

    // Write x1 (c1) in little-endian
    val = x1;
    for (let i = 32; i < 64; i++) {
        buf[i] = Number(val & 0xFFn);
        val >>= 8n;
    }

    // Determine sign
    const negY0 = y0 === 0n ? 0n : FIELD_MODULUS - y0;
    const negY1 = y1 === 0n ? 0n : FIELD_MODULUS - y1;

    let yIsLarger = false;
    if (y1 > negY1) {
        yIsLarger = true;
    } else if (y1 === negY1 && y0 > negY0) {
        yIsLarger = true;
    }

    if (yIsLarger) {
        buf[63] |= 0x80;
    }

    return buf;
}

// Convert public input (scalar in Fr) to 32-byte little-endian
function convertPublicInput(input) {
    return bigIntToLE32(BigInt(input));
}

// Load files for swap circuit
const baseDir = path.dirname(__filename);
const vk = JSON.parse(fs.readFileSync(path.join(baseDir, "../build/swap_vk.json")));

console.log("=== Converting swap circuit VK to Sui format ===\n");

// === Verification Key ===
const alpha_g1 = compressG1(vk.vk_alpha_1);
const beta_g2 = compressG2(vk.vk_beta_2);
const gamma_g2 = compressG2(vk.vk_gamma_2);
const delta_g2 = compressG2(vk.vk_delta_2);

// IC points (gamma_abc_g1)
const ic_points = vk.IC.map(p => compressG1(p));

// Arkworks format: alpha || beta || gamma || delta || len(IC) as u64 LE || IC points
const icLenBuf = Buffer.alloc(8);
icLenBuf.writeUInt32LE(ic_points.length, 0);

const vkBytes = Buffer.concat([
    alpha_g1,          // 32 bytes
    beta_g2,           // 64 bytes
    gamma_g2,          // 64 bytes
    delta_g2,          // 64 bytes
    icLenBuf,          // 8 bytes (length of IC array)
    ...ic_points       // 32 bytes each
]);

console.log("Verifying Key (hex):");
console.log(vkBytes.toString("hex"));
console.log(`\nVK length: ${vkBytes.length} bytes`);
console.log(`IC points: ${ic_points.length} (expected: 7 for 6 public inputs)`);

// === Write output ===
fs.writeFileSync(path.join(baseDir, "../build/swap_vk_bytes.hex"), vkBytes.toString("hex"));

console.log("\n=== File written to build/ ===");
console.log("- swap_vk_bytes.hex");

// Output as Move vector literal
console.log("\n=== Move literal (for pool creation) ===");
console.log(`\nconst SWAP_VK: vector<u8> = x"${vkBytes.toString("hex")}";`);

console.log("\n=== Public Inputs Order (for reference) ===");
console.log("1. merkle_root");
console.log("2. input_nullifier1");
console.log("3. input_nullifier2");
console.log("4. output_commitment");
console.log("5. change_commitment");
console.log("6. swap_data_hash");
