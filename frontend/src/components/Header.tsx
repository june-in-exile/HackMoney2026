"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "./ConnectButton";

export function Header() {
  const pathname = usePathname();

  return (
    <header className="border-b-2 border-gray-900 bg-cyber-dark-bg/90 backdrop-blur-md relative">
      {/* Header glow effect with purple accent */}
      <div className="absolute inset-0 bg-gradient-to-b from-cyber-blue/5 via-cyber-purple/3 to-transparent pointer-events-none" />

      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 relative z-10">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-2">
              <Link href="/">
                <h1 className="text-2xl font-black text-cyber-blue tracking-tighter uppercase cursor-pointer hover:text-cyber-blue/80 transition-colors">
                  OCTOPUS
                </h1>
              </Link>
            </div>
            <div className="w-3 h-7.5 relative">
              <Image
                src="/images/sui.png"
                alt="Sui Logo"
                width={32}
                height={45}
                className="object-contain"
              />
            </div>
            <div>
              <span className="px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase border border-cyber-blue/50 text-cyber-blue/80 clip-corner font-mono">
                TESTNET
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center gap-1">
            <Link
              href="/"
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
                pathname === "/"
                  ? "text-cyber-blue border-b-2 border-cyber-blue"
                  : "text-gray-500 hover:text-gray-300 border-b-2 border-transparent"
              }`}
            >
              APP
            </Link>
            <Link
              href="/overview"
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
                pathname === "/overview"
                  ? "text-cyber-blue border-b-2 border-cyber-blue"
                  : "text-gray-500 hover:text-gray-300 border-b-2 border-transparent"
              }`}
            >
              OVERVIEW
            </Link>
            <Link
              href="/developer"
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
                pathname === "/developer"
                  ? "text-cyber-blue border-b-2 border-cyber-blue"
                  : "text-gray-500 hover:text-gray-300 border-b-2 border-transparent"
              }`}
            >
              DEVELOPER
            </Link>
          </nav>
        </div>
        <ConnectButton />
      </div>

      {/* Bottom accent line with purple gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyber-blue/30 via-cyber-purple/20 to-transparent" />
    </header>
  );
}
