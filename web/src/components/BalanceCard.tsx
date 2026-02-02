"use client";

import { useCurrentAccount } from "@mysten/dapp-kit";
import { formatSui } from "@/lib/utils";
import { DEMO_MODE } from "@/lib/constants";

interface BalanceCardProps {
  shieldedBalance: bigint;
  noteCount: number;
  isLoading?: boolean;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}

export function BalanceCard({
  shieldedBalance,
  noteCount,
  isLoading,
  isRefreshing,
  onRefresh,
}: BalanceCardProps) {
  const account = useCurrentAccount();

  if (!account) {
    return (
      <div className="card text-center">
        <p className="text-gray-500 font-mono text-sm">
          // Connect wallet to view balance
        </p>
      </div>
    );
  }

  return (
    <div className="card relative overflow-hidden group">
      {/* Background glow effect on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-cyber-blue/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="relative z-10">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 bg-gradient-to-b from-cyber-blue to-transparent" />
            <h2 className="text-sm font-black uppercase tracking-wider text-cyber-blue">
              Shielded Balance
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-1.5 text-gray-500 hover:text-cyber-blue transition-colors border border-gray-800 hover:border-cyber-blue clip-corner"
                title="Refresh balance"
              >
                <svg
                  className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            )}
            {DEMO_MODE && (
              <span className="px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase border border-yellow-600 text-yellow-500 clip-corner font-mono">
                DEMO
              </span>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="animate-pulse">
            <div className="h-12 w-40 bg-gray-800 clip-corner" />
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-baseline gap-3">
              <span className={`text-5xl font-black text-cyber-blue text-cyber tabular-nums ${isRefreshing ? "opacity-60" : ""}`}>
                {formatSui(shieldedBalance)}
              </span>
              <span className="text-xl text-gray-500 font-mono uppercase tracking-wider">
                SUI
              </span>
              {isRefreshing && (
                <span className="text-xs text-cyber-blue font-mono animate-pulse">
                  UPDATING...
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-gradient-to-r from-gray-800 to-transparent" />
              <p className="text-xs text-gray-500 font-mono">
                [{noteCount} {noteCount === 1 ? "NOTE" : "NOTES"}]
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
