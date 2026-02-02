"use client";

import { useState, useEffect, useCallback } from "react";
import { bigIntToHex, hexToBigInt } from "@/lib/utils";
import {
  getDefaultIdentifier,
  getSavedKeypairs,
  saveKeypair,
  deleteKeypair,
  clearActiveKeypair,
  getActiveKeypair,
  setActiveKeypair,
  type StoredKeypair,
} from "@/lib/keypairStorage";

export interface OctopusKeypair {
  spendingKey: bigint;
  nullifyingKey: bigint;
  masterPublicKey: bigint;
}

/**
 * Hook to manage Octopus keypair in localStorage
 * Organized by wallet address and pool package ID
 * For demo purposes only - not secure for production!
 */
export function useLocalKeypair(walletAddress: string | undefined) {
  const [keypair, setKeypair] = useState<OctopusKeypair | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [poseidonReady, setPoseidonReady] = useState(false);
  const [savedKeypairs, setSavedKeypairs] = useState<StoredKeypair[]>([]);

  // Initialize Poseidon and load keypair from storage
  useEffect(() => {
    async function init() {
      try {
        // Dynamically import SDK to avoid SSR issues
        const { initPoseidon } = await import("circomlibjs").then(
          async (mod) => {
            const poseidon = await mod.buildPoseidon();
            return {
              initPoseidon: async () => {},
              poseidon,
            };
          }
        );

        setPoseidonReady(true);

        // Load saved keypairs list if wallet is connected
        // Note: We don't auto-load the active keypair on reconnect
        // User must manually select from saved keypairs
        if (walletAddress) {
          const identifier = getDefaultIdentifier(walletAddress);
          const saved = getSavedKeypairs(identifier);
          setSavedKeypairs(saved);
        }
      } catch (error) {
        console.error("Failed to initialize:", error);
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, [walletAddress]);

  // Clear keypair when wallet disconnects
  useEffect(() => {
    if (!walletAddress) {
      setKeypair(null);
      setSavedKeypairs([]);
    }
  }, [walletAddress]);

  // Generate a new keypair
  const generateKeypair = useCallback(async () => {
    if (!poseidonReady) {
      throw new Error("Poseidon not ready");
    }

    if (!walletAddress) {
      throw new Error("Wallet not connected");
    }

    try {
      const { buildPoseidon } = await import("circomlibjs");
      const poseidon = await buildPoseidon();

      // Generate random spending key
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      let spendingKey = BigInt(0);
      for (let i = 0; i < 32; i++) {
        spendingKey = (spendingKey << 8n) | BigInt(bytes[i]);
      }
      // Reduce to scalar field
      const SCALAR_MODULUS =
        21888242871839275222246405745257275088548364400416034343698204186575808495617n;
      spendingKey = spendingKey % SCALAR_MODULUS;

      // Derive nullifying key: Poseidon(spendingKey, 1)
      const nullifyingKeyHash = poseidon([spendingKey, 1n]);
      const nullifyingKey = BigInt(poseidon.F.toString(nullifyingKeyHash));

      // Derive master public key: Poseidon(spendingKey, nullifyingKey)
      const mpkHash = poseidon([spendingKey, nullifyingKey]);
      const masterPublicKey = BigInt(poseidon.F.toString(mpkHash));

      const newKeypair: OctopusKeypair = {
        spendingKey,
        nullifyingKey,
        masterPublicKey,
      };

      // Store in localStorage organized by wallet address and pool ID
      const identifier = getDefaultIdentifier(walletAddress);
      const toStore: StoredKeypair = {
        spendingKey: bigIntToHex(spendingKey),
        nullifyingKey: bigIntToHex(nullifyingKey),
        masterPublicKey: bigIntToHex(masterPublicKey),
        timestamp: Date.now(),
      };

      // Save to the list of keypairs
      saveKeypair(identifier, toStore);

      // Set as active keypair
      setActiveKeypair(identifier, toStore);

      // Update state
      setKeypair(newKeypair);
      setSavedKeypairs(getSavedKeypairs(identifier));

      return newKeypair;
    } catch (error) {
      console.error("Failed to generate keypair:", error);
      throw error;
    }
  }, [poseidonReady, walletAddress]);

  // Select an existing keypair
  const selectKeypair = useCallback(
    (masterPublicKey: string) => {
      if (!walletAddress) return;

      const identifier = getDefaultIdentifier(walletAddress);
      const saved = getSavedKeypairs(identifier);
      const selected = saved.find((kp) => kp.masterPublicKey === masterPublicKey);

      if (selected) {
        const keypairObj: OctopusKeypair = {
          spendingKey: hexToBigInt(selected.spendingKey),
          nullifyingKey: hexToBigInt(selected.nullifyingKey),
          masterPublicKey: hexToBigInt(selected.masterPublicKey),
        };

        setKeypair(keypairObj);
        setActiveKeypair(identifier, selected);
      }
    },
    [walletAddress]
  );

  // Clear active keypair (but keep it in saved list)
  const clearKeypair = useCallback(() => {
    if (!walletAddress) return;

    const identifier = getDefaultIdentifier(walletAddress);
    clearActiveKeypair(identifier);
    setKeypair(null);
  }, [walletAddress]);

  // Delete a keypair permanently from saved list
  const removeKeypair = useCallback(
    (masterPublicKey: string) => {
      if (!walletAddress) return;

      const identifier = getDefaultIdentifier(walletAddress);
      deleteKeypair(identifier, masterPublicKey);

      // If the removed keypair was active, clear it
      if (keypair && bigIntToHex(keypair.masterPublicKey) === masterPublicKey) {
        setKeypair(null);
        clearActiveKeypair(identifier);
      }

      // Update saved keypairs list
      setSavedKeypairs(getSavedKeypairs(identifier));
    },
    [walletAddress, keypair]
  );

  return {
    keypair,
    isLoading,
    poseidonReady,
    savedKeypairs,
    generateKeypair,
    selectKeypair,
    clearKeypair,
    removeKeypair,
    hasKeypair: keypair !== null,
  };
}
