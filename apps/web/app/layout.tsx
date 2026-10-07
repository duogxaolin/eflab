import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { SiteFooter } from "@/components/layout/SiteFooter";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "eFootBase — The eFootball 2027 Player Database", template: "%s · eFootBase" },
  description:
    "The eFootball 2027 player database — layered card renders, side-by-side compare, packs and skills. Fan-made companion for eFootball.",
  keywords: ["eFootball", "database", "eFootBase", "PES", "player cards", "compare", "packs", "skills"],
  authors: [{ name: "eFootBase" }],
  openGraph: {
    type: "website",
    title: "eFootBase — The eFootball 2027 Player Database",
    description: "Fan-made eFootball 2027 player database with layered card renders and compare.",
    siteName: "eFootBase",
  },
  twitter: { card: "summary_large_image", title: "eFootBase", description: "Fan-made eFootball player database" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#060607",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen text-[var(--color-text-primary)]">
        {/* efootbase aurora gradient backdrop (fixed, pointer-events:none, z -10) */}
        <div className="efb-backdrop efb-backdrop--app" aria-hidden>
          <div
            className="efb-backdrop__aurora"
            style={
              {
                "--efb-aurora-a": "#34D9C8",
                "--efb-aurora-b": "#3B82F6",
                "--efb-aurora-c": "#8B5CF6",
              } as React.CSSProperties
            }
          >
            <div className="aurora-container" />
          </div>
        </div>
        <Providers>
          <div className="relative z-1 flex min-h-screen flex-col">
            <SiteHeader />
            <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-8 pb-24 md:pb-16">
              {children}
            </main>
            <SiteFooter />
            <MobileBottomNav />
          </div>
        </Providers>
      </body>
    </html>
  );
}
