import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { TopBar } from "@/components/shell/TopBar";
import "./globals.css";

// DESIGN.md -> Typography: Inter for UI, JetBrains Mono for paths, ids and diffs.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Spatial SOC",
  description: "Watch a coding agent move through your codebase, pause it when it leaves scope, check every claim.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-bg text-ink antialiased">
        <TopBar />
        {children}
      </body>
    </html>
  );
}
