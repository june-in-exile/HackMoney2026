"use client";

import { useCurrentAccount } from "@mysten/dapp-kit";
import { formatSui } from "@/lib/utils";

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
            <h2 className="text-sm font-black tracking-wider text-cyber-blue">
              SHIELDED BALANCE
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
          </div>
        </div>

        {isLoading ? (
          <div className="animate-pulse">
            <div className="h-12 w-40 bg-gray-800 clip-corner" />
          </div>
        ) : (
          <>
            <div className="mb-3 relative min-h-[60px]">
              {!isRefreshing && (
                <div className="flex items-baseline gap-3">
                  <span className="text-5xl font-black text-cyber-blue text-cyber tabular-nums">
                    {formatSui(shieldedBalance)}
                  </span>
                  <span className="text-xl text-gray-500 font-mono uppercase tracking-wider">
                    SUI
                  </span>
                </div>
              )}
              {isRefreshing && (
                <div className="flex items-center gap-2 pt-1">
                  <svg
                    className="animate-spin h-8 w-8 text-cyber-blue flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span className="text-sm text-cyber-blue font-mono font-bold animate-pulse">
                    SEARCHING FOR NOTES UNDER THE SEA...
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 min-h-[20px]">
              {!isRefreshing && (
                <>
                  <div className="h-px flex-1 bg-gradient-to-r from-gray-800 to-transparent" />
                  <p className="text-xs text-gray-500 font-mono">
                    [{noteCount} {noteCount === 1 ? "NOTE" : "NOTES"}]
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
