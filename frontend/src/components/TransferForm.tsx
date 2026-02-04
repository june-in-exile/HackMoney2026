"use client";

import { useState } from "react";
import { useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { cn, formatSui, truncateAddress } from "@/lib/utils";
import type { OctopusKeypair } from "@/hooks/useLocalKeypair";
import type { OwnedNote } from "@/hooks/useNotes";
import {
  selectNotesForTransfer,
  createTransferOutputs,
  generateTransferProof,
  convertTransferProofToSui,
  buildTransferTransaction,
  deriveViewingPublicKey,
  mpkToViewingPublicKeyUnsafe,
  encryptNote,
} from "@octopus/sdk";
import { PACKAGE_ID, POOL_ID, SUI_COIN_TYPE, CIRCUIT_URLS } from "@/lib/constants";
import { NumberInput } from "@/components/NumberInput";

interface TransferFormProps {
  keypair: OctopusKeypair | null;
  notes: OwnedNote[];
  loading: boolean;
  onSuccess?: () => void | Promise<void>;
  onRefresh?: () => void | Promise<void>;
}

type TransferState =
  | "idle"
  | "refreshing"
  | "generating-proof"
  | "submitting"
  | "success"
  | "error";

export function TransferForm({ keypair, notes, loading: notesLoading, onSuccess, onRefresh }: TransferFormProps) {
  const [recipientMpk, setRecipientMpk] = useState("");
  const [amount, setAmount] = useState("");
  const [state, setState] = useState<TransferState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ message: string; txDigest?: string } | null>(null);

  const account = useCurrentAccount();
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

    if (!recipientMpk || !amount || parseFloat(amount) <= 0) {
      setError("Please enter valid recipient MPK and amount");
      return;
    }

    try {
      // ============================================
      // PRIVATE TRANSFER FLOW
      // ============================================
      // ✅ All components implemented:
      // - Note encryption/decryption (ChaCha20-Poly1305 + ECDH)
      // - Merkle proof generation from on-chain events
      // - Transfer circuit (21,649 constraints)
      // - Move contract with transfer() function
      // - Pool deployed with transfer VK
      // ============================================

      // 0. Refresh notes to get latest Merkle paths
      if (onRefresh) {
        setState("refreshing");
        await onRefresh();
        // Wait for notes to be refetched (useNotes hook triggers async fetch)
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // 1. Get unspent notes
      const unspentNotes = notes.filter((n: OwnedNote) => !n.spent);

      if (unspentNotes.length === 0) {
        setState("error");
        setError("No unspent notes available. Shield some tokens first!");
        return;
      }

      // 2. Select notes to cover amount
      const amountNano = BigInt(Math.floor(parseFloat(amount) * 1_000_000_000)); // Convert SUI to nanoSUI
      const selectedNotes = selectNotesForTransfer(
        unspentNotes.map((n) => ({
          note: n.note,
          leafIndex: n.leafIndex,
          pathElements: n.pathElements || [], // Merkle proof
        })),
        amountNano
      );

      if (!selectedNotes || selectedNotes.length === 0) {
        setState("error");
        setError("Insufficient balance or notes don't have Merkle proofs yet!");
        return;
      }

      // 3. Create output notes (recipient + change)
      const recipientMpkBigInt = BigInt(recipientMpk);
      const inputTotal = selectedNotes.reduce((sum: bigint, n: { note: { value: bigint } }) => sum + n.note.value, 0n);
      const noteToken = selectedNotes[0].note.token; // Use actual token from selected note
      const [recipientNote, changeNote] = createTransferOutputs(
        recipientMpkBigInt,
        keypair.masterPublicKey,
        amountNano,
        inputTotal,
        noteToken
      );

      // 4. Generate ZK proof (30-60 seconds)
      setState("generating-proof");

      const proof = await generateTransferProof(
        {
          keypair,
          inputNotes: selectedNotes.map((n) => n.note),
          inputLeafIndices: selectedNotes.map((n) => n.leafIndex),
          inputPathElements: selectedNotes.map((n) => n.pathElements!),
          outputNotes: [recipientNote, changeNote],
          token: selectedNotes[0].note.token,
        },
        {
          wasmPath: CIRCUIT_URLS.TRANSFER.WASM,
          zkeyPath: CIRCUIT_URLS.TRANSFER.ZKEY,
        }
      );

      // 5. Convert proof to Sui format
      const suiProof = convertTransferProofToSui(proof.proof, proof.publicSignals);

      // 6. Encrypt output notes for recipients using viewing public keys
      // ⚠️ MVP LIMITATION: Using deterministic viewing key derivation from MPK
      // In production, recipient should explicitly share their viewing public key
      const recipientViewingPk = mpkToViewingPublicKeyUnsafe(recipientMpkBigInt);
      const myViewingPk = deriveViewingPublicKey(keypair.spendingKey);

      const encryptedRecipientNote = encryptNote(recipientNote, recipientViewingPk);
      const encryptedChangeNote = encryptNote(changeNote, myViewingPk);

      // 7. Build and submit transaction
      setState("submitting");
      const tx = buildTransferTransaction(
        PACKAGE_ID,
        POOL_ID,
        SUI_COIN_TYPE,
        suiProof,
        [encryptedRecipientNote, encryptedChangeNote]
      );

      const result = await signAndExecute({ transaction: tx });

      // 8. Success!
      setState("success");
      setSuccess({
        message: `Transferred ${amount} SUI!`,
        txDigest: result.digest
      });

      // Clear form inputs on success
      setRecipientMpk("");
      setAmount("");

      await onSuccess?.();

    } catch (err) {
      console.error("Transfer failed:", err);
      setState("error");
      setError(err instanceof Error ? err.message : "Transfer failed");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-4">
        {/* Amount Input */}
        <div>
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
            Amount (SUI)
          </label>
          <NumberInput
            value={amount}
            onChange={setAmount}
            placeholder="0.000"
            step={0.001}
            min={0}
            disabled={state !== "idle" && state !== "error"}
          />
          <p className="mt-2 text-[10px] text-gray-500 font-mono">
            {notesLoading ? (
              <>LOADING NOTES...</>
            ) : notes.length > 0 ? (
              <>
                TOTAL: {formatSui(notes.filter((n: OwnedNote) => !n.spent).reduce((sum: bigint, n: OwnedNote) => sum + n.note.value, 0n))}
                {notes.filter((n: OwnedNote) => !n.spent).length > 1 && (
                  <span className="text-gray-600">
                    {" "}// {notes.filter((n: OwnedNote) => !n.spent).length} NOTES
                  </span>
                )}
              </>
            ) : (
              <>NO NOTES // Shield tokens first</>
            )}
          </p>
        </div>
        
        {/* Recipient MPK Input */}
        <div>
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
            Recipient Master Public Key (MPK)
          </label>
          <input
            type="text"
            value={recipientMpk}
            onChange={(e) => setRecipientMpk(e.target.value)}
            placeholder="Enter recipient's MPK..."
            className="input"
            disabled={state !== "idle" && state !== "error"}
          />
          <p className="mt-2 text-[10px] text-gray-600 font-mono break-all">
            // Example: 0x13495...632235
          </p>
        </div>

        {/* Note Selection Info */}
        <div className="p-3 border border-cyber-blue/30 bg-cyber-blue/10 clip-corner">
          <p className="text-[10px] text-gray-300 font-mono leading-relaxed">
            <span className="text-cyber-blue font-bold">AUTO SELECT:</span> SDK automatically selects optimal notes to cover transfer amount
          </p>
        </div>
      </div>

      {/* Progress indicator */}
      {(state === "refreshing" || state === "generating-proof" || state === "submitting") && (
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
                {state === "refreshing"
                  ? "Refreshing Notes..."
                  : state === "generating-proof"
                  ? "Generating ZK Proof..."
                  : "Submitting Transaction..."}
              </p>
              <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                {state === "refreshing"
                  ? "// Fetching latest Merkle proofs"
                  : state === "generating-proof"
                  ? "// Proof generation in progress (30-60s)"
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
        disabled={!account || !keypair || (state !== "idle" && state !== "error")}
        className={cn(
          "btn-primary w-full",
          (state !== "idle" && state !== "error") && "cursor-wait opacity-70"
        )}
        style={{
          backgroundColor: 'transparent',
          color: '#00d9ff',
          borderColor: '#00d9ff',
        }}
      >
        {(state !== "idle" && state !== "error") ? "◉ PROCESSING..." : "⇄ PRIVATE TRANSFER"}
      </button>

      {/* Info Box - Hidden when success is shown */}
      {!success && (
        <div className="p-4 border border-gray-800 bg-black/30 clip-corner space-y-3">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-cyber-blue font-mono">
            Transfer Process:
          </h4>
          <ol className="text-[10px] text-gray-400 space-y-1.5 list-decimal list-inside font-mono leading-relaxed">
            <li>Select notes (1-2 inputs)</li>
            <li>Create output notes (recipient + change)</li>
            <li>Generate Merkle proofs</li>
            <li>Calculate nullifiers (prevent double-spending)</li>
            <li>Generate ZK proof (30-60s)</li>
            <li>Submit private transaction</li>
          </ol>
          <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent" />
          <p className="text-[10px] text-gray-500 font-mono">
            <span className="text-cyber-blue">◉</span> Privacy: Sender, recipient, amount remain hidden on-chain
          </p>
        </div>
      )}
    </form>
  );
}
