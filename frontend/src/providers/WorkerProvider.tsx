"use client";

import { useEffect } from "react";
import { initializeWorker } from "@/lib/workerManager";

/**
 * WorkerProvider
 *
 * Initializes the Web Worker for note scanning on app mount.
 * The worker handles all CPU-intensive cryptographic operations
 * off the main thread, keeping the UI responsive.
 */
export function WorkerProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Initialize worker on app mount
    initializeWorker().catch((err) => {
      console.error("[WorkerProvider] Failed to initialize worker:", err);
      // Graceful degradation: app continues to work without worker
      // but note scanning may be slower
    });
  }, []);

  return <>{children}</>;
}
