"use client";

import { useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { cn, parseSui, formatSui } from "@/lib/utils";
import { PACKAGE_ID, POOL_ID, SUI_COIN_TYPE, DEMO_MODE } from "@/lib/constants";
import type { RailgunKeypair } from "@/hooks/useLocalKeypair";

interface ShieldFormProps {
  keypair: RailgunKeypair | null;
  onSuccess?: () => void;
}

export function ShieldForm({ keypair, onSuccess }: ShieldFormProps) {
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!account) {
      setError("Please connect your wallet");
      return;
    }

    if (!keypair) {
      setError("Please generate a keypair first");
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    setIsSubmitting(true);

    try {
      const amountMist = parseSui(amount);

      if (DEMO_MODE) {
        // Simulate shield in demo mode
        await new Promise((resolve) => setTimeout(resolve, 1500));
        setSuccess(`Demo: Shielded ${formatSui(amountMist)} SUI`);
        setAmount("");
        onSuccess?.();
        return;
      }

      // Build shield transaction
      const tx = new Transaction();

      // Split coin for the amount to shield
      const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);

      // Create note commitment (simplified for demo)
      // In production, use proper Poseidon hash from SDK
      const commitment = new Uint8Array(32);
      crypto.getRandomValues(commitment);

      // Encrypted note (simplified)
      const encryptedNote = new Uint8Array(128);
      crypto.getRandomValues(encryptedNote);

      tx.moveCall({
        target: `${PACKAGE_ID}::pool::shield`,
        typeArguments: [SUI_COIN_TYPE],
        arguments: [
          tx.object(POOL_ID),
          coin,
          tx.pure.vector("u8", Array.from(commitment)),
          tx.pure.vector("u8", Array.from(encryptedNote)),
        ],
      });

      const result = await signAndExecute({
        transaction: tx,
      });

      setSuccess(`Shielded ${formatSui(amountMist)} SUI! TX: ${result.digest}`);
      setAmount("");
      onSuccess?.();
    } catch (err) {
      console.error("Shield failed:", err);
      setError(err instanceof Error ? err.message : "Shield failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="card">
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
        Shield Tokens
      </h2>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Deposit SUI into the privacy pool to shield your tokens.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="shield-amount"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Amount (SUI)
          </label>
          <input
            id="shield-amount"
            type="number"
            step="0.001"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            className="input"
            disabled={isSubmitting}
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg bg-green-50 p-3 text-sm text-green-600 dark:bg-green-900/20 dark:text-green-400">
            {success}
          </div>
        )}

        <button
          type="submit"
          disabled={!account || !keypair || isSubmitting}
          className={cn(
            "btn-primary w-full",
            isSubmitting && "cursor-wait opacity-70"
          )}
        >
          {isSubmitting ? (
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
              Shielding...
            </span>
          ) : (
            "Shield"
          )}
        </button>
      </form>
    </div>
  );
}
