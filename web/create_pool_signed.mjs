#!/usr/bin/env node
/**
 * Create a shared privacy pool with verification key - SIGNED VERSION
 */

import { Transaction } from "@mysten/sui/transactions";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { fromHex } from "@mysten/sui/utils";
import { execSync } from "child_process";

const PACKAGE_ID = "0xb2ab082080abf37b3e0a1130db3f656eba53c7aa6e847ae3f9d1d5112248a080";
const SUI_COIN_TYPE = "0x2::sui::SUI";

// VK bytes (360 bytes) - Poseidon-based verification key
const VK_HEX = "e2f26dbea299f5223b646cb1fb33eadb059d9407559d7441dfd902e3a79a4d2dabb73dc17fbc13021e2471e0c08bd67d8401f52b73d6d07483794cad4778180e0c06f33bbc4c79a9cadef253a68084d382f17788f885c9afd176f7cb2f036789edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e1953e4f1664311bdc62b4509eb4e8e07f6008ce903d3497f7b0e95cb082a4dec11d9b87aa74e30aa03656c88b0ba942e1f6c3e50fb4c0234deceb0ca4786bad69d0400000000000000191f71d49c7ecfcc3643957f0d503d24e713cf91937a8a33b7c118a6afef44891ef0fa65bcfbe5a8f6a5a1bb098b6e508467a66a10af02338ce1560ff9609f1588d71006852b8f431fd5d3de34357325e41f3252748926d16c27ed7cb789478068d1e927470885642b8adcd4b38f20583984d85f9274e93b39f834daacf80b0b";

async function main() {
  try {
    // Get active address from sui client
    const activeAddress = execSync("sui client active-address", {
      encoding: "utf-8",
    }).trim();

    const client = new SuiClient({ url: getFullnodeUrl("testnet") });

    console.log("Creating privacy pool with Poseidon verification key...");
    console.log("Sender:", activeAddress);
    console.log("Package:", PACKAGE_ID);

    const tx = new Transaction();
    tx.setSender(activeAddress);

    // Convert VK hex to array of u8
    const vkBytes = Array.from(fromHex(VK_HEX));
    console.log("VK bytes length:", vkBytes.length);

    // Call create_shared_pool<SUI>(vk_bytes)
    tx.moveCall({
      target: `${PACKAGE_ID}::pool::create_shared_pool`,
      typeArguments: [SUI_COIN_TYPE],
      arguments: [tx.pure.vector("u8", vkBytes)],
    });

    tx.setGasBudget(100_000_000);

    // Build transaction bytes
    const txBytes = await tx.build({ client });
    const txBase64 = Buffer.from(txBytes).toString("base64");

    console.log("\n✅ Transaction built successfully");
    console.log("TX bytes length:", txBytes.length);

    // Sign and execute using sui keytool
    console.log("\nSigning and executing...");
    const result = execSync(
      `sui keytool sign --address $(sui client active-address) --data ${txBase64}`,
      { encoding: "utf-8" }
    );

    const signatureMatch = result.match(/Signature: (.+)/);
    if (!signatureMatch) {
      throw new Error("Failed to extract signature");
    }

    const signature = signatureMatch[1].trim();

    // Execute the signed transaction
    const executeResult = execSync(
      `sui client execute-signed-tx --tx-bytes ${txBase64} --signatures ${signature}`,
      { encoding: "utf-8" }
    );

    console.log("\n" + executeResult);

    // Extract pool ID from output
    const poolIdMatch = executeResult.match(/Created Objects:[\s\S]*?│\s+ID: (0x[a-f0-9]+)/);
    if (poolIdMatch) {
      console.log("\n✅ Pool created successfully!");
      console.log("Pool ID:", poolIdMatch[1]);
      console.log("\nUpdate web/src/lib/constants.ts:");
      console.log(`export const POOL_ID = "${poolIdMatch[1]}";`);
    }
  } catch (err) {
    console.error("Error:", err.message);
    if (err.stdout) console.log(err.stdout.toString());
    if (err.stderr) console.error(err.stderr.toString());
    process.exit(1);
  }
}

main();
