import Link from "next/link";
import { EflabWordmark } from "./EflabWordmark";

// Build stamp: both values are filled by next.config.ts from git at build time
// (or passed explicitly via env). When either is missing the stamp is hidden —
// never a hard-coded id.
const GIT_SHA = process.env.NEXT_PUBLIC_GIT_SHA;
const BUILD_UTC = process.env.NEXT_PUBLIC_BUILD_UTC;
const SOURCE_URL = "https://github.com/duogxaolin/eflab";

const BROWSE_LINKS = [
  { href: "/players", label: "Players" },
  { href: "/compare", label: "Compare" },
  { href: "/packs", label: "Packs" },
  { href: "/skills", label: "Skills" },
] as const;

export function SiteFooter() {
  const year = new Date().getUTCFullYear();
  return (
    <footer className="border-t border-[var(--color-line-separator)] bg-[var(--color-canvas)] mt-auto pt-12 pb-6 max-md:pb-20 text-xs text-[var(--color-text-secondary)]">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col gap-8 pb-8 lg:flex-row lg:justify-between lg:gap-16 lg:pb-12">
          {/* Brand */}
          <div className="flex w-full max-w-80 flex-col items-start">
            <Link className="mb-6 inline-flex items-center text-white no-underline" href="/">
              <EflabWordmark height={28} />
            </Link>
            <p className="mb-2 text-base font-semibold text-white">
              eFootball player database and lab
            </p>
            <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
              Fan-made companion for eFootball: every player card with real stats, side-by-side
              compare, the latest packs and the full skill list.
            </p>
          </div>

          {/* Navigation */}
          <div className="grid grid-cols-2 gap-10 lg:gap-16">
            <nav className="flex flex-col gap-2.5" aria-label="Browse">
              <h3 className="mb-1 text-sm font-semibold text-white">Browse</h3>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {BROWSE_LINKS.map((l) => (
                  <li key={l.href}>
                    <Link className="no-underline transition-colors hover:text-white" href={l.href}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <nav className="flex flex-col gap-2.5" aria-label="Project">
              <h3 className="mb-1 text-sm font-semibold text-white">Project</h3>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                <li>
                  <a
                    href={SOURCE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="no-underline transition-colors hover:text-white"
                  >
                    Source on GitHub
                  </a>
                </li>
                <li>
                  <a
                    href={`${SOURCE_URL}/issues`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="no-underline transition-colors hover:text-white"
                  >
                    Report a problem
                  </a>
                </li>
              </ul>
            </nav>
          </div>
        </div>

        {/* Disclaimer and copyright */}
        <div className="flex flex-col gap-6 border-t border-[var(--color-line-separator)] pt-6">
          <p className="max-w-4xl text-[11px] leading-relaxed text-[var(--color-text-dim)]">
            eFootLab is an independent, fan-made player database for eFootball. It is not
            affiliated with, endorsed by, or associated with Konami Digital Entertainment. Game
            data, names, images and trademarks remain the property of their respective owners.
          </p>

          <div className="flex flex-col items-start gap-2 pt-2 text-[11px] text-[var(--color-text-dim)] sm:flex-row sm:items-center sm:justify-between">
            <span>© {year} eFootLab</span>
            {GIT_SHA && BUILD_UTC && (
              <span className="font-mono tabular-nums">
                Build {GIT_SHA} · {BUILD_UTC}
              </span>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
