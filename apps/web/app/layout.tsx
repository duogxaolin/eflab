import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SkipLink } from "@/components/layout/SkipLink";
import { fetchImageVersion } from "@/lib/api-server";
import { ImageVersionProvider } from "@/lib/image-version";
import { resolveImageVersion } from "@/lib/r2-images";

/** id of the page's `<main>` (the "Skip to content" target). */
const MAIN_ID = "main-content";

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
  themeColor: "#060606",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The card-image cache version (change auto-image-version, design D6): the
  // stored value — raised by the sync worker after a run replaced card images on
  // R2 — read through a 60-s revalidated fetch that never throws (null on any
  // failure), else the build-time / committed fallback; one value for every
  // card URL of this render, handed to the client tree by the provider below.
  const imageVersion = resolveImageVersion(await fetchImageVersion());
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      {/* Below lg the body reserves the floating tab bar's height plus the
          safe-area inset, so the last footer line scrolls clear of the bar. */}
      <body className="relative flex min-h-screen flex-col text-[var(--color-text-primary)] max-lg:pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))]">
        {/* The first tab stop of every page: hidden until focused, it moves
            focus past the header to the page content (`main`). */}
        <SkipLink targetId={MAIN_ID} className="efb-skip-link--fixed" data-testid="skip-to-content">
          Skip to content
        </SkipLink>
        {/* Aurora strip at the top of the document (scrolls with the page,
            pointer-events:none, behind the app). The tint layer is switched on
            by a page that sets data-card-tint (see globals.css). */}
        <div className="efb-backdrop" aria-hidden>
          <div className="efb-backdrop__aurora" />
          <div className="efb-backdrop__tint" />
        </div>
        <Providers>
          <ImageVersionProvider version={imageVersion}>
            <div className="relative z-1 flex flex-1 flex-col">
              <SiteHeader />
              {/* The skip link's focus target: focusable only while it holds
                  the skip link's focus (SkipLink sets and removes its
                  tabindex); no outline, scroll margin under the header —
                  `.efb-skip-target`. */}
              <main id={MAIN_ID} className="efb-skip-target flex-1 mx-auto w-full max-w-6xl px-4 py-8">
                {children}
              </main>
              <SiteFooter />
              <MobileBottomNav />
            </div>
          </ImageVersionProvider>
        </Providers>
      </body>
    </html>
  );
}
