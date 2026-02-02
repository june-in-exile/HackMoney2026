"use client";

import { ConnectButton as DappKitConnectButton } from "@mysten/dapp-kit";

export function ConnectButton() {
  return (
    <DappKitConnectButton
      connectText="Connect Wallet"
      className="btn-primary"
    />
  );
}
