"use client";

import { useState } from "react";
import { truncateAddress, bigIntToHex } from "@/lib/utils";
import type { RailgunKeypair } from "@/hooks/useLocalKeypair";

interface KeypairSetupProps {
  keypair: RailgunKeypair | null;
  isLoading: boolean;
  onGenerate: () => Promise<RailgunKeypair>;
  onClear: () => void;
}

export function KeypairSetup({
  keypair,
  isLoading,
  onGenerate,
  onClear,
}: KeypairSetupProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await onGenerate();
    } catch (error) {
      console.error("Failed to generate keypair:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="card">
        <div className="animate-pulse">
          <div className="mb-2 h-5 w-32 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-4 w-48 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    );
  }

  if (!keypair) {
    return (
      <div className="card">
        <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
          Privacy Keypair
        </h2>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Generate a keypair to start using the privacy pool. This will be
          stored locally in your browser.
        </p>
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="btn-primary"
        >
          {isGenerating ? (
            <span className="flex items-center gap-2">
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
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
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Generating...
            </span>
          ) : (
            "Generate Keypair"
          )}
        </button>
        <p className="mt-3 text-xs text-yellow-600 dark:text-yellow-400">
          ⚠️ Demo only - not secure for real funds
        </p>
      </div>
    );
  }

  const mpkHex = bigIntToHex(keypair.masterPublicKey);

  return (
    <div className="card">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Privacy Keypair
        </h2>
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
          Active
        </span>
      </div>

      <div className="mb-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Master Public Key
        </p>
        <p className="font-mono text-sm text-gray-900 dark:text-white">
          {truncateAddress(mpkHex, 8)}
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="btn-secondary text-xs"
        >
          {showDetails ? "Hide" : "Show"} Details
        </button>
        <button onClick={onClear} className="btn-secondary text-xs text-red-600">
          Clear
        </button>
      </div>

      {showDetails && (
        <div className="mt-4 space-y-2 rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
          <div>
            <p className="text-xs text-gray-500">Spending Key</p>
            <p className="break-all font-mono text-xs text-gray-700 dark:text-gray-300">
              {bigIntToHex(keypair.spendingKey)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Nullifying Key</p>
            <p className="break-all font-mono text-xs text-gray-700 dark:text-gray-300">
              {bigIntToHex(keypair.nullifyingKey)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Master Public Key</p>
            <p className="break-all font-mono text-xs text-gray-700 dark:text-gray-300">
              {mpkHex}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
