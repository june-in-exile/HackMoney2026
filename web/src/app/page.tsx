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
    // Add delay to allow blockchain events to be indexed
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await refreshBalance();

    // Retry after another delay to ensure we catch the event
    setTimeout(async () => {
      await refreshBalance();
    }, 3000);
  };

  const handleUnshieldSuccess = async () => {
    // Refresh balance from blockchain after successful unshield
    // Add delay to allow blockchain events to be indexed
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await refreshBalance();

    // Retry after another delay to ensure we catch the event
    setTimeout(async () => {
      await refreshBalance();
    }, 3000);
  };

  const handleTransferSuccess = async () => {
    // Refresh balance from blockchain after successful transfer
    // Add delay to allow blockchain events to be indexed
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await refreshBalance();

    // Retry after another delay to ensure we catch the event
    setTimeout(async () => {
      await refreshBalance();
    }, 3000);
  };

  return (
    <div className="min-h-screen">
      <Header />

      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* Hero Section */}
        <div className="mb-12 text-center relative">
          <div className="inline-block relative mb-4">
            <h1 className="text-5xl font-black tracking-tighter text-cyber-blue uppercase relative z-10 text-cyber">
              PRIVACY PROTOCOL
            </h1>
            <div className="absolute -inset-1 bg-cyber-blue/20 blur-xl -z-10 animate-pulse-slow" />
          </div>
          <p className="text-gray-400 text-sm tracking-wider uppercase font-mono">
            [ SHIELD // TRANSFER // UNSHIELD ] — ZK-PROOF ENABLED
          </p>
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-600 font-mono">
            <span className="w-2 h-2 bg-cyber-blue rounded-full animate-pulse" />
            <span>SYSTEM ONLINE</span>
          </div>
        </div>

        {!account ? (
          // Not connected state
          <div className="mx-auto max-w-xl">
            <div className="card-glow text-center py-12">
              <div className="mb-6 w-20 h-20 mx-auto border-4 border-cyber-blue bg-cyber-blue/10 flex items-center justify-center clip-corner filter drop-shadow-[0_0_20px_rgba(0,217,255,0.5)]">
                <span className="text-cyber-blue text-4xl font-black">◐</span>
              </div>
              <h2 className="mb-3 text-2xl font-black uppercase tracking-wider text-cyber-blue text-cyber">
                WALLET CONNECTION REQUIRED
              </h2>
              <p className="text-gray-400 font-mono text-sm">
                // Initialize Sui wallet to access privacy protocol
              </p>
              <div className="mt-6 h-px bg-gradient-to-r from-transparent via-cyber-blue to-transparent" />
            </div>
          </div>
        ) : (
          // Connected state
          <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
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
                onRefresh={refreshBalance}
              />
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Tab Navigation */}
              <div className="card">
                <div className="flex border-b-2 border-gray-800 relative">
                  <button
                    onClick={() => setActiveTab("shield")}
                    className={`tab-button flex-1 ${
                      activeTab === "shield"
                        ? "text-cyber-blue active"
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    ▲ SHIELD
                  </button>
                  <button
                    onClick={() => setActiveTab("transfer")}
                    className={`tab-button flex-1 ${
                      activeTab === "transfer"
                        ? "text-cyber-blue active"
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    ⇄ TRANSFER
                  </button>
                  <button
                    onClick={() => setActiveTab("unshield")}
                    className={`tab-button flex-1 ${
                      activeTab === "unshield"
                        ? "text-cyber-blue active"
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    ▼ UNSHIELD
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
        <div className="mt-16 card border-gray-800">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1 h-6 bg-gradient-to-b from-cyber-blue to-transparent" />
            <h2 className="text-xl font-black uppercase tracking-wider text-cyber-blue">
              PROTOCOL WORKFLOW
            </h2>
          </div>
          <div className="grid gap-6 md:grid-cols-4">
            <div className="group relative p-4 border border-gray-800 hover:border-cyber-blue transition-all duration-300 clip-corner">
              <div className="absolute top-0 right-0 text-6xl font-black text-gray-900 opacity-20 select-none">01</div>
              <div className="relative z-10">
                <div className="mb-3 w-10 h-10 rounded-full bg-cyber-blue/10 flex items-center justify-center border border-cyber-blue/30">
                  <span className="text-cyber-blue text-xl">▲</span>
                </div>
                <h3 className="mb-2 font-bold uppercase tracking-wider text-cyber-blue text-sm">
                  SHIELD
                </h3>
                <p className="text-xs text-gray-400 font-mono leading-relaxed">
                  Deposit SUI into privacy pool. Tokens converted to encrypted notes.
                </p>
              </div>
            </div>
            <div className="group relative p-4 border border-gray-800 hover:border-cyber-blue transition-all duration-300 clip-corner">
              <div className="absolute top-0 right-0 text-6xl font-black text-gray-900 opacity-20 select-none">02</div>
              <div className="relative z-10">
                <div className="mb-3 w-10 h-10 rounded-full bg-cyber-blue/10 flex items-center justify-center border border-cyber-blue/30">
                  <span className="text-cyber-blue text-xl">⇄</span>
                </div>
                <h3 className="mb-2 font-bold uppercase tracking-wider text-cyber-blue text-sm">
                  TRANSFER
                </h3>
                <p className="text-xs text-gray-400 font-mono leading-relaxed">
                  Private transactions within pool. Sender, recipient, amount hidden.
                </p>
              </div>
            </div>
            <div className="group relative p-4 border border-gray-800 hover:border-cyber-blue transition-all duration-300 clip-corner">
              <div className="absolute top-0 right-0 text-6xl font-black text-gray-900 opacity-20 select-none">03</div>
              <div className="relative z-10">
                <div className="mb-3 w-10 h-10 rounded-full bg-cyber-blue/10 flex items-center justify-center border border-cyber-blue/30">
                  <span className="text-cyber-blue text-xl">●</span>
                </div>
                <h3 className="mb-2 font-bold uppercase tracking-wider text-cyber-blue text-sm">
                  HOLD
                </h3>
                <p className="text-xs text-gray-400 font-mono leading-relaxed">
                  Shielded balance encrypted. Only accessible with your keypair.
                </p>
              </div>
            </div>
            <div className="group relative p-4 border border-gray-800 hover:border-cyber-blue transition-all duration-300 clip-corner">
              <div className="absolute top-0 right-0 text-6xl font-black text-gray-900 opacity-20 select-none">04</div>
              <div className="relative z-10">
                <div className="mb-3 w-10 h-10 rounded-full bg-cyber-blue/10 flex items-center justify-center border border-cyber-blue/30">
                  <span className="text-cyber-blue text-xl">▼</span>
                </div>
                <h3 className="mb-2 font-bold uppercase tracking-wider text-cyber-blue text-sm">
                  UNSHIELD
                </h3>
                <p className="text-xs text-gray-400 font-mono leading-relaxed">
                  Withdraw via ZK-proof. Deposit-withdrawal linkage impossible.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t-2 border-gray-900 py-8 relative">
        <div className="absolute inset-0 bg-gradient-to-t from-cyber-dark-bg to-transparent opacity-50" />
        <div className="mx-auto max-w-6xl px-4 text-center relative z-10">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="h-px w-16 bg-gradient-to-r from-transparent to-cyber-blue/50" />
            <span className="text-xs text-gray-600 font-mono tracking-widest uppercase">OCTOPUS PROTOCOL</span>
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-cyber-blue/50" />
          </div>
          <p className="text-xs text-gray-500 font-mono">
            Built with Railgun protocol on Sui •{" "}
            <a
              href="https://github.com/june-in-exile/Octopus"
              className="text-cyber-blue hover:text-cyber-blue/80 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              [SOURCE_CODE]
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
