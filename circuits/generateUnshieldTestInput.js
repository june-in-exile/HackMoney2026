const { buildPoseidon } = require("circomlibjs");
const fs = require("fs");

// Field modulus for BN254 curve
const FIELD_SIZE = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");

async function main() {
    const poseidon = await buildPoseidon();
    const F = poseidon.F;

    // Convert poseidon output to BigInt string
    const hash = (inputs) => {
        const h = poseidon(inputs.map(x => BigInt(x)));
        return F.toString(h);
    };

    // ============ Generate Random Test Values ============
    // In production, these would be securely generated
    const spending_key = "12345678901234567890123456789012345678901234567890";
    const nullifying_key = "98765432109876543210987654321098765432109876543210";
    const random = "11111111111111111111111111111111111111111111111111";
    const value = "1000000000"; // 1 SUI (9 decimals)
    const token = "123456789"; // Token identifier (hash of type in production)
    const path_indices = "0"; // First leaf position

    // ============ Compute Derived Values ============

    // MPK = Poseidon(spending_key, nullifying_key)
    const mpk = hash([spending_key, nullifying_key]);
    console.log("MPK:", mpk);

    // NPK = Poseidon(MPK, random)
    const npk = hash([mpk, random]);
    console.log("NPK:", npk);

    // Commitment = Poseidon(NPK, token, value)
    const commitment = hash([npk, token, value]);
    console.log("Commitment:", commitment);

    // Nullifier = Poseidon(nullifying_key, path_indices)
    const nullifier = hash([nullifying_key, path_indices]);
    console.log("Nullifier:", nullifier);

    // ============ Compute Merkle Root ============
    // For testing, we compute the root with a single leaf (commitment at index 0)
    // All siblings are "zero hashes" (hash of empty subtree at each level)

    const LEVELS = 16;

    // Compute zero hashes for each level
    // zeros[0] = Poseidon(0, 0) - empty leaf pair
    // zeros[i] = Poseidon(zeros[i-1], zeros[i-1])
    const zeros = [];
    zeros[0] = hash(["0", "0"]);
    for (let i = 1; i < LEVELS; i++) {
        zeros[i] = hash([zeros[i-1], zeros[i-1]]);
    }
    console.log("Zero hashes computed");

    // Path elements are all zeros (since tree has only one leaf at index 0)
    const path_elements = zeros.slice(0, LEVELS);

    // Compute merkle root
    // At each level, our value is on the left (index bit = 0), sibling is zero hash
    let current = commitment;
    for (let i = 0; i < LEVELS; i++) {
        current = hash([current, path_elements[i]]);
    }
    const merkle_root = current;
    console.log("Merkle Root:", merkle_root);

    // ============ Create Input JSON ============
    const input = {
        // Private inputs
        spending_key,
        nullifying_key,
        random,
        value,
        token,
        path_elements,
        path_indices,

        // Public inputs
        merkle_root,
        nullifier,
        commitment
    };

    // Save to file
    fs.writeFileSync("build/unshield_input.json", JSON.stringify(input, null, 2));
    console.log("\nInput saved to build/unshield_input.json");

    // Also print public inputs for reference
    console.log("\n=== Public Inputs ===");
    console.log("merkle_root:", merkle_root);
    console.log("nullifier:", nullifier);
    console.log("commitment:", commitment);
}

main().catch(console.error);
