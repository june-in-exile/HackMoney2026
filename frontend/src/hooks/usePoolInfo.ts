"use client";

import { useState, useEffect } from "react";
import { useSuiClient } from "@mysten/dapp-kit";
import { POOL_ID } from "@/lib/constants";

/**
 * Pool information from on-chain
 */
export interface PoolInfo {
  /** Token type (e.g., "0x2::sui::SUI") */
  tokenType: string;
  /** Pool balance in base units */
  balance: bigint;
}

/**
 * Hook to fetch pool information from blockchain
 *
 * @returns Pool info, loading state, and error
 */
export function usePoolInfo() {
  const client = useSuiClient();
  const [poolInfo, setPoolInfo] = useState<PoolInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function fetchPoolInfo() {
      try {
        setLoading(true);
        setError(null);

        // Fetch pool object with full content
        const poolObject = await client.getObject({
          id: POOL_ID,
          options: {
            showContent: true,
            showType: true,
          },
        });

        if (isCancelled) return;

        if (!poolObject.data) {
          throw new Error("Pool object not found");
        }

        // Extract token type from the Pool<T> type parameter
        const objectType = poolObject.data.type;
        if (!objectType) {
          throw new Error("Pool type not found");
        }

        // Parse type: "0x...::pool::Pool<0x2::sui::SUI>" -> "0x2::sui::SUI"
        const typeMatch = objectType.match(/<(.+)>/);
        const tokenType = typeMatch ? typeMatch[1] : "Unknown";

        // Extract pool balance and next_leaf_index from content
        if (
          poolObject.data.content?.dataType === "moveObject" &&
          poolObject.data.content.fields
        ) {
          const fields = poolObject.data.content.fields as any;

          // Balance is in the Balance<T> object
          const balance = BigInt(fields.balance || "0");

          setPoolInfo({
            tokenType,
            balance,
          });
        } else {
          throw new Error("Invalid pool content structure");
        }
      } catch (err) {
        if (!isCancelled) {
          console.error("[usePoolInfo] Error fetching pool info:", err);
          setError(err instanceof Error ? err.message : "Failed to fetch pool info");
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    fetchPoolInfo();

    return () => {
      isCancelled = true;
    };
  }, [client]);

  return {
    poolInfo,
    loading,
    error,
  };
}
