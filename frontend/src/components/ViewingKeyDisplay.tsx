"use client";

import { useState, useMemo } from "react";
import { exportViewingPublicKey } from "@octopus/sdk";

interface ViewingKeyDisplayProps {
  spendingKey: bigint;
}

export function ViewingKeyDisplay({ spendingKey }: ViewingKeyDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const viewingKeyHex = useMemo(
    () => exportViewingPublicKey(spendingKey),
    [spendingKey]
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(viewingKeyHex);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const displayKey = showKey
    ? viewingKeyHex
    : `${viewingKeyHex.slice(0, 10)}...${viewingKeyHex.slice(-10)}`;

  return (
    <div className="mt-4 p-4 border border-gray-700 rounded-lg bg-gray-800/50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-cyber-blue">
          Viewing Public Key
        </h3>
        <button
          onClick={() => setShowKey(!showKey)}
          className="text-xs text-gray-400 hover:text-cyber-blue transition-colors"
        >
          {showKey ? "Hide" : "Show"} Full Key
        </button>
      </div>

      <div className="bg-black/50 rounded p-3 mb-3">
        <code className="text-xs text-gray-300 font-mono break-all">
          {displayKey}
        </code>
      </div>

      <div className="flex items-start gap-3 mb-3">
        <button
          onClick={handleCopy}
          className="btn-secondary text-xs py-2 px-4"
          disabled={copied}
        >
          {copied ? "✓ Copied!" : "Copy Key"}
        </button>
      </div>

      <div className="text-xs text-gray-400 space-y-2">
        <p className="flex items-start gap-2">
          <span>
            Share this key with senders along with your Master Public Key (MPK).
          </span>
        </p>
      </div>
    </div>
  );
}
