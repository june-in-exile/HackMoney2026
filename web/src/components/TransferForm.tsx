"use client";

import { useState } from "react";
import { useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { cn, formatSui } from "@/lib/utils";
import type { OctopusKeypair } from "@/hooks/useLocalKeypair";
import { useNotes } from "@/hooks/useNotes";
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

interface TransferFormProps {
  keypair: OctopusKeypair | null;
  onSuccess?: () => void | Promise<void>;
}

export function TransferForm({ keypair, onSuccess }: TransferFormProps) {
  const [recipientMpk, setRecipientMpk] = useState("");
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const { notes, loading: notesLoading, error: notesError } = useNotes(keypair);

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

    setIsSubmitting(true);

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

      // 1. Get unspent notes
      const unspentNotes = notes.filter((n) => !n.spent);

      if (unspentNotes.length === 0) {
        setError("No unspent notes available. Shield some tokens first!");
        setIsSubmitting(false);
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
        setError("Insufficient balance or notes don't have Merkle proofs yet!");
        setIsSubmitting(false);
        return;
      }

      // 3. Create output notes (recipient + change)
      const recipientMpkBigInt = BigInt(recipientMpk);
      const inputTotal = selectedNotes.reduce((sum, n) => sum + n.note.value, 0n);
      const [recipientNote, changeNote] = createTransferOutputs(
        recipientMpkBigInt,
        keypair.masterPublicKey,
        amountNano,
        inputTotal,
        0n // token type (0 = SUI)
      );

      // 4. Generate ZK proof (30-60 seconds)
      setSuccess("⏳ Generating ZK proof (this may take 30-60 seconds)...");
      const proof = await generateTransferProof(
        {
          keypair,
          inputNotes: selectedNotes.map((n) => n.note),
          inputLeafIndices: selectedNotes.map((n) => n.leafIndex),
          inputPathElements: selectedNotes.map((n) => n.pathElements!),
          outputNotes: [recipientNote, changeNote],
          token: 0n,
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
      setSuccess("⏳ Submitting transaction to Sui network...");
      const tx = buildTransferTransaction(
        PACKAGE_ID,
        POOL_ID,
        SUI_COIN_TYPE,
        suiProof,
        [encryptedRecipientNote, encryptedChangeNote]
      );

      const result = await signAndExecute({ transaction: tx });

      // 8. Success!
      if (onSuccess) await onSuccess();
      setSuccess(
        `Transfer of ${amount} SUI completed! TX: ${result.digest.slice(0, 8)}...`
      );
      setRecipientMpk("");
      setAmount("");

    } catch (err) {
      console.error("Transfer failed:", err);
      setError(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-4">
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
            disabled={isSubmitting}
          />
          <p className="mt-2 text-[10px] text-gray-600 font-mono break-all">
            // Example: 13495...632235
          </p>
        </div>

        {/* Amount Input */}
        <div>
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
            Amount (SUI)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.000"
            step="0.001"
            min="0"
            className="input"
            disabled={isSubmitting}
          />
          <p className="mt-2 text-[10px] text-gray-500 font-mono">
            {notesLoading ? (
              <>LOADING NOTES...</>
            ) : notes.length > 0 ? (
              <>
                TOTAL: {formatSui(notes.filter(n => !n.spent).reduce((sum, n) => sum + n.note.value, 0n))}
                {notes.filter(n => !n.spent).length > 1 && (
                  <span className="text-gray-600">
                    {" "}// {notes.filter(n => !n.spent).length} NOTES
                  </span>
                )}
              </>
            ) : (
              <>NO NOTES // Shield tokens first</>
            )}
          </p>
        </div>

        {/* Available Notes Display */}
        {notesLoading ? (
          <div className="p-4 border border-cyber-blue/30 bg-cyber-blue/10 clip-corner">
            <p className="text-xs font-bold uppercase tracking-wider text-cyber-blue mb-3 font-mono">
              Available Notes (UTXO)
            </p>
            <div className="flex items-center gap-3">
              <svg
                className="h-4 w-4 animate-spin text-cyber-blue"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              <p className="text-[10px] text-gray-400 font-mono">Loading notes from blockchain...</p>
            </div>
          </div>
        ) : notesError ? (
          <div className="p-4 border border-red-600/30 bg-red-900/20 clip-corner">
            <p className="text-xs font-bold uppercase tracking-wider text-red-400 mb-2 font-mono">
              Error Loading Notes
            </p>
            <p className="text-[10px] text-red-400 font-mono">{notesError}</p>
          </div>
        ) : notes.filter(n => !n.spent).length > 0 ? (
          <div className="p-4 border border-cyber-blue/30 bg-cyber-blue/10 clip-corner">
            <p className="text-xs font-bold uppercase tracking-wider text-cyber-blue mb-3 font-mono">
              Available Notes (UTXO)
            </p>
            <div className="space-y-1.5 text-[10px] text-gray-300">
              {notes
                .filter(n => !n.spent)
                .sort((a, b) => Number(b.note.value - a.note.value))
                .slice(0, 5)
                .map((note, i) => (
                  <div key={i} className="flex justify-between font-mono p-1.5 bg-black/30 clip-corner">
                    <span className="text-gray-500">NOTE #{(i + 1).toString().padStart(2, '0')}:</span>
                    <span className="text-cyber-blue">{formatSui(note.note.value)} SUI</span>
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
              <span>SDK auto-selects 1-2 notes to cover transfer amount.</span>
            </p>
          </div>
        ) : (
          <div className="p-4 border border-gray-800 bg-black/30 clip-corner">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 font-mono">
              No Notes Available
            </p>
            <p className="text-[10px] text-gray-400 font-mono">
              Shield some tokens first to create notes for transfer.
            </p>
          </div>
        )}

        {/* Note Selection Info */}
        <div className="p-3 border border-cyber-blue/30 bg-cyber-blue/10 clip-corner">
          <p className="text-[10px] text-gray-300 font-mono leading-relaxed">
            <span className="text-cyber-blue font-bold">AUTO SELECT:</span> SDK automatically selects optimal notes to cover transfer amount
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-3 border border-red-600/30 bg-red-900/20 clip-corner">
            <div className="flex items-start gap-2">
              <span className="text-red-500 text-sm">✕</span>
              <p className="text-xs text-red-400 font-mono leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {/* Success Display */}
        {success && (
          <div className="p-3 border border-green-600/30 bg-green-900/20 clip-corner">
            <div className="flex items-start gap-2">
              <span className="text-green-500 text-sm">✓</span>
              <p className="text-xs text-green-400 font-mono leading-relaxed">{success}</p>
            </div>
          </div>
        )}
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isSubmitting || !account || !keypair}
        className={cn(
          "btn-primary w-full",
          isSubmitting && "cursor-wait opacity-70"
        )}
      >
        {isSubmitting ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
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
            GENERATING PROOF...
          </span>
        ) : (
          "⇄ PRIVATE TRANSFER"
        )}
      </button>

      {/* Info Box */}
      <div className="p-4 border border-gray-800 bg-black/30 clip-corner space-y-3">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-cyber-blue font-mono">
          Transfer Process:
        </h4>
        <ol className="text-[10px] text-gray-400 space-y-1.5 list-decimal list-inside font-mono leading-relaxed">
          <li>Select notes (1-2 inputs)</li>
          <li>Create output notes (recipient + change)</li>
          <li>Generate Merkle proofs</li>
          <li>Generate ZK proof (30-60s)</li>
          <li>Submit private transaction</li>
        </ol>
        <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent" />
        <p className="text-[10px] text-gray-500 font-mono">
          <span className="text-cyber-blue">◉</span> Privacy: Sender, recipient, amount remain hidden on-chain
        </p>
      </div>
    </form>
  );
}
