#!/usr/bin/env tsx
/**
 * Railgun on Sui - Demo Script
 *
 * Demonstrates the complete shield/unshield flow:
 * 1. Generate keypair
 * 2. Create a note (simulating shield)
 * 3. Generate ZK proof for unshield
 * 4. Verify proof locally
 * 5. Show Sui-compatible proof format
 */

import {
  initPoseidon,
  generateKeypair,
  createNote,
  computeNullifier,
  buildSingleLeafProof,
  generateUnshieldProof,
  verifyProofLocal,
  convertProofToSui,
  loadVerificationKey,
  bytesToHex,
  type SpendInput,
} from "./index.js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message: string, color: keyof typeof colors = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title: string) {
  console.log();
  log(`${"=".repeat(60)}`, "cyan");
  log(`  ${title}`, "bright");
  log(`${"=".repeat(60)}`, "cyan");
}

async function main() {
  log("\n🐙 Railgun on Sui - SDK Demo\n", "bright");

  // Check if circuit files exist
  const circuitDir = path.resolve(__dirname, "../../circuits/build");
  const wasmPath = path.join(circuitDir, "unshield_js/unshield.wasm");
  const zkeyPath = path.join(circuitDir, "unshield_final.zkey");
  const vkPath = path.join(circuitDir, "unshield_vk.json");

  const hasCircuitFiles =
    fs.existsSync(wasmPath) &&
    fs.existsSync(zkeyPath) &&
    fs.existsSync(vkPath);

  if (!hasCircuitFiles) {
    log("⚠️  Circuit files not found. Running in demo mode (no proof generation).", "yellow");
    log("   To enable full functionality, run:", "yellow");
    log("   cd circuits && ./compile_unshield.sh", "yellow");
  }

  // ============ Step 1: Initialize ============
  logSection("Step 1: Initialize Poseidon Hash");
  log("Initializing circomlibjs Poseidon...");
  await initPoseidon();
  log("✓ Poseidon initialized", "green");

  // ============ Step 2: Generate Keypair ============
  logSection("Step 2: Generate Railgun Keypair");

  const keypair = generateKeypair();
  log(`Spending Key:     ${keypair.spendingKey.toString().slice(0, 40)}...`);
  log(`Nullifying Key:   ${keypair.nullifyingKey.toString().slice(0, 40)}...`);
  log(`Master Public Key: ${keypair.masterPublicKey.toString().slice(0, 40)}...`);
  log("✓ Keypair generated", "green");

  // ============ Step 3: Create Note (Simulating Shield) ============
  logSection("Step 3: Create Note (Simulating Shield)");

  const tokenId = 123456789n; // Token type identifier
  const amount = 1000000000n; // 1 SUI (9 decimals)

  const note = createNote(keypair.masterPublicKey, tokenId, amount);

  log(`Token ID:   ${tokenId}`);
  log(`Amount:     ${amount} (1 SUI)`);
  log(`NPK:        ${note.npk.toString().slice(0, 40)}...`);
  log(`Random:     ${note.random.toString().slice(0, 40)}...`);
  log(`Commitment: ${note.commitment.toString().slice(0, 40)}...`);
  log("✓ Note created", "green");

  // ============ Step 4: Build Merkle Proof ============
  logSection("Step 4: Build Merkle Proof");

  const { pathElements, root } = buildSingleLeafProof(note.commitment);
  const leafIndex = 0; // First leaf

  log(`Leaf Index:   ${leafIndex}`);
  log(`Merkle Root:  ${root.toString().slice(0, 40)}...`);
  log(`Path Length:  ${pathElements.length} levels`);
  log("✓ Merkle proof built", "green");

  // ============ Step 5: Compute Nullifier ============
  logSection("Step 5: Compute Nullifier");

  const nullifier = computeNullifier(keypair.nullifyingKey, leafIndex);
  log(`Nullifier: ${nullifier.toString().slice(0, 40)}...`);
  log("✓ Nullifier computed", "green");

  // ============ Step 6: Generate ZK Proof ============
  if (hasCircuitFiles) {
    logSection("Step 6: Generate ZK Proof (Groth16)");

    const spendInput: SpendInput = {
      note,
      leafIndex,
      pathElements,
      keypair,
    };

    log("Generating proof (this may take a moment)...");
    const startTime = Date.now();

    try {
      const { proof, publicSignals } = await generateUnshieldProof(spendInput);
      const duration = Date.now() - startTime;

      log(`✓ Proof generated in ${duration}ms`, "green");
      log(`\nPublic Signals:`);
      log(`  [0] merkle_root: ${publicSignals[0].slice(0, 40)}...`);
      log(`  [1] nullifier:   ${publicSignals[1].slice(0, 40)}...`);
      log(`  [2] commitment:  ${publicSignals[2].slice(0, 40)}...`);

      // ============ Step 7: Verify Locally ============
      logSection("Step 7: Verify Proof Locally");

      const isValid = await verifyProofLocal(proof, publicSignals);
      if (isValid) {
        log("✓ Proof verified successfully!", "green");
      } else {
        log("✗ Proof verification failed!", "yellow");
      }

      // ============ Step 8: Convert to Sui Format ============
      logSection("Step 8: Convert to Sui Format");

      const suiProof = convertProofToSui(proof, publicSignals);

      log(`Proof Bytes (${suiProof.proofBytes.length} bytes):`);
      log(`  ${bytesToHex(suiProof.proofBytes).slice(0, 64)}...`);

      log(`\nPublic Inputs Bytes (${suiProof.publicInputsBytes.length} bytes):`);
      log(`  ${bytesToHex(suiProof.publicInputsBytes).slice(0, 64)}...`);

      // Load VK
      const vk = await loadVerificationKey();
      log(`\nVerification Key (${vk.vkBytes.length} bytes):`);
      log(`  ${bytesToHex(vk.vkBytes).slice(0, 64)}...`);

      log("\n✓ Ready for Sui transaction!", "green");

      // ============ Summary ============
      logSection("Summary: Sui Transaction Parameters");

      log("To execute unshield on Sui, call:\n");
      log("  pool::unshield<SUI>(", "cyan");
      log("    pool,");
      log(`    x"${bytesToHex(suiProof.proofBytes)}",`);
      log(`    x"${bytesToHex(suiProof.publicInputsBytes)}",`);
      log(`    ${amount},  // amount`);
      log("    @recipient_address");
      log("  )", "cyan");

    } catch (error) {
      log(`✗ Proof generation failed: ${error}`, "yellow");
    }
  } else {
    logSection("Step 6-8: Skipped (Circuit files not available)");
    log("To enable proof generation:", "yellow");
    log("  1. cd circuits", "yellow");
    log("  2. npm install", "yellow");
    log("  3. ./compile_unshield.sh", "yellow");
  }

  // ============ Final ============
  logSection("Demo Complete!");
  log("🐙 Railgun on Sui SDK is ready for use.\n", "bright");
}

main().catch((error) => {
  console.error("Demo failed:", error);
  process.exit(1);
});
