"use client";

import { useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { cn, parseSui, formatSui, truncateAddress } from "@/lib/utils";
import { PACKAGE_ID, POOL_ID, SUI_COIN_TYPE } from "@/lib/constants";
import type { OctopusKeypair } from "@/hooks/useLocalKeypair";
import type { OwnedNote } from "@/hooks/useNotes";
import {
  generateUnshieldProof,
  convertUnshieldProofToSui,
  type UnshieldInput,
} from "@octopus/sdk";
import { NumberInput } from "@/components/NumberInput";

interface UnshieldFormProps {
  keypair: OctopusKeypair | null;
  maxAmount: bigint;
  notes: OwnedNote[];
  onSuccess?: () => void | Promise<void>;
  markNoteSpent?: (nullifier: bigint) => void;
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
  markNoteSpent,
}: UnshieldFormProps) {
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [state, setState] = useState<UnshieldState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ message: string; txDigest?: string } | null>(null);

  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

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

      // Get unspent notes
      const unspentNotes = notes.filter((n: OwnedNote) => !n.spent);
      if (unspentNotes.length === 0) {
        throw new Error("No unspent notes available");
      }

      // Sort notes by value (largest first) for better UX
      const sortedNotes = unspentNotes.sort((a: OwnedNote, b: OwnedNote) => Number(b.note.value - a.note.value));

      // Use the largest note (current implementation supports 1-input only)
      const noteToSpend = sortedNotes.find((n: OwnedNote) => n.note.value >= amountMist);
      if (!noteToSpend) {
        const maxSingleNote = sortedNotes[0]?.note.value ?? 0n;
        throw new Error(
          `No single note with sufficient balance. Largest note: ${formatSui(maxSingleNote)} SUI. ` +
          `To unshield larger amounts, use private transfer to merge notes first.`
        );
      }

      // Validate that Merkle proof exists
      if (!noteToSpend.pathElements || noteToSpend.pathElements.length === 0) {
        throw new Error("Merkle proof not available for this note. Please refresh and try again.");
      }

      // Build UnshieldInput for proof generation using already-loaded Merkle proof
      const unshieldInput: UnshieldInput = {
        note: noteToSpend.note,
        leafIndex: noteToSpend.leafIndex,
        pathElements: noteToSpend.pathElements,
        keypair: keypair,
      };

      // Generate ZK proof (this takes 10-30 seconds)
      const { proof, publicSignals } = await generateUnshieldProof(unshieldInput);

      console.log("Proof generated:", proof);

      // Convert to Sui format
      const suiProof = convertUnshieldProofToSui(proof, publicSignals);

      console.log("Sui proof:", suiProof);

      // Use real proof bytes
      const proofBytes = suiProof.proofBytes;          // 128 bytes
      const publicInputsBytes = suiProof.publicInputsBytes; // 64 bytes

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

      // Immediately mark note as spent locally (optimistic update)
      markNoteSpent?.(noteToSpend.nullifier);

      setState("success");
      setSuccess({
        message: `Unshielded ${formatSui(amountMist)} SUI!`,
        txDigest: result.digest
      });
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
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-4">
        <div>
          <label
            htmlFor="unshield-amount"
            className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-400 font-mono"
          >
            Amount (SUI)
          </label>
          <NumberInput
            id="unshield-amount"
            value={amount}
            onChange={setAmount}
            placeholder="0.000"
            step={0.001}
            min={0}
            disabled={isProcessing}
          />
          <p className="mt-2 text-[10px] text-gray-500 font-mono">
            {notes.length > 0 ? (
              <>
                MAX/NOTE: {formatSui(notes.filter((n: OwnedNote) => !n.spent).sort((a: OwnedNote, b: OwnedNote) => Number(b.note.value - a.note.value))[0]?.note.value ?? 0n)}
                {notes.filter((n: OwnedNote) => !n.spent).length > 1 && (
                  <span className="text-gray-600">
                    {" "}// TOTAL: {formatSui(maxAmount)} ({notes.filter((n: OwnedNote) => !n.spent).length} NOTES)
                  </span>
                )}
              </>
            ) : (
              <>MAX: {formatSui(maxAmount)}</>
            )}
          </p>
        </div>

        <div>
          <label
            htmlFor="recipient"
            className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-400 font-mono"
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
              className="btn-secondary whitespace-nowrap text-xs"
              disabled={!account || isProcessing}
            >
              MY ADDR
            </button>
          </div>
        </div>
      </div>

      {/* Progress indicator */}
      {isProcessing && (
        <div className="p-4 border border-cyber-blue/30 bg-cyber-blue/10 clip-corner">
          <div className="flex items-center gap-3">
            <svg
              className="h-5 w-5 animate-spin text-cyber-blue"
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
            <div>
              <p className="font-bold text-cyber-blue text-xs uppercase tracking-wider">
                {state === "generating-proof"
                  ? "Generating ZK Proof..."
                  : "Submitting Transaction..."}
              </p>
              <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                {state === "generating-proof"
                  ? "// Proof generation in progress"
                  : "// Awaiting wallet confirmation"}
              </p>
            </div>
          </div>
        </div>
      )}

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
            <p className="text-xs text-green-400 font-mono leading-relaxed">
              {success.message}
              {success.txDigest && (
                <>
                  {' '}
                  <a
                    href={`https://testnet.suivision.xyz/txblock/${success.txDigest}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyber-blue hover:text-cyber-blue/80 underline"
                    title={`View transaction: ${success.txDigest}`}
                  >
                    [{truncateAddress(success.txDigest, 6)}]
                  </a>
                </>
              )}
            </p>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={!account || !keypair || isProcessing || maxAmount === 0n}
        className={cn(
          "btn-primary w-full",
          isProcessing && "cursor-wait opacity-70"
        )}
        style={{
          backgroundColor: 'transparent',
          color: '#00d9ff',
          borderColor: '#00d9ff',
        }}
      >
        {isProcessing ? "◉ PROCESSING..." : "▼ UNSHIELD TOKENS"}
      </button>

      {/* Info Box */}
      <div className="p-4 border border-gray-800 bg-black/30 clip-corner space-y-3">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-cyber-blue font-mono">
          Unshield Process:
        </h4>
        <ol className="text-[10px] text-gray-400 space-y-1.5 list-decimal list-inside font-mono leading-relaxed">
          <li>Select note to spend</li>
          <li>Generate Merkle proof</li>
          <li>Calculate nullifier (prevent double-spending)</li>
          <li>Generate ZK proof (10-30s)</li>
          <li>Submit withdrawal transaction</li>
          <li>Tokens sent to recipient</li>
        </ol>
        <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent" />
        <p className="text-[10px] text-gray-500 font-mono">
          <span className="text-cyber-blue">◉</span> Privacy: Note details remain hidden, only nullifier revealed
        </p>
      </div>
    </form>
  );
}
