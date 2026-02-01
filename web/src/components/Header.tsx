"use client";

import { ConnectButton } from "./ConnectButton";

export function Header() {
  return (
    <header className="border-b-2 border-gray-900 bg-cyber-dark-bg/90 backdrop-blur-md relative">
      {/* Header glow effect with purple accent */}
      <div className="absolute inset-0 bg-gradient-to-b from-cyber-blue/5 via-cyber-purple/3 to-transparent pointer-events-none" />

      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 border-2 border-cyber-blue bg-cyber-blue/10 flex items-center justify-center clip-corner relative">
            <span className="text-cyber-blue font-black text-xl">◉</span>
            <div className="absolute -inset-1 bg-cyber-purple/20 blur-lg -z-10" />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-cyber-blue tracking-tighter uppercase">
              OCTOPUS
            </h1>
            <span className="px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase border border-cyber-blue/50 text-cyber-blue/80 clip-corner font-mono">
              TESTNET
            </span>
          </div>
        </div>
        <ConnectButton />
      </div>

      {/* Bottom accent line with purple gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyber-blue/30 via-cyber-purple/20 to-transparent" />
    </header>
  );
}
