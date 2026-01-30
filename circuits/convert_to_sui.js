// Convert snarkjs output to Sui's Arkworks compressed format
// BN254 curve: G1 = 32 bytes compressed, G2 = 64 bytes compressed, Fr = 32 bytes LE

const fs = require("fs");

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

// Convert a BigInt to 32-byte big-endian buffer (for x-coordinate in compressed format)
function bigIntToBE32(n) {
    const buf = Buffer.alloc(32);
    let val = BigInt(n);
    for (let i = 31; i >= 0; i--) {
        buf[i] = Number(val & 0xFFn);
        val >>= 8n;
    }
    return buf;
}

// Compress G1 point (Arkworks format): x-coordinate with sign bit in most significant bit of last byte
// Arkworks uses little-endian for the x-coordinate, with flags in the last byte
function compressG1(point) {
    const x = BigInt(point[0]);
    const y = BigInt(point[1]);

    // Convert x to 32-byte little-endian
    const buf = bigIntToLE32(x);

    // Set the sign bit (y > p/2 means negative, set bit in last byte)
    // Arkworks uses bit 7 of the last byte for the sign
    const yNeg = y > (FIELD_MODULUS / 2n);
    if (yNeg) {
        buf[31] |= 0x80;
    }

    return buf;
}

// Compress G2 point: similar but 64 bytes (two Fq elements for x)
function compressG2(point) {
    // point[0] = [x0, x1], point[1] = [y0, y1] (in Fq2)
    const x0 = BigInt(point[0][0]);
    const x1 = BigInt(point[0][1]);
    const y0 = BigInt(point[1][0]);
    const y1 = BigInt(point[1][1]);

    // Arkworks format: c0 (x0) in bytes 0-31, c1 (x1) in bytes 32-63, both little-endian
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

    // Determine sign: lexicographically compare y with -y in Fq2
    // -y = (p - y0, p - y1) if y1 != 0, else (p - y0, 0)
    // Sign bit is 1 if y is lexicographically larger
    const negY0 = y0 === 0n ? 0n : FIELD_MODULUS - y0;
    const negY1 = y1 === 0n ? 0n : FIELD_MODULUS - y1;

    // Lexicographic comparison: compare y1 first, then y0
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

// Load files
const path = require("path");
const baseDir = path.dirname(__filename);
const vk = JSON.parse(fs.readFileSync(path.join(baseDir, "build/verification_key.json")));
const proof = JSON.parse(fs.readFileSync(path.join(baseDir, "build/proof.json")));
const publicInputs = JSON.parse(fs.readFileSync(path.join(baseDir, "build/public.json")));

console.log("=== Converting snarkjs output to Sui format ===\n");

// === Verification Key ===
// Arkworks VerifyingKey format (compressed):
// alpha_g1: G1 (32 bytes)
// beta_g2: G2 (64 bytes)
// gamma_g2: G2 (64 bytes)
// delta_g2: G2 (64 bytes)
// gamma_abc_g1: array of G1 points (IC in snarkjs)

const alpha_g1 = compressG1(vk.vk_alpha_1);
const beta_g2 = compressG2(vk.vk_beta_2);
const gamma_g2 = compressG2(vk.vk_gamma_2);
const delta_g2 = compressG2(vk.vk_delta_2);

// IC points (gamma_abc_g1)
const ic_points = vk.IC.map(p => compressG1(p));

// Concatenate VK: alpha_g1 || beta_g2 || gamma_g2 || delta_g2 || len(IC) as u32 LE || IC[0] || IC[1] || ...
// Actually, Arkworks format is different. Let me check the exact format.

// For Sui's prepare_verifying_key, it expects raw Arkworks VerifyingKey bytes
// The format is:
// - alpha (G1, compressed)
// - beta (G2, compressed)
// - gamma (G2, compressed)
// - delta (G2, compressed)
// - gamma_abc: length as u64 LE, then each G1 point

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

// === Proof ===
// Arkworks Proof format (compressed): pi_a (G1) || pi_b (G2) || pi_c (G1)
const pi_a = compressG1(proof.pi_a);
const pi_b = compressG2(proof.pi_b);
const pi_c = compressG1(proof.pi_c);

const proofBytes = Buffer.concat([pi_a, pi_b, pi_c]);

console.log("\nProof Points (hex):");
console.log(proofBytes.toString("hex"));
console.log(`\nProof length: ${proofBytes.length} bytes`);

// === Public Inputs ===
// Concatenated 32-byte scalars in little-endian
const publicInputsBytes = Buffer.concat(publicInputs.map(p => convertPublicInput(p)));

console.log("\nPublic Inputs (hex):");
console.log(publicInputsBytes.toString("hex"));
console.log(`\nPublic inputs length: ${publicInputsBytes.length} bytes`);

// === Write outputs ===
fs.writeFileSync(path.join(baseDir, "build/vk_bytes.hex"), vkBytes.toString("hex"));
fs.writeFileSync(path.join(baseDir, "build/proof_bytes.hex"), proofBytes.toString("hex"));
fs.writeFileSync(path.join(baseDir, "build/public_inputs_bytes.hex"), publicInputsBytes.toString("hex"));

console.log("\n=== Files written to build/ ===");
console.log("- vk_bytes.hex");
console.log("- proof_bytes.hex");
console.log("- public_inputs_bytes.hex");

// Also output as Move vector literals for easy copy-paste
console.log("\n=== Move literals ===");
console.log(`\nlet vk = x"${vkBytes.toString("hex")}";`);
console.log(`\nlet proof_points = x"${proofBytes.toString("hex")}";`);
console.log(`\nlet public_inputs = x"${publicInputsBytes.toString("hex")}";`);
