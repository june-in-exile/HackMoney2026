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
import type { ShieldedNote } from "@/types/note";
import {
  generateUnshieldProof,
  convertProofToSui,
  type SpendInput,
} from "@octopus/sdk";
import { getMerkleProofForNote } from "@/lib/merkleProof";

interface UnshieldFormProps {
  keypair: RailgunKeypair | null;
  maxAmount: bigint;
  notes: ShieldedNote[];
  onSuccess?: () => void | Promise<void>;
}

type UnshieldState =
  | "idle"
  | "generating-proof"
  | "submitting"
  | "success"
  | "error";

export function UnshieldForm({
  keypair,
  maxAmount,
  notes,
  onSuccess,
}: UnshieldFormProps) {
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [state, setState] = useState<UnshieldState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const suiClient = useSuiClient();

  // Auto-fill recipient with connected wallet
  const handleUseMyAddress = () => {
    if (account?.address) {
      setRecipient(account.address);
    }
  };

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

    if (!recipient || !recipient.startsWith("0x")) {
      setError("Please enter a valid recipient address");
      return;
    }

    const amountMist = parseSui(amount);
    if (amountMist > maxAmount) {
      setError("Insufficient shielded balance");
      return;
    }

    try {
      // Step 1: Generate ZK proof (heavy computation)
      setState("generating-proof");

      if (DEMO_MODE) {
        // Simulate proof generation delay
        await new Promise((resolve) => setTimeout(resolve, 3000));

        setState("submitting");
        await new Promise((resolve) => setTimeout(resolve, 1500));

        setState("success");
        setSuccess(`Demo: Unshielded ${formatSui(amountMist)} SUI to ${recipient.slice(0, 10)}...`);
        setAmount("");
        setRecipient("");
        await onSuccess?.();
        return;
      }

      // Get unspent notes
      const unspentNotes = notes.filter((note) => !note.spent);
      if (unspentNotes.length === 0) {
        throw new Error("No unspent notes available");
      }

      // For now, spend the first note that has enough value
      const noteToSpend = unspentNotes.find((note) => note.value >= amountMist);
      if (!noteToSpend) {
        throw new Error("No note with sufficient balance");
      }

      // Get Merkle proof from on-chain state
      console.log("Fetching Merkle proof for note at position:", noteToSpend.position);
      const merkleProofData = await getMerkleProofForNote(
        suiClient,
        noteToSpend.position
      );

      console.log("Merkle proof retrieved, generating ZK proof...");

      // Build SpendInput for proof generation
      const spendInput: SpendInput = {
        note: {
          npk: BigInt(noteToSpend.npk),
          token: BigInt(noteToSpend.token),
          value: noteToSpend.value,
          random: BigInt(noteToSpend.random),
          commitment: BigInt("0x" + noteToSpend.commitment),
        },
        leafIndex: noteToSpend.position,
        pathElements: merkleProofData.pathElements,
        keypair: keypair,
      };

      // Generate ZK proof (this takes 10-30 seconds)
      console.log("Generating ZK proof with snarkjs...");
      const { proof, publicSignals } = await generateUnshieldProof(spendInput);

      console.log("ZK proof generated successfully!");
      console.log("Public signals:", publicSignals);

      // Convert to Sui format
      const suiProof = convertProofToSui(proof, publicSignals);

      console.log("Proof converted to Sui format");
      console.log("Proof bytes:", suiProof.proofBytes.length, "bytes");
      console.log("Public inputs:", suiProof.publicInputsBytes.length, "bytes");

      // Use real proof bytes
      const proofBytes = suiProof.proofBytes;          // 128 bytes
      const publicInputsBytes = suiProof.publicInputsBytes; // 96 bytes

      // Step 2: Submit transaction
      setState("submitting");

      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::pool::unshield`,
        typeArguments: [SUI_COIN_TYPE],
        arguments: [
          tx.object(POOL_ID),
          tx.pure.vector("u8", Array.from(proofBytes)),
          tx.pure.vector("u8", Array.from(publicInputsBytes)),
          tx.pure.u64(amountMist),
          tx.pure.address(recipient),
        ],
      });

      const result = await signAndExecute({
        transaction: tx,
      });

      setState("success");
      setSuccess(`Unshielded ${formatSui(amountMist)} SUI! TX: ${result.digest}`);
      setAmount("");
      setRecipient("");
      await onSuccess?.();
    } catch (err) {
      console.error("Unshield failed:", err);
      setState("error");
      setError(err instanceof Error ? err.message : "Unshield failed");
    }
  };

  const isProcessing = state === "generating-proof" || state === "submitting";

  return (
    <div className="card">
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
        Unshield Tokens
      </h2>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Withdraw tokens from the privacy pool with ZK proof verification.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="unshield-amount"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Amount (SUI)
          </label>
          <input
            id="unshield-amount"
            type="number"
            step="0.001"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            className="input"
            disabled={isProcessing}
          />
          <p className="mt-1 text-xs text-gray-500">
            Max: {formatSui(maxAmount)} SUI
          </p>
        </div>

        <div>
          <label
            htmlFor="recipient"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Recipient Address
          </label>
          <div className="flex gap-2">
            <input
              id="recipient"
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="0x..."
              className="input flex-1"
              disabled={isProcessing}
            />
            <button
              type="button"
              onClick={handleUseMyAddress}
              className="btn-secondary whitespace-nowrap"
              disabled={!account || isProcessing}
            >
              Use Mine
            </button>
          </div>
        </div>

        {/* Progress indicator */}
        {isProcessing && (
          <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
            <div className="flex items-center gap-3">
              <svg
                className="h-5 w-5 animate-spin text-blue-600"
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
              <div>
                <p className="font-medium text-blue-900 dark:text-blue-100">
                  {state === "generating-proof"
                    ? "Generating ZK Proof..."
                    : "Submitting Transaction..."}
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  {state === "generating-proof"
                    ? "This may take a few seconds"
                    : "Please confirm in your wallet"}
                </p>
              </div>
            </div>
          </div>
        )}

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
          disabled={!account || !keypair || isProcessing || maxAmount === 0n}
          className={cn(
            "btn-primary w-full",
            isProcessing && "cursor-wait opacity-70"
          )}
        >
          {isProcessing ? "Processing..." : "Unshield"}
        </button>
      </form>
    </div>
  );
}
