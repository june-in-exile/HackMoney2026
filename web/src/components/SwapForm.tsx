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
import type { RailgunKeypair } from "@/hooks/useLocalKeypair";
import {
  initPoseidon,
  generateSwapProof,
  calculateMinAmountOut,
  estimateSwapOutput,
  buildSwapTransaction,
  type SwapParams,
  type SwapInput,
} from "@octopus/sdk";

interface SwapFormProps {
  keypair: RailgunKeypair | null;
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
      // const proof = await generateSwapProof(swapInput);

      // Build transaction
      // const tx = buildSwapTransaction(
      //   PACKAGE_ID,
      //   TOKENS[tokenIn].poolId,
      //   TOKENS[tokenOut].poolId,
      //   TOKENS[tokenIn].type,
      //   TOKENS[tokenOut].type,
      //   proof,
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
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
        Private Swap
      </h2>

      {!DEMO_MODE && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            ⚠️ Swap functionality requires production Cetus integration. Currently in development.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Token In */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            From
          </label>
          <div className="flex gap-2">
            <select
              value={tokenIn}
              onChange={(e) => setTokenIn(e.target.value as "SUI" | "USDC")}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="SUI">SUI</option>
              <option value="USDC">USDC</option>
            </select>
            <input
              type="number"
              step="0.000001"
              value={amountIn}
              onChange={(e) => setAmountIn(e.target.value)}
              placeholder="0.0"
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
        </div>

        {/* Swap Direction Button */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleSwitchTokens}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </button>
        </div>

        {/* Token Out */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            To (estimated)
          </label>
          <div className="flex gap-2">
            <select
              value={tokenOut}
              onChange={(e) => setTokenOut(e.target.value as "SUI" | "USDC")}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="SUI">SUI</option>
              <option value="USDC">USDC</option>
            </select>
            <input
              type="text"
              value={isEstimating ? "Estimating..." : amountOut}
              readOnly
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
        </div>

        {/* Slippage Settings */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Slippage Tolerance
          </label>
          <div className="flex gap-2">
            {[10, 50, 100, 500].map((bps) => (
              <button
                key={bps}
                type="button"
                onClick={() => setSlippage(bps)}
                className={cn(
                  "px-3 py-1 rounded-md text-sm font-medium transition",
                  slippage === bps
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                )}
              >
                {bps / 100}%
              </button>
            ))}
          </div>
        </div>

        {/* Price Impact */}
        {priceImpact > 0 && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Price Impact: <span className={cn(
              priceImpact > 5 ? "text-red-600 dark:text-red-400 font-semibold" : "text-green-600 dark:text-green-400"
            )}>
              {priceImpact.toFixed(2)}%
            </span>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
            <p className="text-sm text-green-800 dark:text-green-200">{success}</p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!isFormValid || isSubmitting}
          className={cn(
            "w-full py-3 px-4 rounded-md font-medium transition",
            isFormValid && !isSubmitting
              ? "bg-blue-600 hover:bg-blue-700 text-white"
              : "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
          )}
        >
          {isSubmitting ? "Generating Proof..." : "Swap Privately"}
        </button>
      </form>

      {/* Info Box */}
      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
        <p className="text-xs text-blue-800 dark:text-blue-200">
          <strong>Privacy:</strong> Swap executes through Cetus DEX while keeping amounts and addresses private via ZK proofs.
          The output token is shielded into your private pool automatically.
        </p>
      </div>
    </div>
  );
}
