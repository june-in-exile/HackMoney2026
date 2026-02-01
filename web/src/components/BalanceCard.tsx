"use client";

import { useCurrentAccount } from "@mysten/dapp-kit";
import { formatSui } from "@/lib/utils";
import { DEMO_MODE } from "@/lib/constants";

interface BalanceCardProps {
  shieldedBalance: bigint;
  noteCount: number;
  isLoading?: boolean;
  onRefresh?: () => void;
}

export function BalanceCard({
  shieldedBalance,
  noteCount,
  isLoading,
  onRefresh,
}: BalanceCardProps) {
  const account = useCurrentAccount();

  if (!account) {
    return (
      <div className="card text-center">
        <p className="text-gray-500 dark:text-gray-400">
          Connect wallet to view balance
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Shielded Balance
        </h2>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 dark:hover:bg-gray-700 dark:hover:text-gray-300"
              title="Refresh balance"
            >
              <svg
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          )}
          {DEMO_MODE && (
            <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
              Demo
            </span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="animate-pulse">
          <div className="h-10 w-32 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-baseline gap-2">
            <span className="text-4xl font-bold text-gray-900 dark:text-white">
              {formatSui(shieldedBalance)}
            </span>
            <span className="text-lg text-gray-500 dark:text-gray-400">
              SUI
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {noteCount} shielded {noteCount === 1 ? "note" : "notes"}
          </p>
        </>
      )}
    </div>
  );
}
