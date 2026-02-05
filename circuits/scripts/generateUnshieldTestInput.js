const { buildPoseidon } = require("circomlibjs");
const fs = require("fs");
const path = require("path");

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
    const input_random = "11111111111111111111111111111111111111111111111111";
    const input_value = "1000000000"; // 1 SUI (9 decimals)
    const unshield_amount = "600000000"; // 0.6 SUI to unshield
    const token = "123456789"; // Token identifier (hash of type in production)
    const input_leaf_index = "0"; // First leaf position

    // Change note parameters
    const change_random = "22222222222222222222222222222222222222222222222222";

    // ============ Compute Derived Values for Input Note ============

    // MPK = Poseidon(spending_key, nullifying_key)
    const mpk = hash([spending_key, nullifying_key]);
    console.log("MPK:", mpk);

    // Input NPK = Poseidon(MPK, input_random)
    const npk = hash([mpk, input_random]);
    console.log("NPK:", npk);

    // Input Commitment = Poseidon(npk, token, input_value)
    const commitment = hash([npk, token, input_value]);
    console.log("Commitment:", commitment);

    // Nullifier = Poseidon(nullifying_key, input_leaf_index)
    const nullifier = hash([nullifying_key, input_leaf_index]);
    console.log("Nullifier:", nullifier);

    // ============ Compute Change Note ============
    const change_value = BigInt(input_value) - BigInt(unshield_amount);
    console.log("Change Value:", change_value.toString());

    // Change NPK = Poseidon(MPK, change_random)
    // (User sends change to themselves)
    const change_npk = hash([mpk, change_random]);
    console.log("Change NPK:", change_npk);

    // Change Commitment = Poseidon(change_npk, token, change_value)
    const change_commitment = change_value > 0n
        ? hash([change_npk, token, change_value.toString()])
        : "0";
    console.log("Change Commitment:", change_commitment);

    // ============ Compute Merkle Root ============
    // For testing, we compute the root with a single leaf (input_commitment at index 0)
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
        random: input_random,
        value: input_value,
        token,
        leaf_index: input_leaf_index,
        path_elements,
        change_random,

        // Public input
        unshield_amount
    };

    // Save to file
    fs.writeFileSync(path.join(__dirname, "../build/unshield_input.json"), JSON.stringify(input, null, 2));
    console.log("\nInput saved to build/unshield_input.json");

    // Print expected public signals for verification
    console.log("\n=== Expected Public Signals (4 elements) ===");
    console.log("Expected order: [nullifier, merkle_root, change_commitment, unshield_amount]");
    console.log("1. nullifier:", nullifier);
    console.log("2. merkle_root:", merkle_root);
    console.log("3. change_commitment:", change_commitment);
    console.log("4. unshield_amount:", unshield_amount);

    // Print values for verification
    console.log("\n=== Test Scenario ===");
    console.log("Input note value:", input_value, "(" + (BigInt(input_value) / 1000000000n).toString() + " SUI)");
    console.log("Unshield amount:", unshield_amount, "(" + (BigInt(unshield_amount) / 1000000000n).toString() + " SUI)");
    console.log("Change value:", change_value.toString(), "(" + (change_value / 1000000000n).toString() + " SUI)");
    console.log("Has change:", change_value > 0n);
}

main().catch(console.error);
