"use client";

import { useState, useEffect, useCallback } from "react";
import { STORAGE_KEYS } from "@/lib/constants";
import { bigIntToHex, hexToBigInt } from "@/lib/utils";

export interface RailgunKeypair {
  spendingKey: bigint;
  nullifyingKey: bigint;
  masterPublicKey: bigint;
}

interface StoredKeypair {
  spendingKey: string;
  nullifyingKey: string;
  masterPublicKey: string;
}

/**
 * Hook to manage Railgun keypair in localStorage
 * For demo purposes only - not secure for production!
 */
export function useLocalKeypair() {
  const [keypair, setKeypair] = useState<RailgunKeypair | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [poseidonReady, setPoseidonReady] = useState(false);

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

        // Load existing keypair from localStorage
        const stored = localStorage.getItem(STORAGE_KEYS.KEYPAIR);
        if (stored) {
          const parsed: StoredKeypair = JSON.parse(stored);
          setKeypair({
            spendingKey: hexToBigInt(parsed.spendingKey),
            nullifyingKey: hexToBigInt(parsed.nullifyingKey),
            masterPublicKey: hexToBigInt(parsed.masterPublicKey),
          });
        }
      } catch (error) {
        console.error("Failed to initialize:", error);
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, []);

  // Generate a new keypair
  const generateKeypair = useCallback(async () => {
    if (!poseidonReady) {
      throw new Error("Poseidon not ready");
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

      const newKeypair: RailgunKeypair = {
        spendingKey,
        nullifyingKey,
        masterPublicKey,
      };

      // Store in localStorage
      const toStore: StoredKeypair = {
        spendingKey: bigIntToHex(spendingKey),
        nullifyingKey: bigIntToHex(nullifyingKey),
        masterPublicKey: bigIntToHex(masterPublicKey),
      };
      localStorage.setItem(STORAGE_KEYS.KEYPAIR, JSON.stringify(toStore));

      setKeypair(newKeypair);
      return newKeypair;
    } catch (error) {
      console.error("Failed to generate keypair:", error);
      throw error;
    }
  }, [poseidonReady]);

  // Clear keypair
  const clearKeypair = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.KEYPAIR);
    setKeypair(null);
  }, []);

  return {
    keypair,
    isLoading,
    poseidonReady,
    generateKeypair,
    clearKeypair,
    hasKeypair: keypair !== null,
  };
}
