const { buildPoseidon } = require("circomlibjs");

async function main() {
    const poseidon = await buildPoseidon();

    // Test secret value
    const secret = BigInt(12345);

    // Compute Poseidon hash
    const hash = poseidon.F.toString(poseidon([secret]));

    console.log("Secret:", secret.toString());
    console.log("Hash:", hash);

    // Output input.json format
    const input = {
        secret: secret.toString(),
        hash: hash
    };

    console.log("\ninput.json:");
    console.log(JSON.stringify(input, null, 2));

    // Write to file
    const fs = require("fs");
    fs.writeFileSync("build/input.json", JSON.stringify(input, null, 2));
    console.log("\nWritten to build/input.json");
}

main();
