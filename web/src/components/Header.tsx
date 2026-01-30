"use client";

import { ConnectButton } from "./ConnectButton";

export function Header() {
  return (
    <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/80">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🐙</span>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Octopus
          </h1>
          <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-900 dark:text-primary-300">
            Testnet
          </span>
        </div>
        <ConnectButton />
      </div>
    </header>
  );
}
