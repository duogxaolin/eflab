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

const SITE_NAME = "eFootLab";
const SITE_TITLE = "eFootLab — eFootball player database, compare, packs and skills";
const SITE_DESCRIPTION =
  "eFootLab is a fan-made eFootball player database: every card with real stats, side-by-side compare, the latest packs and the full skill list.";

export const metadata: Metadata = {
  applicationName: SITE_NAME,
  title: { default: SITE_TITLE, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  keywords: ["eFootball", "player database", "eFootLab", "player cards", "compare", "packs", "skills"],
  authors: [{ name: SITE_NAME }],
  icons: { icon: "/eflab-mark.svg" },
  openGraph: {
    type: "website",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
  },
  twitter: { card: "summary", title: SITE_TITLE, description: SITE_DESCRIPTION },
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
        {/* aurora gradient backdrop (fixed, pointer-events:none, behind the app) */}
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
