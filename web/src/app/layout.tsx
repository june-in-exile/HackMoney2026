import type { Metadata } from "next";
import { SuiProvider } from "@/providers/SuiProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Octopus - Privacy Pool on Sui",
  description: "Shield and unshield tokens with ZK proofs on Sui",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
        <SuiProvider>{children}</SuiProvider>
      </body>
    </html>
  );
}
