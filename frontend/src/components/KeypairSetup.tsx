"use client";

import { useState } from "react";
import { truncateAddress, bigIntToHex } from "@/lib/utils";
import type { OctopusKeypair } from "@/hooks/useLocalKeypair";
import type { StoredKeypair } from "@/lib/keypairStorage";

interface KeypairSetupProps {
  keypair: OctopusKeypair | null;
  isLoading: boolean;
  savedKeypairs: StoredKeypair[];
  onGenerate: () => Promise<OctopusKeypair>;
  onSelect: (masterPublicKey: string) => void;
  onClear: () => void;
  onRemove: (masterPublicKey: string) => void;
}

export function KeypairSetup({
  keypair,
  isLoading,
  savedKeypairs,
  onGenerate,
  onSelect,
  onClear,
  onRemove,
}: KeypairSetupProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showSavedKeypairs, setShowSavedKeypairs] = useState(false);

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

  if (!keypair) {
    const hasSavedKeypairs = savedKeypairs.length > 0;

    return (
      <div className="card relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_48%,#00d9ff_49%,#00d9ff_51%,transparent_52%)] bg-[length:20px_20px]" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-5 bg-gradient-to-b from-cyber-blue to-transparent" />
            <h2 className="text-sm font-black uppercase tracking-wider text-cyber-blue">
              Privacy Keypair
            </h2>
          </div>
          <p className="mb-6 text-xs text-gray-400 font-mono leading-relaxed">
            // Generate keypair to initialize privacy protocol
            <br />
            // Stored locally in browser storage
          </p>

          {hasSavedKeypairs && (
            <div className="mb-4">
              <button
                onClick={() => setShowSavedKeypairs(!showSavedKeypairs)}
                className="btn-secondary w-full text-xs flex items-center justify-between"
              >
                <span>
                  {showSavedKeypairs ? "▼" : "►"} LOAD EXISTING KEYPAIR
                </span>
                <span className="text-cyber-blue font-bold">
                  {savedKeypairs.length}
                </span>
              </button>

              {showSavedKeypairs && (
                <div className="mt-2 space-y-2 max-h-48 overflow-y-auto p-2 bg-black/30 border border-gray-800 clip-corner">
                  {savedKeypairs.map((kp, index) => {
                    const mpkShort = truncateAddress(kp.masterPublicKey, 6);
                    const date = new Date(kp.timestamp);
                    const dateStr = date.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    });

                    return (
                      <div
                        key={kp.masterPublicKey}
                        className="group flex items-center gap-2 p-2 bg-gray-900/50 border border-gray-800 hover:border-cyber-blue transition-colors clip-corner"
                      >
                        <button
                          onClick={() => {
                            console.log('[KeypairSetup] Selecting keypair:', kp.masterPublicKey.slice(0, 16) + '...');
                            onSelect(kp.masterPublicKey);
                            setShowSavedKeypairs(false);
                          }}
                          className="flex-1 text-left"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] text-gray-500 font-mono">
                              #{index + 1}
                            </span>
                            <span className="text-xs text-cyber-blue font-mono">
                              {mpkShort}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-600 font-mono">
                            {dateStr}
                          </p>
                        </button>
                        <button
                          onClick={() => {
                            if (
                              confirm(
                                `Delete keypair ${mpkShort}? This cannot be undone.`
                              )
                            ) {
                              onRemove(kp.masterPublicKey);
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-400 text-xs px-2"
                          title="Delete keypair"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="my-4 flex items-center gap-3">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent" />
                <span className="text-[10px] text-gray-600 font-mono uppercase">
                  OR
                </span>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent" />
              </div>
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={isGenerating || isLoading}
            className="btn-primary w-full"
          >
            {isGenerating ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                GENERATING...
              </span>
            ) : (
              "GENERATE NEW KEYPAIR"
            )}
          </button>
          <div className="mt-4 flex items-start gap-2 p-3 border border-yellow-600/30 bg-yellow-900/10 clip-corner">
            <span className="text-yellow-500 text-sm">⚠</span>
            <p className="text-[10px] text-yellow-500 font-mono uppercase tracking-wide">
              Demo Mode - Not Secure for Production
            </p>
          </div>
        </div>
      </div>
    );
  }

  const mpkHex = bigIntToHex(keypair.masterPublicKey);

  return (
    <div className="card relative overflow-hidden group">
      {/* Active indicator glow */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-cyber-blue/10 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="relative z-10">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 bg-gradient-to-b from-cyber-blue to-transparent" />
            <h2 className="text-sm font-black uppercase tracking-wider text-cyber-blue">
              Privacy Keypair
            </h2>
          </div>
          <div className="flex items-center gap-2 px-2 py-1 border border-green-600 bg-green-900/20 clip-corner">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold text-green-500 uppercase tracking-widest font-mono">
              Active
            </span>
          </div>
        </div>

        <div className="mb-4 p-3 bg-black/30 border border-gray-800 clip-corner">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-mono">
            Master Public Key
          </p>
          <p className="font-mono text-sm text-cyber-blue">
            {truncateAddress(mpkHex, 8)}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="btn-secondary flex-1 text-xs"
          >
            {showDetails ? "◄ HIDE" : "► SHOW"} DETAILS
          </button>
          <button
            onClick={onClear}
            className="btn-secondary text-xs border-red-600/50 text-red-500 hover:border-red-500 hover:text-red-400"
          >
            ✕ CLEAR
          </button>
        </div>

        {showDetails && (
          <div className="mt-4 space-y-3 p-4 bg-black/50 border border-gray-800 clip-corner">
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-mono">
                Spending Key
              </p>
              <p className="break-all font-mono text-xs text-gray-400">
                {bigIntToHex(keypair.spendingKey)}
              </p>
            </div>
            <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent" />
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-mono">
                Nullifying Key
              </p>
              <p className="break-all font-mono text-xs text-gray-400">
                {bigIntToHex(keypair.nullifyingKey)}
              </p>
            </div>
            <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent" />
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-mono">
                Master Public Key
              </p>
              <p className="break-all font-mono text-xs text-gray-400">
                {mpkHex}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
