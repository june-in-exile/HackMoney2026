"use client";

import { useCurrentAccount } from "@mysten/dapp-kit";
import { formatSui } from "@/lib/utils";
import { DEMO_MODE } from "@/lib/constants";

interface BalanceCardProps {
  shieldedBalance: bigint;
  noteCount: number;
  isLoading?: boolean;
}

export function BalanceCard({
  shieldedBalance,
  noteCount,
  isLoading,
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
        {DEMO_MODE && (
          <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
            Demo
          </span>
        )}
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
