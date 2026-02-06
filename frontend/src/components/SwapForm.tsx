"use client";

import { useState, useEffect } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { cn, parseSui, formatSui } from "@/lib/utils";
import { PACKAGE_ID, POOL_ID, SUI_COIN_TYPE, CIRCUIT_URLS } from "@/lib/constants";
import type { OctopusKeypair } from "@/hooks/useLocalKeypair";
import type { OwnedNote } from "@/hooks/useNotes";
import {
  generateSwapProof,
  convertSwapProofToSui,
  calculateMinOutput,
  estimateCetusSwap,
  buildSwapTransaction,
  selectNotesForTransfer,
  createNote,
  randomFieldElement,
  encryptNote,
  deriveViewingPublicKey,
  poseidonHash,
  type SwapParams,
  type SwapInput,
  type SelectableNote,
} from "@june_zk/octopus-sdk";
import { initPoseidon } from "@/lib/poseidon";
import { NumberInput } from "@/components/NumberInput";

interface SwapFormProps {
  keypair: OctopusKeypair | null;
  notes: OwnedNote[];
  loading: boolean;
  error: string | null;
  onSuccess?: () => void | Promise<void>;
  onRefresh?: () => void | Promise<void>;
  markNoteSpent?: (nullifier: bigint) => void;
}

// Mock price oracle (for demo purposes)
// TODO: Replace with real Cetus DEX integration
const MOCK_PRICES = {
  SUI_USDC: 3.0, // 1 SUI = 3 USDC
  USDC_SUI: 1 / 3.0, // 1 USDC = 0.333 SUI
};

// Token types
const TOKENS = {
  SUI: {
    type: "0x2::sui::SUI",
    symbol: "SUI",
    decimals: 9,
    poolId: POOL_ID, // TODO: Use actual SUI pool ID
  },
  USDC: {
    type: "0x...", // TODO: Add real USDC type
    symbol: "USDC",
    decimals: 6,
    poolId: "0x...", // TODO: Add USDC pool ID
  },
};

