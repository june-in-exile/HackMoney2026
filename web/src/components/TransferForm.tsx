"use client";

import { useState } from "react";
import { useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { cn } from "@/lib/utils";
import type { RailgunKeypair } from "@/hooks/useLocalKeypair";
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
  keypair: RailgunKeypair | null;
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
  const { notes, loading: notesLoading } = useNotes(keypair);

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
        `✅ Transfer of ${amount} SUI completed! TX: ${result.digest.slice(0, 8)}...`
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
    <div className="w-full max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Recipient MPK Input */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Recipient Master Public Key (MPK)
          </label>
          <input
            type="text"
            value={recipientMpk}
            onChange={(e) => setRecipientMpk(e.target.value)}
            placeholder="Enter recipient's MPK (BigInt)"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            disabled={isSubmitting}
          />
          <p className="mt-1 text-xs text-gray-500">
            Example: 13495179815785639161754474937963198890594537595864620153224650766581810632235
          </p>
        </div>

        {/* Amount Input */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Amount (SUI)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            step="0.000000001"
            min="0"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            disabled={isSubmitting}
          />
        </div>

        {/* Note Selection Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-blue-800">
            <strong>Auto Note Selection:</strong> The SDK will automatically select optimal notes to cover the transfer amount.
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Success Display */}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-sm text-green-800">{success}</p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting || !account || !keypair}
          className={cn(
            "w-full px-6 py-3 rounded-lg font-medium transition-all",
            "bg-gradient-to-r from-purple-500 to-pink-500 text-white",
            "hover:from-purple-600 hover:to-pink-600",
            "disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed",
            "focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
          )}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Generating Proof...
            </span>
          ) : (
            "Private Transfer"
          )}
        </button>

        {/* Info Box */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2">
          <h4 className="font-medium text-sm">Transfer Process:</h4>
          <ol className="text-xs text-gray-600 space-y-1 list-decimal list-inside">
            <li>Select notes to cover amount (1-2 inputs)</li>
            <li>Create output notes (recipient + change)</li>
            <li>Generate Merkle proofs for inputs</li>
            <li>Generate ZK proof (30-60 seconds)</li>
            <li>Submit private transfer transaction</li>
          </ol>
          <p className="text-xs text-gray-500 mt-2">
            <strong>Privacy:</strong> Sender, recipient, and amount remain completely hidden on-chain.
          </p>
        </div>
      </form>
    </div>
  );
}
