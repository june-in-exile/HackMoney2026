"use client";

import { useState, useEffect, useMemo } from "react";
import { isValidViewingPublicKey, type RecipientProfile, type RecipientProfileStored } from "@june_zk/octopus-sdk";
import {
  saveRecipient,
  getRecipients,
  deleteRecipient,
} from "@/lib/recipientStorage";
import { useCurrentAccount } from "@mysten/dapp-kit";

interface RecipientInputProps {
  onRecipientChange: (profile: RecipientProfile | null) => void;
  disabled?: boolean;
}

export function RecipientInput({
  onRecipientChange,
  disabled = false,
}: RecipientInputProps) {
  const account = useCurrentAccount();
  const walletAddress = account?.address || "";

  const [mpkInput, setMpkInput] = useState("");
  const [viewingKeyInput, setViewingKeyInput] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [savedRecipients, setSavedRecipients] = useState<RecipientProfileStored[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<string>("");
  const [showSaveForm, setShowSaveForm] = useState(false);

  // Load saved recipients on mount and when wallet changes
  useEffect(() => {
    if (walletAddress) {
      setSavedRecipients(getRecipients(walletAddress));
    }
  }, [walletAddress]);

  // Validate inputs
  const mpkValid = useMemo(() => {
    if (!mpkInput) return false;
    try {
      BigInt(mpkInput);
      return true;
    } catch {
      return false;
    }
  }, [mpkInput]);

  const viewingKeyValid = useMemo(() => {
    if (!viewingKeyInput) return false;
    return isValidViewingPublicKey(viewingKeyInput);
  }, [viewingKeyInput]);

  const isValid = mpkValid && viewingKeyValid;

  // Update parent component when inputs change
  useEffect(() => {
    if (isValid) {
      onRecipientChange({
        mpk: BigInt(mpkInput),
        viewingPublicKey: viewingKeyInput,
        label: labelInput || undefined,
      });
    } else {
      onRecipientChange(null);
    }
  }, [isValid, mpkInput, viewingKeyInput, labelInput, onRecipientChange]);

  const handleLoadRecipient = (mpk: string) => {
    setSelectedRecipient(mpk);
    if (!mpk) {
      // Clear selection
      setMpkInput("");
      setViewingKeyInput("");
      setLabelInput("");
      return;
    }

    const recipient = savedRecipients.find((r) => r.mpk === mpk);
    if (recipient) {
      setMpkInput(recipient.mpk);
      setViewingKeyInput(recipient.viewingPublicKey);
      setLabelInput(recipient.label || "");
    }
  };

  const handleSaveRecipient = () => {
    if (!walletAddress || !isValid) return;

    const stored: RecipientProfileStored = {
      mpk: mpkInput,
      viewingPublicKey: viewingKeyInput,
      label: labelInput || undefined,
      addedAt: Date.now(),
    };

    saveRecipient(walletAddress, stored);
    setSavedRecipients(getRecipients(walletAddress));
    setShowSaveForm(false);
  };

  const handleDeleteRecipient = (mpk: string) => {
    if (!walletAddress) return;
    deleteRecipient(walletAddress, mpk);
    setSavedRecipients(getRecipients(walletAddress));
    if (selectedRecipient === mpk) {
      handleLoadRecipient("");
    }
  };

  return (
    <div className="space-y-4">
      {/* Saved Recipients Dropdown */}
      {savedRecipients.length > 0 && (
        <div>
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
            Saved Recipients
          </label>
          <div className="flex gap-2">
            <select
              value={selectedRecipient}
              onChange={(e) => handleLoadRecipient(e.target.value)}
              className="input flex-1"
              disabled={disabled}
            >
              <option value="">Select a recipient...</option>
              {savedRecipients.map((r) => (
                <option key={r.mpk} value={r.mpk}>
                  {r.label || `${r.mpk.slice(0, 10)}...${r.mpk.slice(-6)}`}
                </option>
              ))}
            </select>
            {selectedRecipient && (
              <button
                type="button"
                onClick={() => handleDeleteRecipient(selectedRecipient)}
                className="btn-secondary text-xs px-3"
                disabled={disabled}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      )}

      {/* Manual Input */}
      <div>
        <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
          Recipient Master Public Key (MPK)
        </label>
        <input
          type="text"
          value={mpkInput}
          onChange={(e) => {
            setMpkInput(e.target.value);
            setSelectedRecipient("");
          }}
          placeholder="Enter recipient's MPK (e.g., 123456789...)"
          className={`input ${mpkInput && !mpkValid ? "border-red-500" : ""}`}
          disabled={disabled}
        />
        {mpkInput && !mpkValid && (
          <p className="mt-1 text-xs text-red-500 font-mono">
            Invalid MPK format
          </p>
        )}
      </div>

      <div>
        <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
          Recipient Viewing Public Key (VPK)
        </label>
        <input
          type="text"
          value={viewingKeyInput}
          onChange={(e) => {
            setViewingKeyInput(e.target.value);
            setSelectedRecipient("");
          }}
          placeholder="Enter 64-character hex viewing key..."
          className={`input ${viewingKeyInput && !viewingKeyValid ? "border-red-500" : ""}`}
          disabled={disabled}
        />
        {viewingKeyInput && !viewingKeyValid && (
          <p className="mt-1 text-xs text-red-500 font-mono">
            Invalid format. Expected 64 hex characters.
          </p>
        )}
      </div>

      {/* Optional Label */}
      {showSaveForm && (
        <div>
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
            Label (Optional)
          </label>
          <input
            type="text"
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            placeholder="e.g., Alice, Bob, DEX Wallet..."
            className="input"
            disabled={disabled}
          />
        </div>
      )}

      {/* Save Button */}
      {isValid && !selectedRecipient && (
        <div className="flex gap-2">
          {!showSaveForm ? (
            <button
              type="button"
              onClick={() => setShowSaveForm(true)}
              className="btn-secondary text-xs py-2 px-4"
              disabled={disabled}
            >
              Save Recipient
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSaveRecipient}
                className="btn-primary text-xs py-2 px-4"
                disabled={disabled}
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSaveForm(false);
                  setLabelInput("");
                }}
                className="btn-secondary text-xs py-2 px-4"
                disabled={disabled}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
