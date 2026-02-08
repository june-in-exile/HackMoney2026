"use client";

import { useState, useEffect, useRef } from "react";
import { truncateAddress, bigIntToHex } from "@/lib/utils";
import type { OctopusKeypair } from "@/hooks/useLocalKeypair";
import type { StoredKeypair } from "@/lib/keypairStorage";
import { exportViewingPublicKey } from "@june_zk/octopus-sdk";
import { SecurityWarningModal } from "@/components/SecurityWarningModal";

interface KeypairSetupProps {
  keypair: OctopusKeypair | null;
  isLoading: boolean;
  savedKeypairs: StoredKeypair[];
  onGenerate: () => Promise<OctopusKeypair>;
  onSelect: (masterPublicKey: string) => void;
  onClear: () => void;
  onRemove: (masterPublicKey: string) => void;
  onRestore: (spendingKeyHex: string) => Promise<OctopusKeypair>;
  onRename: (masterPublicKey: string, label: string) => void;
}

export function KeypairSetup({
  keypair,
  isLoading,
  savedKeypairs,
  onGenerate,
  onSelect,
  onClear,
  onRemove,
  onRestore,
  onRename,
}: KeypairSetupProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [isEditingAlias, setIsEditingAlias] = useState(false);
  const [aliasInput, setAliasInput] = useState("");
  const [showSavedKeypairs, setShowSavedKeypairs] = useState(false);
  const [copiedMPK, setCopiedMPK] = useState(false);
  const [copiedVPK, setCopiedVPK] = useState(false);
  const [copiedSK, setCopiedSK] = useState(false);
  const [copiedNK, setCopiedNK] = useState(false);
  const [showFullMPK, setShowFullMPK] = useState(false);
  const [showFullVPK, setShowFullVPK] = useState(false);
  const [showRestoreInput, setShowRestoreInput] = useState(false);
  const [spendingKeyInput, setSpendingKeyInput] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [showSecurityWarning, setShowSecurityWarning] = useState(false);

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

  const handleRestore = async () => {
    if (!spendingKeyInput.trim()) {
      setRestoreError("Please enter a spending key");
      return;
    }

    setIsRestoring(true);
    setRestoreError(null);

    try {
      // Validate hex format
      const cleanInput = spendingKeyInput.trim().startsWith("0x")
        ? spendingKeyInput.trim()
        : `0x${spendingKeyInput.trim()}`;

      if (!/^0x[0-9a-fA-F]+$/.test(cleanInput)) {
        throw new Error("Invalid hex format");
      }

      await onRestore(cleanInput);

      // Success - clear input and hide form
      setSpendingKeyInput("");
      setShowRestoreInput(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to restore keypair";
      setRestoreError(errorMessage);
      console.error("Failed to restore keypair:", error);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleCopyMPK = async (mpkHex: string) => {
    try {
      await navigator.clipboard.writeText(mpkHex);
      setCopiedMPK(true);
      setTimeout(() => setCopiedMPK(false), 2000);
    } catch (error) {
      console.error("Failed to copy MPK:", error);
    }
  };

  const handleCopyVPK = async (vpkHex: string) => {
    try {
      await navigator.clipboard.writeText(vpkHex);
      setCopiedVPK(true);
      setTimeout(() => setCopiedVPK(false), 2000);
    } catch (error) {
      console.error("Failed to copy VPK:", error);
    }
  };

  const handleCopySK = async (skHex: string) => {
    try {
      await navigator.clipboard.writeText(skHex);
      setCopiedSK(true);
      setTimeout(() => setCopiedSK(false), 2000);
    } catch (error) {
      console.error("Failed to copy SK:", error);
    }
  };

  const handleCopyNK = async (nkHex: string) => {
    try {
      await navigator.clipboard.writeText(nkHex);
      setCopiedNK(true);
      setTimeout(() => setCopiedNK(false), 2000);
    } catch (error) {
      console.error("Failed to copy NK:", error);
    }
  };

  const handleSaveAlias = (mpkHex: string) => {
    onRename(mpkHex, aliasInput.trim());
    setIsEditingAlias(false);
  };

  const handleToggleSecrets = () => {
    if (!showSecrets) {
      // Show custom security warning modal
      setShowSecurityWarning(true);
    } else {
      setShowSecrets(false);
    }
  };

  const handleConfirmSecurityWarning = () => {
    setShowSecurityWarning(false);
    setShowSecrets(true);
  };

  const handleCancelSecurityWarning = () => {
    setShowSecurityWarning(false);
  };

  // Auto-hide secrets after 10 seconds
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showSecrets) {
      timer = setTimeout(() => {
        setShowSecrets(false);
      }, 10000); // 10 seconds
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [showSecrets]);

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
          {hasSavedKeypairs && (
            <div className="mb-4">
              <button
                onClick={() => setShowSavedKeypairs(!showSavedKeypairs)}
                className="btn-action w-full text-xs flex items-center justify-between group"
              >
                <span>
                  {showSavedKeypairs ? "▼" : "►"} LOAD EXISTING KEYPAIR
                </span>
                <span className="font-bold">
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
                            onSelect(kp.masterPublicKey);
                            setShowSavedKeypairs(false);
                          }}
                          className="flex-1 text-left"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] text-gray-500 font-mono">
                              #{index + 1}
                            </span>
                            {kp.label ? (
                              <span className="text-xs text-cyber-blue font-mono">
                                {kp.label}
                              </span>
                            ) : (
                              <span className="text-xs text-cyber-blue font-mono">
                                {mpkShort}
                              </span>
                            )}
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
            </div>
          )}

          {/* OR Divider (only show if there are saved keypairs) */}
          {hasSavedKeypairs && (
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent" />
              <span className="text-xs text-gray-600 font-mono">OR</span>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent" />
            </div>
          )}

          {/* Restore from Spending Key */}
          <div className="mb-4">
            <button
              onClick={() => setShowRestoreInput(!showRestoreInput)}
              className="btn-action w-full text-xs flex items-center justify-between"
            >
              <span>
                {showRestoreInput ? "▼" : "►"} RESTORE FROM SPENDING KEY
              </span>
            </button>

            {showRestoreInput && (
              <div className="mt-3 space-y-3 p-4 bg-black/30 border border-gray-800 clip-corner">
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-2 font-mono">
                    Spending Key (Hex)
                  </label>
                  <input
                    type="text"
                    value={spendingKeyInput}
                    onChange={(e) => {
                      setSpendingKeyInput(e.target.value);
                      setRestoreError(null);
                    }}
                    placeholder="0x..."
                    className="w-full px-3 py-2 bg-gray-900/50 border border-gray-700 text-gray-300 text-xs font-mono focus:border-cyber-blue focus:outline-none transition-colors"
                    disabled={isRestoring}
                  />
                </div>

                {restoreError && (
                  <div className="p-2 border border-red-600/30 bg-red-900/10 clip-corner">
                    <p className="text-[10px] text-red-500 font-mono">
                      ⚠ {restoreError}
                    </p>
                  </div>
                )}

                <button
                  onClick={handleRestore}
                  disabled={isRestoring || !spendingKeyInput.trim()}
                  className="btn-primary w-full text-xs"
                >
                  {isRestoring ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg
                        className="h-3 w-3 animate-spin"
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
                      RESTORING...
                    </span>
                  ) : (
                    "RESTORE KEYPAIR"
                  )}
                </button>
              </div>
            )}
          </div>

          {/* OR Divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent" />
            <span className="text-xs text-gray-600 font-mono">OR</span>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent" />
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating || isLoading}
            className="btn-action w-full text-xs flex items-center justify-between"
          >
            {isGenerating ? (
              <span className="flex items-center gap-2">
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
              <span>► GENERATE NEW KEYPAIR</span>
            )}
          </button>
        </div>
      </div>
    );
  }

  const mpkHex = bigIntToHex(keypair.masterPublicKey);
  const vpkHex = exportViewingPublicKey(keypair.spendingKey);
  const activeStored = savedKeypairs.find((kp) => kp.masterPublicKey === mpkHex);
  const currentLabel = activeStored?.label ?? "";

  const displayMPK = showFullMPK
    ? mpkHex
    : truncateAddress(mpkHex, 8);
  const displayVPK = showFullVPK
    ? vpkHex
    : `${vpkHex.slice(0, 10)}...${vpkHex.slice(-10)}`;

  return (
    <div className="card relative overflow-hidden group">
      {/* Active indicator glow */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-cyber-blue/10 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="relative z-10">
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-1 h-5 bg-gradient-to-b from-cyber-blue to-transparent" />
              <h2 className="text-sm font-black uppercase tracking-wider text-cyber-blue">
                Privacy Keypair
              </h2>
            </div>
            <button
              onClick={onClear}
              className="p-1.5 text-red-500 hover:text-red-400 transition-colors border border-red-600 hover:border-red-500 clip-corner"
              title="Clear keypair"
            >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
          </div>

          {/* Alias / Name */}
          {isEditingAlias ? (
            <div className="flex items-center gap-2 mt-2">
              <input
                type="text"
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveAlias(mpkHex);
                  if (e.key === "Escape") setIsEditingAlias(false);
                }}
                placeholder="Enter alias..."
                autoFocus
                className="flex-1 px-2 py-1 bg-gray-900/50 border border-cyber-blue text-gray-300 text-xs font-mono focus:outline-none"
              />
              <button onClick={() => handleSaveAlias(mpkHex)} className="btn-secondary text-[10px] py-1 px-2">SAVE</button>
              <button onClick={() => setIsEditingAlias(false)} className="text-gray-500 hover:text-gray-300 text-xs">✕</button>
            </div>
          ) : (
            <button
              onClick={() => { setAliasInput(currentLabel); setIsEditingAlias(true); }}
              className="mt-1 text-[10px] text-gray-500 hover:text-gray-300 font-mono transition-colors"
            >
              {currentLabel ? `✎ ${currentLabel}` : "✎ add alias"}
            </button>
          )}
        </div>

        {/* Master Public Key */}
        <div className="mb-3 p-4 border border-gray-700 bg-gray-800/50 clip-corner">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-cyber-blue">
              Master Public Key (MPK)
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => setShowFullMPK(!showFullMPK)}
                className="btn-secondary text-xs py-2 px-4"
              >
                {showFullMPK ? "HIDE" : "SHOW"}
              </button>
              <button
                onClick={() => handleCopyMPK(mpkHex)}
                className="btn-secondary text-xs py-2 px-4 min-w-[68px]"
                disabled={copiedMPK}
              >
                {copiedMPK ? "✓" : "COPY"}
              </button>
            </div>
          </div>
          <div className="bg-black/50 rounded p-3">
            <code className="text-xs text-gray-300 font-mono break-all">
              {displayMPK}
            </code>
          </div>
        </div>

        {/* Viewing Public Key */}
        <div className="mb-4 p-4 border border-gray-700 bg-gray-800/50 clip-corner">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-cyber-blue">
              Viewing Public Key (VPK)
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => setShowFullVPK(!showFullVPK)}
                className="btn-secondary text-xs py-2 px-4"
              >
                {showFullVPK ? "HIDE" : "SHOW"}
              </button>
              <button
                onClick={() => handleCopyVPK(vpkHex)}
                className="btn-secondary text-xs py-2 px-4 min-w-[68px]"
                disabled={copiedVPK}
              >
                {copiedVPK ? "✓" : "COPY"}
              </button>
            </div>
          </div>
          <div className="bg-black/50 rounded p-3 mb-3">
            <code className="text-xs text-gray-300 font-mono break-all">
              {displayVPK}
            </code>
          </div>
        </div>

        <button
          onClick={handleToggleSecrets}
          className="btn-secondary w-full text-xs relative overflow-hidden hover:!border-yellow-500 hover:!text-yellow-500"
        >
          {/* Progress bar background - animates when secrets are shown */}
          {showSecrets && (
            <div
              className="absolute inset-0 bg-gradient-to-r from-purple-400/50 to-purple-500/60"
              style={{
                animation: "progressFill 10s linear forwards",
                zIndex: 0,
              }}
            />
          )}
          <span className="relative z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            {showSecrets ? "▲ HIDE" : "▼ SHOW"} SECRETS
          </span>
        </button>

        <div
          className={`overflow-hidden transition-all duration-500 ease-out ${
            showSecrets ? "max-h-96 opacity-100 mt-4" : "max-h-0 opacity-0 mt-0"
          }`}
        >
          <div className="space-y-3 p-4 bg-black/30 border border-gray-800 clip-corner">
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-mono">
                  Spending Key
                </p>
                <button
                  onClick={() => handleCopySK(bigIntToHex(keypair.spendingKey))}
                  className="btn-secondary text-[10px] py-1 px-2 min-w-[42px]"
                  disabled={copiedSK}
                >
                  {copiedSK ? "✓" : "COPY"}
                </button>
              </div>
              <p className="break-all font-mono text-xs text-gray-400">
                {bigIntToHex(keypair.spendingKey)}
              </p>
            </div>
            <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent" />
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-mono">
                  Nullifying Key
                </p>
                <button
                  onClick={() => handleCopyNK(bigIntToHex(keypair.nullifyingKey))}
                  className="btn-secondary text-[10px] py-1 px-2 min-w-[42px]"
                  disabled={copiedNK}
                >
                  {copiedNK ? "✓" : "COPY"}
                </button>
              </div>
              <p className="break-all font-mono text-xs text-gray-400">
                {bigIntToHex(keypair.nullifyingKey)}
              </p>
            </div>
            <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent" />
          </div>
        </div>
      </div>

      {/* Security Warning Modal */}
      <SecurityWarningModal
        isOpen={showSecurityWarning}
        onConfirm={handleConfirmSecurityWarning}
        onCancel={handleCancelSecurityWarning}
      />
    </div>
  );
}
