import Link from "next/link";

const GIT_SHA = process.env.NEXT_PUBLIC_GIT_SHA ?? "8d9068b";
const BUILD_UTC = process.env.NEXT_PUBLIC_BUILD_UTC ?? "2026-10-05 12:45 UTC";

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--color-line-separator)] bg-[var(--color-canvas)] mt-auto pt-12 pb-6 max-lg:pb-16 text-xs text-[var(--color-text-secondary)]">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col gap-8 pb-8 lg:flex-row lg:justify-between lg:gap-16 lg:pb-12">
          {/* Left Column: Brand & App Badges */}
          <div className="flex max-w-80 flex-col items-start">
            <Link className="mb-6 flex items-center gap-2.5 text-lg font-bold no-underline" href="/">
              <div className="size-8 shrink-0 rounded-lg bg-[var(--color-accent)] flex items-center justify-center font-black text-black text-xs shadow-sm">
                eF
              </div>
              <span className="text-white tracking-tight">
                eFoot<span className="text-[var(--color-accent)]">Base</span>
              </span>
            </Link>
            <p className="mb-2 max-w-80 text-base font-semibold text-white">
              The eFootball 2027 Player Database
            </p>
            <p className="max-w-80 text-sm leading-relaxed text-[var(--color-text-secondary)] mb-6">
              Fan-made ultimate companion app for eFootball – player database, side-by-side compare, packs and skills. Built by the community, for the community.
            </p>

            {/* App Badges */}
            <div className="flex items-stretch gap-3 w-full">
              <a
                href="https://apps.apple.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Download on the App Store"
                className="flex items-center gap-2.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-white hover:bg-[var(--color-elevated)] transition-colors no-underline"
              >
                <svg className="size-5 shrink-0 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.54c.64-.78 1.08-1.86.96-2.95-1 .04-2.13.67-2.78 1.44-.58.67-1.1 1.77-.96 2.83 1.12.09 2.14-.54 2.78-1.32z" />
                </svg>
                <span className="flex flex-col leading-tight">
                  <span className="text-[10px] text-[var(--color-text-dim)]">Download on the</span>
                  <span className="text-xs font-bold text-white">App Store</span>
                </span>
              </a>

              <a
                href="https://play.google.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Get it on Google Play"
                className="flex items-center gap-2.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-white hover:bg-[var(--color-elevated)] transition-colors no-underline"
              >
                <svg className="size-5 shrink-0 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3.609 1.814L13.792 12 3.61 22.186a1.94 1.94 0 0 1-.61-1.447V3.261c0-.568.225-1.096.609-1.447zm11.242 11.245l2.49 2.49-11.75 6.78 9.26-9.27zm0-2.118L5.591 1.671l11.75 6.78-2.49 2.49zM18.84 10.87l2.84 1.64c.73.42.73 1.1 0 1.52l-2.84 1.64-2.15-2.15 2.15-2.65z" />
                </svg>
                <span className="flex flex-col leading-tight">
                  <span className="text-[10px] text-[var(--color-text-dim)]">Get it on</span>
                  <span className="text-xs font-bold text-white">Google Play</span>
                </span>
              </a>
            </div>
          </div>

          {/* Right Navigation Columns */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-10 lg:gap-16">
            {/* Browse */}
            <div className="flex flex-col gap-2.5">
              <h3 className="mb-1 text-sm font-semibold text-white">Browse</h3>
              <ul className="flex flex-col gap-2 list-none p-0 m-0">
                <li>
                  <Link className="hover:text-white transition-colors no-underline" href="/players">
                    Players
                  </Link>
                </li>
                <li>
                  <Link className="hover:text-white transition-colors no-underline" href="/compare">
                    Compare
                  </Link>
                </li>
                <li>
                  <Link className="hover:text-white transition-colors no-underline" href="/packs">
                    Packs
                  </Link>
                </li>
                <li>
                  <Link className="hover:text-white transition-colors no-underline" href="/skills">
                    Skills
                  </Link>
                </li>
              </ul>
            </div>

            {/* Community */}
            <div className="flex flex-col gap-2.5">
              <h3 className="mb-1 text-sm font-semibold text-white">Community</h3>
              <ul className="flex flex-col gap-2 list-none p-0 m-0">
                <li>
                  <a
                    href="https://discord.gg"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white transition-colors no-underline"
                  >
                    Discord Community
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white transition-colors no-underline"
                  >
                    Feedback & Suggestions
                  </a>
                </li>
              </ul>
            </div>

            {/* Social */}
            <div className="flex flex-col gap-2.5">
              <h3 className="mb-1 text-sm font-semibold text-white">Social</h3>
              <ul className="flex flex-col gap-2 list-none p-0 m-0">
                <li>
                  <a
                    href="https://x.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white inline-flex items-center gap-2 transition-colors no-underline"
                  >
                    <span>𝕏</span>
                    <span>X (Twitter)</span>
                  </a>
                </li>
                <li>
                  <a
                    href="https://instagram.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white inline-flex items-center gap-2 transition-colors no-underline"
                  >
                    <span>Instagram</span>
                  </a>
                </li>
                <li>
                  <a
                    href="https://facebook.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white inline-flex items-center gap-2 transition-colors no-underline"
                  >
                    <span>Facebook</span>
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Legal Disclaimer & Copyright */}
        <div className="flex flex-col gap-6 pt-6 border-t border-[var(--color-line-separator)]">
          <p className="text-[var(--color-text-dim)] text-[11px] leading-relaxed max-w-4xl">
            eFootBase is an independent player database and statistics companion for eFootball. Not affiliated with, endorsed by, or officially associated with Konami Digital Entertainment. Game assets, trademarks, and copyright remain property of their respective owners. Content on this website is protected by copyright law. Use of this content to train, fine-tune, or develop artificial intelligence, machine learning models, or large language models is expressly prohibited without prior written consent.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
            <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px]" aria-label="Legal">
              <a href="#" className="hover:text-white transition-colors no-underline">
                Terms of Service
              </a>
              <a href="#" className="hover:text-white transition-colors no-underline">
                Privacy Policy
              </a>
              <button type="button" className="hover:text-white transition-colors bg-transparent border-0 p-0 cursor-pointer">
                Cookie preferences
              </button>
            </nav>

            <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-dim)]">
              <span>© 2026 eFootBase</span>
              <span>—</span>
              <span className="font-mono tabular-nums">Build {GIT_SHA} · {BUILD_UTC}</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
