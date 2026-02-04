"use client";

import { useState, useEffect } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { Header } from "@/components/Header";
import { KeypairSetup } from "@/components/KeypairSetup";
import { BalanceCard } from "@/components/BalanceCard";
import { AvailableNotesList } from "@/components/AvailableNotesList";
import { ShieldForm } from "@/components/ShieldForm";
import { UnshieldForm } from "@/components/UnshieldForm";
import { TransferForm } from "@/components/TransferForm";
import { SwapForm } from "@/components/SwapForm";
import { useLocalKeypair } from "@/hooks/useLocalKeypair";
import { useNotes } from "@/hooks/useNotes";
import { PACKAGE_ID, POOL_ID, NETWORK } from "@/lib/constants";
import { initPoseidon } from "@/lib/poseidon";

type TabType = "shield" | "unshield" | "transfer" | "swap";

export default function Home() {
  const account = useCurrentAccount();
  const [activeTab, setActiveTab] = useState<TabType>("shield");

  // Initialize Poseidon early to prevent race conditions
  useEffect(() => {
    initPoseidon().catch((err) => {
      console.error("[App] Failed to initialize Poseidon:", err);
    });
  }, []);

  const {
    keypair,
    isLoading,
    savedKeypairs,
    generateKeypair,
    selectKeypair,
    clearKeypair,
    removeKeypair,
  } = useLocalKeypair(account?.address);

  useEffect(() => {
  }, [keypair]);

  // Fetch all notes from blockchain (includes Merkle proofs)
  // Loads in background as soon as keypair is selected
  const {
    notes,
    loading: isLoadingNotes,
    error: notesError,
    refresh: refreshNotes,
    markNoteSpent,
  } = useNotes(keypair);

  useEffect(() => {
  }, [isLoadingNotes]);

  // Calculate balance and note count from loaded notes
  const unspentNotes = notes.filter((n) => !n.spent);
  const shieldedBalance = unspentNotes.reduce((sum, n) => sum + n.note.value, 0n);
  const noteCount = unspentNotes.length;

  const handleShieldSuccess = async () => {
    // Refresh notes from blockchain after successful shield
    // Add delay to allow blockchain events to be indexed
    await new Promise((resolve) => setTimeout(resolve, 2000));
    refreshNotes();

    // Retry after another delay to ensure we catch the event
    setTimeout(() => {
      refreshNotes();
    }, 3000);
  };

  const handleUnshieldSuccess = async () => {
    // Refresh notes from blockchain after successful unshield
    // Add delay to allow blockchain events to be indexed
    await new Promise((resolve) => setTimeout(resolve, 2000));
    refreshNotes();

    // Retry after another delay to ensure we catch the event
    setTimeout(() => {
      refreshNotes();
    }, 3000);
  };

  const handleTransferSuccess = async () => {
    // Refresh notes from blockchain after successful transfer
    // Add delay to allow blockchain events to be indexed
    await new Promise((resolve) => setTimeout(resolve, 2000));
    refreshNotes();

    // Retry after another delay to ensure we catch the event
    setTimeout(() => {
      refreshNotes();
    }, 3000);
  };

  const handleSwapSuccess = async () => {
    // Refresh notes from blockchain after successful swap
    // Add delay to allow blockchain events to be indexed
    await new Promise((resolve) => setTimeout(resolve, 2000));
    refreshNotes();

    // Retry after another delay to ensure we catch the event
    setTimeout(() => {
      refreshNotes();
    }, 3000);
  };

  return (
    <div className="min-h-screen">
      <Header />

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-12 relative overflow-hidden">
          {/* Scanning line effect */}
          <div className="absolute inset-0 pointer-events-none z-20">
            <div className="absolute w-full h-0.5 bg-gradient-to-r from-transparent via-cyber-blue to-transparent opacity-50 animate-scan"
              style={{ filter: 'blur(1px)' }} />
          </div>

          {/* Top corner accent */}
          <div className="absolute top-0 right-0 w-32 h-32 border-t-2 border-r-2 border-cyber-blue/30 clip-corner opacity-50" />

          {/* Main title section */}
          <div className="relative border-l-2 border-cyber-blue/50 pl-6 py-8">
            {/* Animated line */}
            <div className="absolute left-0 top-0 w-0.5 h-full bg-gradient-to-b from-cyber-blue via-cyber-purple to-transparent animate-pulse-slow" />

            <div className="flex items-center gap-4 mb-6">
              <div className="relative">
                <h1 className="text-6xl md:text-7xl font-black tracking-tighter text-cyber-blue uppercase relative z-10 text-cyber">
                  O.C.T.O.P.U.S.
                </h1>
                <div className="absolute -inset-2 bg-cyber-blue/10 blur-2xl -z-10" />
              </div>

              {/* Status indicator */}
              <div className="flex flex-col gap-1 text-xs text-gray-600 font-mono ml-auto">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-cyber-blue rounded-full animate-pulse" />
                  <span >ACTIVE</span>
                </div>
                <div className="flex items-center gap-2 opacity-70">
                  <span className="w-1 h-1 bg-cyber-purple rounded-full" />
                  <span className="text-[12px]">v1.0</span>
                </div>
              </div>
            </div>

            {/* Subtitle with grid accent */}
            <div className="relative">
              <div className="absolute -left-6 top-0 w-1 h-full bg-gradient-to-b from-transparent via-cyber-purple/30 to-transparent" />
              <p className="text-gray-400 text-sm md:text-base tracking-wider font-mono mb-4 max-w-2xl">
                On-Chain Transaction Obfuscation Protocol Underlying Sui
              </p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="text-gray-500 uppercase tracking-wider">Package:</span>
                  <a
                    href={`https://${NETWORK}.suivision.xyz/package/${PACKAGE_ID}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyber-blue hover:text-cyber-blue/80 transition-colors truncate max-w-md"
                    title={PACKAGE_ID}
                  >
                    {PACKAGE_ID.slice(0, 8)}...{PACKAGE_ID.slice(-6)}
                  </a>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="text-gray-500 uppercase tracking-wider">Pool ID:</span>
                  <a
                    href={`https://${NETWORK}.suivision.xyz/object/${POOL_ID}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyber-blue hover:text-cyber-blue/80 transition-colors truncate max-w-md"
                    title={POOL_ID}
                  >
                    {POOL_ID.slice(0, 8)}...{POOL_ID.slice(-6)}
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom corner accent */}
          <div className="absolute bottom-0 left-0 w-24 h-24 border-b-2 border-l-2 border-cyber-purple/20 clip-corner opacity-30" />
        </div>

        {!account ? (
          // Not connected state
          <div className="mx-auto max-w-xl">
            <div className="card-glow text-center py-12">
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
                savedKeypairs={savedKeypairs}
                onGenerate={generateKeypair}
                onSelect={selectKeypair}
                onClear={clearKeypair}
                onRemove={removeKeypair}
              />
              <BalanceCard
                shieldedBalance={shieldedBalance}
                noteCount={noteCount}
                isLoading={isLoading}
                isRefreshing={isLoadingNotes}
                onRefresh={refreshNotes}
              />
              <AvailableNotesList
                notes={notes}
                loading={isLoadingNotes}
                error={notesError}
              />
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Tab Navigation */}
              <div className="card">
                <div className="flex border-b-2 border-gray-800 relative">
                  <button
                    onClick={() => setActiveTab("shield")}
                    className={`tab-button flex-1 ${activeTab === "shield"
                        ? "text-cyber-blue active"
                        : "text-gray-500 hover:text-gray-300"
                      }`}
                  >
                    ▲ SHIELD
                  </button>
                  <button
                    onClick={() => setActiveTab("transfer")}
                    className={`tab-button flex-1 ${activeTab === "transfer"
                        ? "text-cyber-blue active"
                        : "text-gray-500 hover:text-gray-300"
                      }`}
                  >
                    ⇄ TRANSFER
                  </button>
                  <button
                    onClick={() => setActiveTab("swap")}
                    className={`tab-button flex-1 ${activeTab === "swap"
                        ? "text-cyber-blue active"
                        : "text-gray-500 hover:text-gray-300"
                      }`}
                  >
                    ⇌ SWAP
                  </button>
                  <button
                    onClick={() => setActiveTab("unshield")}
                    className={`tab-button flex-1 ${activeTab === "unshield"
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
                    <TransferForm
                      keypair={keypair}
                      notes={notes}
                      loading={isLoadingNotes}
                      onSuccess={handleTransferSuccess}
                      onRefresh={refreshNotes}
                    />
                  )}
                  {activeTab === "swap" && (
                    <SwapForm
                      keypair={keypair}
                      notes={notes}
                      loading={isLoadingNotes}
                      error={notesError}
                      onSuccess={handleSwapSuccess}
                      onRefresh={refreshNotes}
                    />
                  )}
                  {activeTab === "unshield" && (
                    <UnshieldForm
                      keypair={keypair}
                      maxAmount={shieldedBalance}
                      notes={notes}
                      onSuccess={handleUnshieldSuccess}
                      markNoteSpent={markNoteSpent}
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
          <div className="grid gap-6 md:grid-cols-5">
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
                  <span className="text-cyber-blue text-xl">⇌</span>
                </div>
                <h3 className="mb-2 font-bold uppercase tracking-wider text-cyber-blue text-sm">
                  SWAP
                </h3>
                <p className="text-xs text-gray-400 font-mono leading-relaxed">
                  Private token swaps. Exchange tokens while maintaining full privacy.
                </p>
              </div>
            </div>
            <div className="group relative p-4 border border-gray-800 hover:border-cyber-blue transition-all duration-300 clip-corner">
              <div className="absolute top-0 right-0 text-6xl font-black text-gray-900 opacity-20 select-none">04</div>
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
              <div className="absolute top-0 right-0 text-6xl font-black text-gray-900 opacity-20 select-none">05</div>
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
            <span className="text-xs text-gray-600 font-mono tracking-widest uppercase">OCTOPUS</span>
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-cyber-blue/50" />
          </div>
          <p className="text-xs text-gray-500 font-mono">
            Built with Octopus privacy protocol on Sui •{" "}
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