export function SwapForm({ keypair, notes, loading: notesLoading, error: notesError, onSuccess, onRefresh, markNoteSpent }: SwapFormProps) {
  const [amountIn, setAmountIn] = useState("");
  const [amountOut, setAmountOut] = useState("");
  const [tokenIn, setTokenIn] = useState<"SUI" | "USDC">("SUI");
  const [tokenOut, setTokenOut] = useState<"SUI" | "USDC">("USDC");
  const [slippage, setSlippage] = useState(50); // 0.5% in bps
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [priceImpact, setPriceImpact] = useState<number>(0);

  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  // Switch token pair
  const handleSwitchTokens = () => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn(amountOut);
    setAmountOut("");
  };

  // Estimate output amount when input changes
  useEffect(() => {
    const estimateOutput = async () => {
      if (!amountIn || parseFloat(amountIn) <= 0) {
        setAmountOut("");
        setPriceImpact(0);
        return;
      }

      setIsEstimating(true);
      try {
        const amountInFloat = parseFloat(amountIn);

        // Use mock prices for demo
        // TODO: Replace with real Cetus DEX integration
        let price: number;
        let outputDecimals: number;

        if (tokenIn === "SUI" && tokenOut === "USDC") {
          price = MOCK_PRICES.SUI_USDC;
          outputDecimals = TOKENS.USDC.decimals;
        } else if (tokenIn === "USDC" && tokenOut === "SUI") {
          price = MOCK_PRICES.USDC_SUI;
          outputDecimals = TOKENS.SUI.decimals;
        } else {
          // Same token, no swap
          setAmountOut(amountIn);
          setPriceImpact(0);
          setIsEstimating(false);
          return;
        }

        // Calculate output amount
        const outputAmount = amountInFloat * price;

        // Mock price impact (0.1% - 0.5% based on amount)
        const mockImpact = Math.min(0.5, (amountInFloat / 100) * 0.1);

        setAmountOut(outputAmount.toFixed(outputDecimals));
        setPriceImpact(mockImpact);
      } catch (err) {
        console.error("Failed to estimate output:", err);
        setAmountOut("0");
      } finally {
        setIsEstimating(false);
      }
    };

    const debounce = setTimeout(estimateOutput, 500);
    return () => clearTimeout(debounce);
  }, [amountIn, tokenIn, tokenOut]);

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

    if (!amountIn || parseFloat(amountIn) <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    if (!amountOut || parseFloat(amountOut) <= 0) {
      setError("Cannot estimate output amount");
      return;
    }

    setIsSubmitting(true);

    try {
      await initPoseidon();

      const amountInBigInt = parseSui(amountIn);
      const amountOutBigInt = parseSui(amountOut);
      const minAmountOut = calculateMinOutput(amountOutBigInt, slippage);

      // Get unspent notes
      const unspentNotes = notes.filter((n: OwnedNote) => !n.spent);

      if (unspentNotes.length === 0) {
        setError("No unspent notes found. Please shield tokens first.");
        setIsSubmitting(false);
        return;
      }

      // 1. Select notes for swap (use transfer selection logic)
      const selectableNotes: SelectableNote[] = unspentNotes.map((ownedNote: OwnedNote) => ({
        note: ownedNote.note,
        leafIndex: ownedNote.leafIndex,
        pathElements: ownedNote.pathElements,
      }));

      const selectedNotes = selectNotesForTransfer(selectableNotes, amountInBigInt);

      if (selectedNotes.some(n => !n.pathElements || n.pathElements.length === 0)) {
        throw new Error("Selected notes missing Merkle proofs. Please refresh your notes.");
      }

      // Mark selected notes as spent locally to prevent double-spending during proof generation
      const selectedOwnedNotes = unspentNotes.filter((ownedNote: OwnedNote) =>
        selectedNotes.some(sn => sn.leafIndex === ownedNote.leafIndex)
      );
      selectedOwnedNotes.forEach((ownedNote: OwnedNote) => {
        markNoteSpent?.(ownedNote.nullifier);
      });

      // 2. Get token IDs from selected notes
      const inputTokenId = selectedNotes[0].note.token;
      // For output token, we use a simple hash for now (TODO: proper token registry)
      // For SUI->USDC swap, output should be USDC token ID
      // For now, we'll use a placeholder that matches the mock implementation
      const outputTokenId = tokenIn === "SUI"
        ? poseidonHash([BigInt(0x3)]) // Mock USDC token ID
        : poseidonHash([BigInt(0x2)]); // SUI token ID

      // 3. Build swap parameters
      const swapParams: SwapParams = {
        tokenIn: inputTokenId,
        tokenOut: outputTokenId,
        amountIn: amountInBigInt,
        minAmountOut,
        dexPoolId: 1n, // Mock DEX pool ID for testing
        slippageBps: slippage,
      };

      // 4. Create output note (swapped tokens for recipient - self)
      const outputRandom = randomFieldElement();
      const outputNote = createNote(
        keypair.masterPublicKey,
        outputTokenId,
        amountOutBigInt,
        outputRandom
      );

      // 5. Calculate change amount (remaining input tokens)
      const totalInputValue = selectedNotes.reduce((sum, n) => sum + n.note.value, 0n);
      const changeAmount = totalInputValue - amountInBigInt;

      const changeRandom = randomFieldElement();
      const changeNote = createNote(
        keypair.masterPublicKey,
        inputTokenId,
        changeAmount,
        changeRandom
      );

      // 6. Build swap input for proof generation
      // Debug: Verify NSK derivation and Merkle proofs for each input note
      console.log("=== Swap Input Verification ===");
      const MERKLE_TREE_DEPTH = 16;
      const computedRoots: bigint[] = [];

      for (let i = 0; i < selectedNotes.length; i++) {
        const note = selectedNotes[i].note;
        const expectedNSK = poseidonHash([keypair.masterPublicKey, note.random]);
        const matches = expectedNSK === note.nsk;

        // Compute Merkle root from this note's proof
        let root = note.commitment;
        const leafIndex = BigInt(selectedNotes[i].leafIndex);
        const pathElements = selectedNotes[i].pathElements!;

        for (let level = 0; level < MERKLE_TREE_DEPTH; level++) {
          const sibling = pathElements[level];
          const isRight = (leafIndex >> BigInt(level)) & 1n;
          if (isRight === 0n) {
            root = poseidonHash([root, sibling]);
          } else {
            root = poseidonHash([sibling, root]);
          }
        }

        computedRoots.push(root);

        console.log(`Input Note ${i}:`, {
          token: note.token.toString(),
          value: note.value.toString(),
          nsk: note.nsk.toString(),
          random: note.random.toString(),
          expectedNSK: expectedNSK.toString(),
          nskMatches: matches,
          leafIndex: selectedNotes[i].leafIndex,
          commitment: note.commitment.toString(),
          merkleRoot: root.toString(),
        });

        if (!matches) {
          throw new Error(`Input note ${i} has invalid NSK! Expected ${expectedNSK} but got ${note.nsk}`);
        }
      }

      // Verify both notes have the same Merkle root
      if (computedRoots.length === 2 && computedRoots[0] !== computedRoots[1]) {
        throw new Error(
          `Merkle root mismatch detected!\n` +
          `Note 0 root: ${computedRoots[0].toString()}\n` +
          `Note 1 root: ${computedRoots[1].toString()}\n` +
          `Your notes have stale Merkle proofs. Please refresh your notes and try again.`
        );
      }

      // Verify computed root matches on-chain root
      const onChainRootResult = await client.devInspectTransactionBlock({
        transactionBlock: (() => {
          const tx = new Transaction();
          tx.moveCall({
            target: `${PACKAGE_ID}::pool::get_merkle_root`,
            typeArguments: [SUI_COIN_TYPE],
            arguments: [tx.object(POOL_ID)],
          });
          return tx;
        })(),
        sender: account?.address || "0x0",
      });

      if (onChainRootResult.results?.[0]?.returnValues?.[0]) {
        const [rootBytes] = onChainRootResult.results[0].returnValues[0];
        // Convert bytes to bigint (LE format)
        let onChainRoot = 0n;
        for (let i = 0; i < rootBytes.length; i++) {
          onChainRoot |= BigInt(rootBytes[i]) << BigInt(8 * i);
        }

        const localRoot = computedRoots[0];
        console.log("On-chain Merkle Root:", onChainRoot.toString());
        console.log("Local Merkle Root:", localRoot.toString());

        if (onChainRoot !== localRoot) {
          throw new Error(
            `Your notes have outdated Merkle proofs!\n` +
            `Local root: ${localRoot.toString()}\n` +
            `On-chain root: ${onChainRoot.toString()}\n\n` +
            `New notes have been added to the pool since you last scanned. ` +
            `Please refresh your notes and try again.`
          );
        }

        console.log("✓ Merkle proof validation passed!");
      }

      console.log("MPK:", keypair.masterPublicKey.toString());
      console.log("Token In:", inputTokenId.toString());
      console.log("Token Out:", outputTokenId.toString());
      console.log("Merkle Root (verified):", computedRoots[0]?.toString());

      const swapInput: SwapInput = {
        keypair,
        inputNotes: selectedNotes.map(n => n.note),
        inputLeafIndices: selectedNotes.map(n => n.leafIndex),
        inputPathElements: selectedNotes.map(n => n.pathElements!),
        swapParams,
        outputNSK: outputNote.nsk,
        outputRandom: outputNote.random,
        outputValue: outputNote.value,
        changeNSK: changeNote.nsk,
        changeRandom: changeNote.random,
        changeValue: changeNote.value,
      };

      // 7. Generate ZK proof (30-60 seconds)
      const { proof, publicSignals } = await generateSwapProof(swapInput, {
        wasmPath: CIRCUIT_URLS.SWAP.WASM,
        zkeyPath: CIRCUIT_URLS.SWAP.ZKEY,
      });

      // 8. Convert proof to Sui format
      const suiProof = convertSwapProofToSui(proof, publicSignals);

      // 9. Encrypt notes for recipient (self)
      const myViewingPk = deriveViewingPublicKey(keypair.spendingKey);
      const encryptedOutputNote = encryptNote(outputNote, myViewingPk);
      const encryptedChangeNote = encryptNote(changeNote, myViewingPk);

      // 10. Build and execute transaction
      const tx = buildSwapTransaction(
        PACKAGE_ID,
        POOL_ID, // Pool for tokenIn (SUI pool for now)
        POOL_ID, // Pool for tokenOut (TODO: separate USDC pool)
        SUI_COIN_TYPE, // TokenIn type
        SUI_COIN_TYPE, // TokenOut type (TODO: USDC type)
        suiProof,
        amountInBigInt,
        minAmountOut,
        encryptedOutputNote,
        encryptedChangeNote
      );

      const result = await signAndExecute({ transaction: tx });

      setSuccess(`Swap successful! TX: ${result.digest}`);
      if (onSuccess) await onSuccess();
    } catch (err) {
      console.error("Swap failed:", err);
      setError(err instanceof Error ? err.message : "Swap failed");

      // If transaction fails, trigger refresh to reconcile state
      if (onRefresh) {
        setTimeout(() => {
          onRefresh();
        }, 1000);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const unspentNotes = notes.filter((n) => !n.spent);
  const isFormValid =
    !!account &&
    !!keypair &&
    !!amountIn &&
    parseFloat(amountIn) > 0 &&
    !!amountOut &&
    parseFloat(amountOut) > 0 &&
    unspentNotes.length > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="p-3 border border-yellow-600/30 bg-yellow-900/20 clip-corner">
        <div className="flex items-start gap-2">
          <span className="text-yellow-500 text-sm">!</span>
          <p className="text-xs text-yellow-400 font-mono leading-relaxed">
            Swap uses simulated prices (1 SUI = 3 USDC). Real Cetus DEX integration in progress.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Token In */}
        <div>
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
            From
          </label>
          <div className="flex gap-2">
            <select
              value={tokenIn}
              onChange={(e) => setTokenIn(e.target.value as "SUI" | "USDC")}
              className="input w-24"
              disabled={isSubmitting}
            >
              <option value="SUI">SUI</option>
              <option value="USDC">USDC</option>
            </select>
            <NumberInput
              value={amountIn}
              onChange={setAmountIn}
              placeholder="0.0"
              step={0.000000001}
              min={0}
              disabled={isSubmitting}
              className="flex-1"
            />
          </div>
        </div>

        {/* Swap Direction Button */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleSwitchTokens}
            className="p-2 clip-corner border border-cyber-blue/30 hover:bg-cyber-blue/10 transition"
            disabled={isSubmitting}
          >
            <svg className="w-5 h-5 text-cyber-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </button>
        </div>

        {/* Token Out */}
        <div>
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
            To (Estimated)
          </label>
          <div className="flex gap-2">
            <select
              value={tokenOut}
              onChange={(e) => setTokenOut(e.target.value as "SUI" | "USDC")}
              className="input w-24"
              disabled={isSubmitting}
            >
              <option value="SUI">SUI</option>
              <option value="USDC">USDC</option>
            </select>
            <input
              type="text"
              value={isEstimating ? "Estimating..." : amountOut}
              readOnly
              className="input flex-1 bg-black/30"
            />
          </div>
          {isEstimating && (
            <p className="mt-2 text-[10px] text-gray-500 font-mono flex items-center gap-2">
              <svg
                className="h-3 w-3 animate-spin text-cyber-blue"
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
              FETCHING PRICE...
            </p>
          )}
          {!isEstimating && amountOut && parseFloat(amountOut) > 0 && (
            <p className="mt-2 text-[10px] text-yellow-500 font-mono flex items-center gap-1">
              <span>⚠</span>
              <span>SIMULATED PRICE (1 SUI = {MOCK_PRICES.SUI_USDC} USDC)</span>
            </p>
          )}
        </div>

        {/* Slippage Settings */}
        <div>
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
            Slippage Tolerance
          </label>
          <div className="flex gap-2">
            {[10, 50, 100, 500].map((bps) => (
              <button
                key={bps}
                type="button"
                onClick={() => setSlippage(bps)}
                disabled={isSubmitting}
                className={cn(
                  "px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider transition clip-corner",
                  slippage === bps
                    ? "bg-cyber-blue text-black border border-cyber-blue"
                    : "bg-black/30 text-gray-400 border border-gray-800 hover:border-cyber-blue/50"
                )}
              >
                {bps / 100}%
              </button>
            ))}
          </div>
        </div>

        {/* Price Impact */}
        {priceImpact > 0 && (
          <div className="p-3 border border-cyber-blue/30 bg-cyber-blue/10 clip-corner">
            <p className="text-[10px] text-gray-300 font-mono">
              <span className="text-gray-500">PRICE IMPACT:</span>{" "}
              <span className={cn(
                "font-bold",
                priceImpact > 5 ? "text-red-400" : "text-green-400"
              )}>
                {priceImpact.toFixed(2)}%
              </span>
            </p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-3 border border-red-600/30 bg-red-900/20 clip-corner">
            <div className="flex items-start gap-2">
              <span className="text-red-500 text-sm">✕</span>
              <p className="text-xs text-red-400 font-mono leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {/* Success Message */}
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
        disabled={!isFormValid || isSubmitting}
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
          "⇄ PRIVATE SWAP"
        )}
      </button>

      {/* Info Box */}
      <div className="p-4 border border-gray-800 bg-black/30 clip-corner space-y-3">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-cyber-blue font-mono">
          Swap Process:
        </h4>
        <ol className="text-[10px] text-gray-400 space-y-1.5 list-decimal list-inside font-mono leading-relaxed">
          <li>Select input notes from pool</li>
          <li>Fetch price from Cetus DEX</li>
          <li>Generate Merkle proofs</li>
          <li>Calculate nullifiers (prevent double-spending)</li> 
          <li>Generate ZK proof (30-60s)</li>
          <li>Execute private swap</li>
          <li>Shield output tokens to pool</li>
        </ol>
        <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent" />
        <p className="text-[10px] text-gray-500 font-mono">
          <span className="text-cyber-blue">◉</span> Privacy: Swap amounts and addresses remain hidden via ZK proofs
        </p>
      </div>
    </form>
  );
}
