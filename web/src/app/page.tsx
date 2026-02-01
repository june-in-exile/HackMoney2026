"use client";

import { useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { Header } from "@/components/Header";
import { KeypairSetup } from "@/components/KeypairSetup";
import { BalanceCard } from "@/components/BalanceCard";
import { ShieldForm } from "@/components/ShieldForm";
import { UnshieldForm } from "@/components/UnshieldForm";
import { TransferForm } from "@/components/TransferForm";
import { useLocalKeypair } from "@/hooks/useLocalKeypair";
import { useShieldedBalance } from "@/hooks/useShieldedBalance";

type TabType = "shield" | "unshield" | "transfer";

export default function Home() {
  const account = useCurrentAccount();
  const [activeTab, setActiveTab] = useState<TabType>("shield");

  const { keypair, isLoading, generateKeypair, clearKeypair } =
    useLocalKeypair();

  // Fetch shielded balance from blockchain
  const {
    balance: shieldedBalance,
    noteCount,
    notes,
    isLoading: isLoadingBalance,
    refresh: refreshBalance,
  } = useShieldedBalance(keypair);

  const handleShieldSuccess = async () => {
    // Refresh balance from blockchain after successful shield
    await refreshBalance();
  };

  const handleUnshieldSuccess = async () => {
    // Refresh balance from blockchain after successful unshield
    await refreshBalance();
  };

  const handleTransferSuccess = async () => {
    // Refresh balance from blockchain after successful transfer
    await refreshBalance();
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
                shieldedBalance={shieldedBalance}
                noteCount={noteCount}
                isLoading={isLoading || isLoadingBalance}
              />
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Tab Navigation */}
              <div className="card">
                <div className="flex border-b border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => setActiveTab("shield")}
                    className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                      activeTab === "shield"
                        ? "border-b-2 border-purple-500 text-purple-600 dark:text-purple-400"
                        : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                    }`}
                  >
                    Shield
                  </button>
                  <button
                    onClick={() => setActiveTab("transfer")}
                    className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                      activeTab === "transfer"
                        ? "border-b-2 border-purple-500 text-purple-600 dark:text-purple-400"
                        : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                    }`}
                  >
                    Transfer
                  </button>
                  <button
                    onClick={() => setActiveTab("unshield")}
                    className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                      activeTab === "unshield"
                        ? "border-b-2 border-purple-500 text-purple-600 dark:text-purple-400"
                        : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                    }`}
                  >
                    Unshield
                  </button>
                </div>

                {/* Tab Content */}
                <div className="p-6">
                  {activeTab === "shield" && (
                    <ShieldForm keypair={keypair} onSuccess={handleShieldSuccess} />
                  )}
                  {activeTab === "transfer" && (
                    <TransferForm keypair={keypair} onSuccess={handleTransferSuccess} />
                  )}
                  {activeTab === "unshield" && (
                    <UnshieldForm
                      keypair={keypair}
                      maxAmount={shieldedBalance}
                      notes={notes}
                      onSuccess={handleUnshieldSuccess}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Info Section */}
        <div className="mt-12 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            How It Works
          </h2>
          <div className="grid gap-4 md:grid-cols-4">
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
                Transfer
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Send private notes to other users within the pool. Sender, recipient, and amount remain hidden.
              </p>
            </div>
            <div>
              <div className="mb-2 text-2xl">3️⃣</div>
              <h3 className="mb-1 font-medium text-gray-900 dark:text-white">
                Hold
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Your shielded balance is private. Only you can see it with your
                keypair.
              </p>
            </div>
            <div>
              <div className="mb-2 text-2xl">4️⃣</div>
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
