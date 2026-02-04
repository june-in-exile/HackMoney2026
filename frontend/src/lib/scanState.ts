/**
 * Scan State Management
 *
 * Handles persistent storage of scan progress for incremental scanning.
 * Stores last cursor positions, cached commitments, and last scan time
 * in localStorage keyed by (poolId, masterPublicKey).
 */

export interface ScanState {
  lastShieldCursor: string | null;
  lastTransferCursor: string | null;
  lastScanTime: number;
  cachedCommitments: Array<{
    commitment: string; // BigInt as string
    leafIndex: number;
  }>;
  version: number; // Schema version for future migrations
}

/**
 * Generate localStorage key for scan state
 */
function getScanStateKey(poolId: string, masterPublicKey: bigint): string {
  return `octopus_scan_state_${poolId}_${masterPublicKey.toString()}`;
}

/**
 * Load scan state from localStorage
 * Returns null if no state exists or if state is invalid
 */
export function loadScanState(
  poolId: string,
  masterPublicKey: bigint
): ScanState | null {
  try {
    const key = getScanStateKey(poolId, masterPublicKey);
    const stored = localStorage.getItem(key);

    if (!stored) {
      return null;
    }

    const state = JSON.parse(stored) as ScanState;

    // Validate structure
    if (
      typeof state.lastScanTime !== "number" ||
      !Array.isArray(state.cachedCommitments)
    ) {
      console.warn("[scanState] Invalid scan state structure, ignoring");
      return null;
    }

    console.log(`[scanState] Loaded state:`, {
      lastShieldCursor: state.lastShieldCursor?.substring(0, 20) + "...",
      lastTransferCursor: state.lastTransferCursor?.substring(0, 20) + "...",
      lastScanTime: new Date(state.lastScanTime).toISOString(),
      cachedCommitments: state.cachedCommitments.length,
    });

    return state;
  } catch (err) {
    console.error("[scanState] Failed to load scan state:", err);
    return null;
  }
}

/**
 * Save scan state to localStorage
 */
export function saveScanState(
  poolId: string,
  masterPublicKey: bigint,
  state: ScanState
): void {
  try {
    const key = getScanStateKey(poolId, masterPublicKey);
    localStorage.setItem(key, JSON.stringify(state));

    console.log(`[scanState] Saved state:`, {
      lastShieldCursor: state.lastShieldCursor?.substring(0, 20) + "...",
      lastTransferCursor: state.lastTransferCursor?.substring(0, 20) + "...",
      lastScanTime: new Date(state.lastScanTime).toISOString(),
      cachedCommitments: state.cachedCommitments.length,
    });
  } catch (err) {
    console.error("[scanState] Failed to save scan state:", err);
  }
}

/**
 * Clear scan state (useful for testing or forced full rescan)
 */
export function clearScanState(
  poolId: string,
  masterPublicKey: bigint
): void {
  try {
    const key = getScanStateKey(poolId, masterPublicKey);
    localStorage.removeItem(key);
    console.log("[scanState] Cleared scan state");
  } catch (err) {
    console.error("[scanState] Failed to clear scan state:", err);
  }
}

/**
 * Create initial empty scan state
 */
export function createEmptyScanState(): ScanState {
  return {
    lastShieldCursor: null,
    lastTransferCursor: null,
    lastScanTime: 0,
    cachedCommitments: [],
    version: 1,
  };
}
