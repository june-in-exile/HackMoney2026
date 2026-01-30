"use client";

import { useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { Header } from "@/components/Header";
import { KeypairSetup } from "@/components/KeypairSetup";
import { BalanceCard } from "@/components/BalanceCard";
import { ShieldForm } from "@/components/ShieldForm";
import { UnshieldForm } from "@/components/UnshieldForm";
import { useLocalKeypair } from "@/hooks/useLocalKeypair";
import { DEMO_MODE } from "@/lib/constants";

export default function Home() {
  const account = useCurrentAccount();
  const { keypair, isLoading, generateKeypair, clearKeypair } =
    useLocalKeypair();

  // Demo state for shielded balance
  const [demoBalance, setDemoBalance] = useState(0n);
  const [demoNoteCount, setDemoNoteCount] = useState(0);

  const handleShieldSuccess = () => {
    if (DEMO_MODE) {
      // In demo mode, add a random amount to balance
      setDemoBalance((prev) => prev + BigInt(Math.floor(Math.random() * 1e9)));
      setDemoNoteCount((prev) => prev + 1);
    }
  };

  const handleUnshieldSuccess = () => {
    if (DEMO_MODE) {
      setDemoBalance(0n);
      setDemoNoteCount(0);
    }
  };

  return (
    <div className="min-h-screen">
      <Header />

      <main className="mx-auto max-w-5xl px-4 py-8">
        {/* Hero Section */}
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold text-gray-900 dark:text-white">
            Privacy Pool Demo
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Shield and unshield SUI tokens with zero-knowledge proofs
          </p>
          {DEMO_MODE && (
            <p className="mt-2 text-sm text-yellow-600 dark:text-yellow-400">
              🔬 Running in demo mode - no real transactions
            </p>
          )}
        </div>

        {!account ? (
          // Not connected state
          <div className="mx-auto max-w-md">
            <div className="card text-center">
              <div className="mb-4 text-5xl">🔐</div>
              <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">
                Connect Your Wallet
              </h2>
              <p className="text-gray-500 dark:text-gray-400">
                Connect your Sui wallet to start using the privacy pool.
              </p>
            </div>
          </div>
        ) : (
          // Connected state
          <div className="grid gap-6 md:grid-cols-2">
            {/* Left Column */}
            <div className="space-y-6">
              <KeypairSetup
                keypair={keypair}
                isLoading={isLoading}
                onGenerate={generateKeypair}
                onClear={clearKeypair}
              />
              <BalanceCard
                shieldedBalance={demoBalance}
                noteCount={demoNoteCount}
                isLoading={isLoading}
              />
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              <ShieldForm keypair={keypair} onSuccess={handleShieldSuccess} />
              <UnshieldForm
                keypair={keypair}
                maxAmount={demoBalance}
                onSuccess={handleUnshieldSuccess}
              />
            </div>
          </div>
        )}

        {/* Info Section */}
        <div className="mt-12 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            How It Works
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <div className="mb-2 text-2xl">1️⃣</div>
              <h3 className="mb-1 font-medium text-gray-900 dark:text-white">
                Shield
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Deposit SUI into the privacy pool. Your tokens become private
                notes.
              </p>
            </div>
            <div>
              <div className="mb-2 text-2xl">2️⃣</div>
              <h3 className="mb-1 font-medium text-gray-900 dark:text-white">
                Hold
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Your shielded balance is private. Only you can see it with your
                keypair.
              </p>
            </div>
            <div>
              <div className="mb-2 text-2xl">3️⃣</div>
              <h3 className="mb-1 font-medium text-gray-900 dark:text-white">
                Unshield
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Withdraw using a ZK proof. No one can link your deposit to
                withdrawal.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t border-gray-200 py-6 dark:border-gray-800">
        <div className="mx-auto max-w-5xl px-4 text-center text-sm text-gray-500">
          <p>
            Built with Railgun protocol on Sui •{" "}
            <a
              href="https://github.com/june-in-exile/Octopus"
              className="text-primary-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
