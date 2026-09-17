import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// DESIGN.md → Typography: Inter for UI, JetBrains Mono for ids/paths/diffs.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Spatial SOC",
  description: "Live supervision of coding agents",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Dark theme only (DESIGN.md `bg`). The class is fixed, not toggled.
  return (
    <html lang="en" className={`dark ${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
