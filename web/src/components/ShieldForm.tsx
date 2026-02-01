"use client";

import { useState, useEffect } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { cn, parseSui, formatSui } from "@/lib/utils";
import { PACKAGE_ID, POOL_ID, SUI_COIN_TYPE, DEMO_MODE } from "@/lib/constants";
import type { OctopusKeypair } from "@/hooks/useLocalKeypair";
import {
  initPoseidon,
  createNote,
  encryptNote,
  bigIntToBytes,
  poseidonHash,
  deriveViewingPublicKey
} from "@octopus/sdk";

interface ShieldFormProps {
  keypair: OctopusKeypair | null;
  onSuccess?: () => void | Promise<void>;
}

export function ShieldForm({ keypair, onSuccess }: ShieldFormProps) {
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  // Fetch wallet balance whenever account changes
  useEffect(() => {
    const fetchBalance = async () => {
      if (!account?.address) {
        setBalance(null);
        return;
      }

      setIsLoadingBalance(true);
      try {
        const balanceResult = await client.getBalance({
          owner: account.address,
          coinType: SUI_COIN_TYPE,
        });
        setBalance(BigInt(balanceResult.totalBalance));
      } catch (err) {
        console.error("Failed to fetch balance:", err);
        setBalance(null);
      } finally {
        setIsLoadingBalance(false);
      }
    };

    fetchBalance();
  }, [account?.address, client]);

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

    const amountMist = parseSui(amount);

    // Validate against wallet balance
    if (balance !== null && amountMist > balance) {
      setError(
        `Insufficient balance. You have ${formatSui(balance)} SUI available.`
      );
      return;
    }

    setIsSubmitting(true);

    try {
      // Initialize Poseidon hash function
      await initPoseidon();

      if (DEMO_MODE) {
        // Simulate shield in demo mode
        await new Promise((resolve) => setTimeout(resolve, 1500));
        setSuccess(`Demo: Shielded ${formatSui(amountMist)} SUI`);
        setAmount("");
        await onSuccess?.();
        return;
      }

      // Create a token identifier for SUI by hashing the coin type
      const tokenId = poseidonHash([BigInt(0x2)]); // Simplified: use 0x2 for SUI

      // Create a note using SDK crypto functions
      const note = createNote(
        keypair.masterPublicKey,
        tokenId,
        amountMist
      );

      // Encrypt the note for the recipient (self in this case)
      // Derive viewing public key from spending key
      const viewingPk = deriveViewingPublicKey(keypair.spendingKey);
      const encryptedNoteData = encryptNote(note, viewingPk);

      // Convert commitment to bytes (32 bytes, big-endian)
      const commitmentBytes = bigIntToBytes(note.commitment);

      // Build shield transaction
      const tx = new Transaction();

      // Split coin for the amount to shield
      const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);

      tx.moveCall({
        target: `${PACKAGE_ID}::pool::shield`,
        typeArguments: [SUI_COIN_TYPE],
        arguments: [
          tx.object(POOL_ID),
          coin,
          tx.pure.vector("u8", Array.from(commitmentBytes)),
          tx.pure.vector("u8", Array.from(encryptedNoteData)),
        ],
      });

      const result = await signAndExecute({
        transaction: tx,
      });

      setSuccess(
        `Shielded ${formatSui(amountMist)} SUI! TX: ${result.digest}\n` +
        `Refreshing balance...`
      );
      setAmount("");

      // Call onSuccess callback to refresh balance
      await onSuccess?.();

      // Update success message after refresh completes
      setSuccess(
        `Successfully shielded ${formatSui(amountMist)} SUI! TX: ${result.digest}`
      );
    } catch (err) {
      console.error("Shield failed:", err);
      setError(err instanceof Error ? err.message : "Shield failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-4">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label
              htmlFor="shield-amount"
              className="text-xs font-bold uppercase tracking-wider text-gray-400 font-mono"
            >
              Amount (SUI)
            </label>
            {account && (
              <span className="text-[10px] text-gray-500 font-mono">
                {isLoadingBalance ? (
                  "// Loading..."
                ) : balance !== null ? (
                  <>BAL: {formatSui(balance)}</>
                ) : (
                  "// Unavailable"
                )}
              </span>
            )}
          </div>
          <input
            id="shield-amount"
            type="number"
            step="0.001"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.000"
            className="input"
            disabled={isSubmitting}
          />
        </div>

        {error && (
          <div className="p-3 border border-red-600/30 bg-red-900/20 clip-corner">
            <div className="flex items-start gap-2">
              <span className="text-red-500 text-sm">✕</span>
              <p className="text-xs text-red-400 font-mono leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="p-3 border border-green-600/30 bg-green-900/20 clip-corner">
            <div className="flex items-start gap-2">
              <span className="text-green-500 text-sm">✓</span>
              <p className="text-xs text-green-400 font-mono leading-relaxed whitespace-pre-wrap">{success}</p>
            </div>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={!account || !keypair || isSubmitting}
        className={cn(
          "btn-primary w-full",
          isSubmitting && "cursor-wait opacity-70"
        )}
      >
        {isSubmitting ? (
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
            SHIELDING...
          </span>
        ) : (
          "▲ SHIELD TOKENS"
        )}
      </button>
    </form>
  );
}
