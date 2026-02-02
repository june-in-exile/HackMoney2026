/**
 * Global Poseidon initialization singleton
 *
 * Wraps the SDK's initPoseidon() to ensure it's called only once across
 * the entire app, preventing WebAssembly memory allocation errors.
 *
 * Uses globalThis to ensure singleton across all module contexts.
 */

import { initPoseidon as sdkInitPoseidon } from "@octopus/sdk";

// Use globalThis to ensure singleton across all bundles/contexts
declare global {
  var __OCTOPUS_POSEIDON_INITIALIZED__: boolean | undefined;
  var __OCTOPUS_POSEIDON_INIT_PROMISE__: Promise<void> | undefined;
}

/**
 * Initialize Poseidon singleton (safe to call multiple times)
 *
 * Wraps the SDK's initPoseidon() to ensure it's only called once.
 * All concurrent calls will wait for the same initialization to complete.
 */
export async function initPoseidon(): Promise<void> {
  // If already initialized, return immediately
  if (globalThis.__OCTOPUS_POSEIDON_INITIALIZED__) {
    console.log("[Poseidon] Already initialized, skipping");
    return;
  }

  // If initialization in progress, wait for it
  if (globalThis.__OCTOPUS_POSEIDON_INIT_PROMISE__) {
    console.log("[Poseidon] Initialization in progress, waiting...");
    return globalThis.__OCTOPUS_POSEIDON_INIT_PROMISE__;
  }

  // Start new initialization
  console.log("[Poseidon] Starting initialization...");
  globalThis.__OCTOPUS_POSEIDON_INIT_PROMISE__ = (async () => {
    try {
      // Use SDK's built-in initialization
      await sdkInitPoseidon();
      globalThis.__OCTOPUS_POSEIDON_INITIALIZED__ = true;
      console.log("[Poseidon] Initialization complete");
    } catch (error) {
      // Reset on error so retry is possible
      globalThis.__OCTOPUS_POSEIDON_INIT_PROMISE__ = undefined;
      globalThis.__OCTOPUS_POSEIDON_INITIALIZED__ = undefined;
      console.error("[Poseidon] Initialization failed:", error);
      throw error;
    }
  })();

  return globalThis.__OCTOPUS_POSEIDON_INIT_PROMISE__;
}

/**
 * Check if Poseidon is ready
 */
export function isPoseidonReady(): boolean {
  return globalThis.__OCTOPUS_POSEIDON_INITIALIZED__ === true;
}

/**
 * Reset Poseidon instance (for testing only)
 */
export function resetPoseidon(): void {
  globalThis.__OCTOPUS_POSEIDON_INITIALIZED__ = undefined;
  globalThis.__OCTOPUS_POSEIDON_INIT_PROMISE__ = undefined;
}
