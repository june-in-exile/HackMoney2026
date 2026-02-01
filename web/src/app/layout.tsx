import type { Metadata } from "next";
import { SuiProvider } from "@/providers/SuiProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "OCTOPUS // Privacy Protocol",
  description: "Shield and unshield tokens with ZK proofs on Sui",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-cyber-dark-bg relative">
        {/* Center glow effect */}
        <div
          className="fixed inset-0 pointer-events-none z-0"
          style={{
            background:
              "radial-gradient(circle at 50% 20%, rgba(0, 217, 255, 0.08) 0%, transparent 50%)",
          }}
        />

        {/* Vignette effect */}
        <div className="fixed inset-0 bg-gradient-to-b from-transparent via-transparent to-black/40 pointer-events-none z-0" />

        <div className="relative z-10">
          <SuiProvider>{children}</SuiProvider>
        </div>
      </body>
    </html>
  );
}
