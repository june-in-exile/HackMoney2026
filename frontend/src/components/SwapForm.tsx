"use client";

import { useState, useEffect } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { cn, parseSui, formatSui } from "@/lib/utils";
import { PACKAGE_ID, POOL_ID, SUI_COIN_TYPE, DEMO_MODE } from "@/lib/constants";
import type { OctopusKeypair } from "@/hooks/useLocalKeypair";
import {
  generateSwapProof,
  convertSwapProofToSui,
  calculateMinAmountOut,
  estimateSwapOutput,
  buildSwapTransaction,
  type SwapParams,
  type SwapInput,
} from "@octopus/sdk";
import { initPoseidon } from "@/lib/poseidon";

interface SwapFormProps {
  keypair: OctopusKeypair | null;
  onSuccess?: () => void | Promise<void>;
}

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

export function SwapForm({ keypair, onSuccess }: SwapFormProps) {
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
        const amountInBigInt = parseSui(amountIn);
        const tokenInType = BigInt(TOKENS[tokenIn].type.slice(0, 10)); // Mock token ID
        const tokenOutType = BigInt(TOKENS[tokenOut].type.slice(0, 10));

        // TODO: Replace with real Cetus price fetching
        const { amountOut: estimatedOut, priceImpact: impact } = await estimateSwapOutput(
          "CETUS_POOL_ID", // TODO: Get real pool ID
          tokenInType,
          tokenOutType,
          amountInBigInt
        );

        setAmountOut(formatSui(estimatedOut));
        setPriceImpact(impact);
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
      const minAmountOut = calculateMinAmountOut(amountOutBigInt, slippage);

      // TODO: Fetch user's private notes from pool
      // For now, use placeholder notes
      const inputNotes = []; // TODO: Get actual notes from scanning events

      if (inputNotes.length === 0) {
        setError("No private notes found. Please shield tokens first.");
        setIsSubmitting(false);
        return;
      }

      // Build swap parameters
      const swapParams: SwapParams = {
        tokenIn: BigInt(TOKENS[tokenIn].type.slice(0, 10)),
        tokenOut: BigInt(TOKENS[tokenOut].type.slice(0, 10)),
        amountIn: amountInBigInt,
        minAmountOut,
        dexPoolId: 1n, // TODO: Get real Cetus pool ID
        slippageBps: slippage,
      };

      // TODO: Build complete swap input with Merkle proofs
      // This requires:
      // 1. Scanning ShieldEvents to build Merkle tree
      // 2. Finding user's notes and their leaf indices
      // 3. Computing Merkle proofs for each input note

      if (DEMO_MODE) {
        setError("Swap demo not yet implemented. Enable production mode with real notes.");
        setIsSubmitting(false);
        return;
      }

      // Generate ZK proof
      // const swapInput: SwapInput = { ... };
      // const { proof, publicSignals } = await generateSwapProof(swapInput);
      // const suiProof = convertSwapProofToSui(proof, publicSignals);

      // Build transaction
      // const tx = buildSwapTransaction(
      //   PACKAGE_ID,
      //   TOKENS[tokenIn].poolId,
      //   TOKENS[tokenOut].poolId,
      //   TOKENS[tokenIn].type,
      //   TOKENS[tokenOut].type,
      //   suiProof,
      //   amountInBigInt,
      //   minAmountOut,
      //   encryptedOutputNote,
      //   encryptedChangeNote
      // );

      // Execute transaction
      // const result = await signAndExecute({
      //   transaction: tx,
      //   options: {
      //     showEffects: true,
      //     showObjectChanges: true,
      //   },
      // });

      // setSuccess(`Swap successful! TX: ${result.digest}`);
      // if (onSuccess) await onSuccess();
    } catch (err) {
      console.error("Swap failed:", err);
      setError(err instanceof Error ? err.message : "Swap failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid =
    !!account &&
    !!keypair &&
    !!amountIn &&
    parseFloat(amountIn) > 0 &&
    !!amountOut &&
    parseFloat(amountOut) > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {!DEMO_MODE && (
        <div className="p-3 border border-yellow-600/30 bg-yellow-900/20 clip-corner">
          <div className="flex items-start gap-2">
            <span className="text-yellow-500 text-sm">!</span>
            <p className="text-xs text-yellow-400 font-mono leading-relaxed">
              Swap functionality requires production Cetus integration. Currently in development.
            </p>
          </div>
        </div>
      )}

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
            <input
              type="number"
              step="0.001"
              min="0"
              value={amountIn}
              onChange={(e) => setAmountIn(e.target.value)}
              placeholder="0.0"
              className="input flex-1"
              disabled={isSubmitting}
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
