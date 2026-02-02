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
import type { OctopusKeypair } from "@/hooks/useLocalKeypair";
import type { ShieldedNote } from "@/types/note";
import {
  generateUnshieldProof,
  convertProofToSui,
  type SpendInput,
} from "@octopus/sdk";
import { getMerkleProofForNote } from "@/lib/merkleProof";

interface UnshieldFormProps {
  keypair: OctopusKeypair | null;
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

      // Sort notes by value (largest first) for better UX
      const sortedNotes = unspentNotes.sort((a, b) => Number(b.value - a.value));

      // Use the largest note (current implementation supports 1-input only)
      const noteToSpend = sortedNotes.find((note) => note.value >= amountMist);
      if (!noteToSpend) {
        const maxSingleNote = sortedNotes[0]?.value ?? 0n;
        throw new Error(
          `No single note with sufficient balance. Largest note: ${formatSui(maxSingleNote)} SUI. ` +
          `To unshield larger amounts, use private transfer to merge notes first.`
        );
      }

      // Get Merkle proof from on-chain state
      console.log("=== Unshield Debug Info ===");
      console.log("Note to spend:", {
        commitment: noteToSpend.commitment,
        npk: noteToSpend.npk,
        token: noteToSpend.token,
        value: noteToSpend.value.toString(),
        random: noteToSpend.random,
        position: noteToSpend.position,
      });

      const merkleProofData = await getMerkleProofForNote(
        suiClient,
        noteToSpend.position,
        POOL_ID // FIX: Pass pool ID to get on-chain root (same as swap tests)
      );

      console.log("Merkle proof retrieved:");
      console.log("- On-chain root:", "0x" + merkleProofData.merkleRoot.toString(16).padStart(64, "0"));
      console.log("- Path elements count:", merkleProofData.pathElements.length);

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
      console.log("Public signals (circuit outputs):");
      console.log("- merkle_root:", publicSignals[0]);
      console.log("- nullifier:", publicSignals[1]);
      console.log("- commitment:", publicSignals[2]);

      // Compare circuit root with on-chain root
      const circuitRoot = BigInt(publicSignals[0]);
      const rootMatch = circuitRoot === merkleProofData.merkleRoot;
      console.log("Root comparison:");
      console.log("- Circuit root:", "0x" + circuitRoot.toString(16).padStart(64, "0"));
      console.log("- On-chain root:", "0x" + merkleProofData.merkleRoot.toString(16).padStart(64, "0"));
      console.log("- Match:", rootMatch ? "✅" : "❌ MISMATCH!");

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
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-4">
        <div>
          <label
            htmlFor="unshield-amount"
            className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-400 font-mono"
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
            placeholder="0.000"
            className="input"
            disabled={isProcessing}
          />
          <p className="mt-2 text-[10px] text-gray-500 font-mono">
            {notes.length > 0 ? (
              <>
                MAX/NOTE: {formatSui(notes.filter(n => !n.spent).sort((a, b) => Number(b.value - a.value))[0]?.value ?? 0n)}
                {notes.filter(n => !n.spent).length > 1 && (
                  <span className="text-gray-600">
                    {" "}// TOTAL: {formatSui(maxAmount)} ({notes.filter(n => !n.spent).length} NOTES)
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

      {/* Available Notes Display */}
      {
        <div className="p-4 border border-cyber-blue/30 bg-cyber-blue/10 clip-corner">
          <p className="text-xs font-bold uppercase tracking-wider text-cyber-blue mb-3 font-mono">
            Available Notes (UTXO)
          </p>
          <div className="space-y-1.5 text-[10px] text-gray-300">
            {notes
              .filter(n => !n.spent)
              .sort((a, b) => Number(b.value - a.value))
              .slice(0, 5)
              .map((note, i) => (
                <div key={i} className="flex justify-between font-mono p-1.5 bg-black/30 clip-corner">
                  <span className="text-gray-500">NOTE #{(i + 1).toString().padStart(2, '0')}:</span>
                  <span className="text-cyber-blue">{formatSui(note.value)} SUI</span>
                </div>
              ))}
            {notes.filter(n => !n.spent).length > 5 && (
              <p className="text-gray-500 font-mono pl-1.5">
                ... +{notes.filter(n => !n.spent).length - 5} MORE
              </p>
            )}
          </div>
          <p className="mt-3 text-[10px] text-gray-400 font-mono flex items-start gap-2">
            <span className="text-cyber-blue">ℹ</span>
            <span>Single note spending only. Use transfer to merge.</span>
          </p>
        </div>
      }

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
            <p className="text-xs text-green-400 font-mono leading-relaxed">{success}</p>
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
      >
        {isProcessing ? "◉ PROCESSING..." : "▼ UNSHIELD TOKENS"}
      </button>
    </form>
  );
}
