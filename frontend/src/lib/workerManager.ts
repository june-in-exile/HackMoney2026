/**
 * Web Worker Manager
 *
 * Singleton pattern for managing note scan worker lifecycle.
 * Handles initialization, message routing, and cleanup.
 */

import type {
  WorkerRequest,
  WorkerResponse,
  SerializedNote,
  ScanNotesResponse,
  BatchDecryptResponse,
  ComputeNullifierResponse,
  BuildMerkleTreeResponse,
  GetMerkleProofResponse,
} from "@/workers/types";

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: { current: number; total: number; message: string; totalNotesInPool?: number }) => void;
};

class NoteScanWorkerManager {
  private worker: Worker | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private requestCounter = 0;

  /**
   * Initialize worker (call once at app startup)
   */
  initialize(): Promise<void> {
    if (this.isInitialized) {
      return Promise.resolve();
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      // SSR check
      if (typeof window === "undefined") {
        throw new Error("Workers not supported in SSR environment");
      }

      // Create worker using Next.js 16 compatible pattern
      this.worker = new Worker(
        new URL("../workers/noteScanWorker.ts", import.meta.url)
      );

      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        this.handleMessage(event.data);
      };

      this.worker.onerror = (error) => {
        this.rejectAllPending(new Error("Worker crashed"));
        this.initPromise = null; // Allow retry
      };

      // Initialize Poseidon in worker
      await this.sendRequest<void>({ type: "init" });
      this.isInitialized = true;
    })();

    return this.initPromise;
  }

  /**
   * Handle messages from worker
   */
  private handleMessage(response: WorkerResponse): void {
    switch (response.type) {
      case "init_complete": {
        const initRequest = this.pendingRequests.get("init");
        if (initRequest) {
          initRequest.resolve(true);
          this.pendingRequests.delete("init");
        }
        break;
      }

      case "scan_notes_result":
      case "batch_decrypt_result":
      case "compute_nullifier_result":
      case "build_merkle_tree_result":
      case "get_merkle_proof_result": {
        const request = this.pendingRequests.get(response.id);
        if (request) {
          request.resolve(response);
          this.pendingRequests.delete(response.id);
        }
        break;
      }

      case "error": {
        const errorRequest = this.pendingRequests.get(response.id || "");
        if (errorRequest) {
          errorRequest.reject(new Error(response.error));
          this.pendingRequests.delete(response.id || "");
        }
        break;
      }

      case "progress": {
        // Call progress callback if registered
        const request = this.pendingRequests.get(response.id);
        if (request?.onProgress) {
          request.onProgress({
            current: response.current,
            total: response.total,
            message: response.message,
            totalNotesInPool: response.totalNotesInPool, // Pass through immediately
          });
        }
        break;
      }
    }
  }

  /**
   * Send request to worker
   */
  private sendRequest<T>(
    request: WorkerRequest,
    onProgress?: (progress: {
      current: number;
      total: number;
      message: string;
      totalNotesInPool?: number;
    }) => void
  ): Promise<T> {
    if (!this.worker) {
      return Promise.reject(new Error("Worker not initialized"));
    }

    const id = "id" in request ? request.id : "init";

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject, onProgress });
      this.worker!.postMessage(request);

      // Timeout after 90s (allows for 2x 30s GraphQL queries + processing time)
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error("Request timeout after 90s"));
        }
      }, 90000);
    });
  }

  /**
   * Generate unique request ID
   */
  private generateId(): string {
    return `req_${Date.now()}_${++this.requestCounter}`;
  }

  /**
   * Public API: Scan notes from blockchain (GraphQL query + decrypt + Merkle tree)
   */
  async scanNotes(
    graphqlUrl: string,
    packageId: string,
    poolId: string,
    spendingKey: bigint,
    nullifyingKey: bigint,
    masterPublicKey: bigint,
    options?: {
      onProgress?: (progress: {
        current: number;
        total: number;
        message: string;
        totalNotesInPool?: number;
      }) => void;
    }
  ): Promise<{
    notes: Array<{
      note: SerializedNote;
      leafIndex: number;
      pathElements: bigint[];
      nullifier: bigint;
      txDigest: string;
    }>;
    totalNotesInPool?: number;
  }> {
    // Ensure worker is initialized before sending request
    await this.initialize();

    const response = await this.sendRequest<ScanNotesResponse>(
      {
        type: "scan_notes",
        id: this.generateId(),
        graphqlUrl,
        packageId,
        poolId,
        spendingKey: spendingKey.toString(),
        nullifyingKey: nullifyingKey.toString(),
        masterPublicKey: masterPublicKey.toString(),
      },
      options?.onProgress
    );

    const processedNotes = response.notes.map((n) => ({
      note: n.note,
      leafIndex: n.leafIndex,
      pathElements: n.pathElements.map((p) => BigInt(p)),
      nullifier: BigInt(n.nullifier),
      txDigest: n.txDigest,
    }));

    return {
      notes: processedNotes,
      totalNotesInPool: response.totalNotesInPool,
    };
  }

  /**
   * Public API: Batch decrypt multiple encrypted notes
   */
  async batchDecrypt(
    notes: Array<{ noteId: string; encryptedNote: number[] }>,
    spendingKey: bigint,
    masterPublicKey: bigint
  ): Promise<Array<{ noteId: string; note: SerializedNote | null }>> {
    await this.initialize();

    const response = await this.sendRequest<BatchDecryptResponse>({
      type: "batch_decrypt",
      id: this.generateId(),
      notes,
      spendingKey: spendingKey.toString(),
      masterPublicKey: masterPublicKey.toString(),
    });

    return response.results;
  }

  /**
   * Public API: Compute nullifier
   */
  async computeNullifier(
    nullifyingKey: bigint,
    leafIndex: number
  ): Promise<bigint> {
    await this.initialize();

    const response = await this.sendRequest<ComputeNullifierResponse>({
      type: "compute_nullifier",
      id: this.generateId(),
      nullifyingKey: nullifyingKey.toString(),
      leafIndex,
    });

    return BigInt(response.nullifier);
  }

  /**
   * Public API: Build Merkle tree
   */
  async buildMerkleTree(
    commitments: Array<{ commitment: bigint; leafIndex: number }>
  ): Promise<string> {
    await this.initialize();

    const id = this.generateId();

    const response = await this.sendRequest<BuildMerkleTreeResponse>({
      type: "build_merkle_tree",
      id,
      commitments: commitments.map((c) => ({
        commitment: c.commitment.toString(),
        leafIndex: c.leafIndex,
      })),
    });

    return response.treeId;
  }

  /**
   * Public API: Get Merkle proof
   */
  async getMerkleProof(
    treeId: string,
    leafIndex: number
  ): Promise<bigint[]> {
    await this.initialize();

    const response = await this.sendRequest<GetMerkleProofResponse>({
      type: "get_merkle_proof",
      id: this.generateId(),
      treeId,
      leafIndex,
    });

    return response.pathElements.map((p) => BigInt(p));
  }

  /**
   * Reject all pending requests
   */
  private rejectAllPending(error: Error): void {
    for (const request of this.pendingRequests.values()) {
      request.reject(error);
    }
    this.pendingRequests.clear();
  }

  /**
   * Terminate worker
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
      this.rejectAllPending(new Error("Worker terminated"));
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let workerManager: NoteScanWorkerManager | null = null;

/**
 * Get or create worker manager singleton
 */
export function getWorkerManager(): NoteScanWorkerManager {
  if (!workerManager) {
    workerManager = new NoteScanWorkerManager();
  }
  return workerManager;
}

/**
 * Initialize worker (call once in app startup)
 */
export async function initializeWorker(): Promise<void> {
  const manager = getWorkerManager();
  await manager.initialize();
}
