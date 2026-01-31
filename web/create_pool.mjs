#!/usr/bin/env node
/**
 * Create a shared privacy pool with verification key
 */

import { Transaction } from "@mysten/sui/transactions";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { fromHex } from "@mysten/sui/utils";
import { execSync } from "child_process";

const PACKAGE_ID = "0xb2ab082080abf37b3e0a1130db3f656eba53c7aa6e847ae3f9d1d5112248a080";
const SUI_COIN_TYPE = "0x2::sui::SUI";

// VK bytes (360 bytes)
const VK_HEX = "e2f26dbea299f5223b646cb1fb33eadb059d9407559d7441dfd902e3a79a4d2dabb73dc17fbc13021e2471e0c08bd67d8401f52b73d6d07483794cad4778180e0c06f33bbc4c79a9cadef253a68084d382f17788f885c9afd176f7cb2f036789edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e1953e4f1664311bdc62b4509eb4e8e07f6008ce903d3497f7b0e95cb082a4dec11d9b87aa74e30aa03656c88b0ba942e1f6c3e50fb4c0234deceb0ca4786bad69d0400000000000000191f71d49c7ecfcc3643957f0d503d24e713cf91937a8a33b7c118a6afef44891ef0fa65bcfbe5a8f6a5a1bb098b6e508467a66a10af02338ce1560ff9609f1588d71006852b8f431fd5d3de34357325e41f3252748926d16c27ed7cb789478068d1e927470885642b8adcd4b38f20583984d85f9274e93b39f834daacf80b0b";

async function main() {
  try {
    // Get active address from sui client
    const activeAddress = execSync("sui client active-address", {
      encoding: "utf-8",
    }).trim();

    console.log("Creating privacy pool...");
    console.log("Sender:", activeAddress);
    console.log("Package:", PACKAGE_ID);

    const client = new SuiClient({ url: getFullnodeUrl("testnet") });

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

    const txBytes = await tx.build({ client });

    console.log("\nTransaction built successfully");
    console.log("TX bytes length:", txBytes.length);
    console.log("\nSigning and executing transaction...");

    // Execute using client
    const result = await client.dryRunTransactionBlock({
      transactionBlock: txBytes,
    });

    if (result.effects.status.status !== "success") {
      console.error("Dry run failed:", result.effects.status);
      process.exit(1);
    }

    console.log("Dry run successful! Now executing...");

    // Actually execute - need to use sui keytool for signing
    const txBase64 = Buffer.from(txBytes).toString("base64");
    const fs = await import("fs");
    fs.writeFileSync("/tmp/pool_tx_base64.txt", txBase64);

    console.log("\nTo complete, run:");
    console.log(`echo "${txBase64}" | sui client execute-combined-signed-tx --tx-bytes -`);
  } catch (err) {
    console.error("Error:", err.message);
    if (err.stdout) console.log(err.stdout.toString());
    if (err.stderr) console.error(err.stderr.toString());
    process.exit(1);
  }
}

main();
