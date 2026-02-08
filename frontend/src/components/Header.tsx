"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useCurrentAccount, useSuiClientContext } from "@mysten/dapp-kit";
import { ConnectButton } from "./ConnectButton";
import { cn } from "@/lib/utils";

export function Header() {
  const pathname = usePathname();
  const account = useCurrentAccount();
  const { network, selectNetwork } = useSuiClientContext();
  const isMainnet = network === "mainnet";

  // Sync SuiClientProvider with the wallet's connected chain.
  // Wallet reports chain as "sui:mainnet", "sui:testnet", etc.
  useEffect(() => {
    if (!account?.chains?.length) return;
    const walletNetwork = account.chains[0].split(":")[1] as
      | "mainnet"
      | "testnet"
      | "devnet"
      | "localnet";
    if (walletNetwork && walletNetwork !== network) {
      selectNetwork(walletNetwork);
    }
  }, [account?.chains, network, selectNetwork]);

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
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center gap-1">
            <Link
              href="/"
              className={`px-4 py-2 text-s font-bold uppercase tracking-wider transition-all ${pathname === "/"
                  ? "text-cyber-blue border-b-2 border-cyber-blue"
                  : "text-gray-500 hover:text-gray-300 border-b-2 border-transparent"
                }`}
            >
              APP
            </Link>
            <Link
              href="/overview"
              className={`px-4 py-2 text-s font-bold uppercase tracking-wider transition-all ${pathname === "/overview"
                  ? "text-cyber-blue border-b-2 border-cyber-blue"
                  : "text-gray-500 hover:text-gray-300 border-b-2 border-transparent"
                }`}
            >
              OVERVIEW
            </Link>
            <Link
              href="/developer"
              className={`px-4 py-2 text-s font-bold uppercase tracking-wider transition-all ${pathname === "/developer"
                  ? "text-cyber-blue border-b-2 border-cyber-blue"
                  : "text-gray-500 hover:text-gray-300 border-b-2 border-transparent"
                }`}
            >
              DEVELOPER
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "px-3 py-1 text-[11px] font-bold tracking-widest uppercase border clip-corner font-mono",
              isMainnet
                ? "border-cyber-purple-light/60 text-cyber-purple-light/90"
                : "border-amber-500/50 text-amber-400/80"
            )}
          >
            {isMainnet ? "MAINNET" : "TESTNET"}
          </span>
          <ConnectButton />
        </div>
      </div>

      {/* Bottom accent line with purple gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyber-blue/30 via-cyber-purple/20 to-transparent" />
    </header>
  );
}
