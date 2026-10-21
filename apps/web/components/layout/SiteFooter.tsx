import Link from "next/link";
import { EflabWordmark } from "./EflabWordmark";
import { FooterLinkColumn, type FooterLink } from "./FooterLinkColumn";

// Build stamp: both values are filled by next.config.ts from git at build time
// (or passed explicitly via env). When either is missing the stamp is hidden —
// never a hard-coded id.
const GIT_SHA = process.env.NEXT_PUBLIC_GIT_SHA;
const BUILD_UTC = process.env.NEXT_PUBLIC_BUILD_UTC;
const SOURCE_URL = "https://github.com/duogxaolin/eflab";

const BROWSE_LINKS: readonly FooterLink[] = [
  { href: "/players", label: "Players" },
  { href: "/compare", label: "Compare" },
  { href: "/packs", label: "Packs" },
  { href: "/skills", label: "Skills" },
];

const PROJECT_LINKS: readonly FooterLink[] = [
  { href: SOURCE_URL, label: "Source on GitHub", external: true },
  { href: `${SOURCE_URL}/issues`, label: "Report a problem", external: true },
];

/**
 * Footer: 1 px separator on top, 48 px top padding; from lg the brand block
 * on the left and eFootLab's own link columns on the right, below lg the
 * columns are accordions. Disclaimer, copyright and the build stamp close it
 * (stamp bottom right from lg, centred below). Only eFootLab's own links —
 * no app-store buttons, social or community columns, or legal links.
 */
export function SiteFooter() {
  const year = new Date().getUTCFullYear();
  return (
    <footer className="mt-auto border-t border-[var(--color-line-separator)] bg-[var(--color-canvas)] pt-12 pb-6 max-lg:pb-16">
      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="flex flex-col gap-8 lg:flex-row lg:justify-between lg:gap-16">
          {/* Brand */}
          <div className="flex w-full max-w-80 flex-col items-start">
            <Link className="mb-6 inline-flex items-center text-white no-underline" href="/" aria-label="eFootLab home">
              <EflabWordmark height={32} />
            </Link>
            <p className="mb-2 text-base font-semibold text-white">eFootball player database and lab</p>
            <p className="text-base leading-6 text-[var(--color-text-secondary)]">
              Fan-made companion for eFootball: every player card with real stats, side-by-side compare, the
              latest packs and the full skill list.
            </p>
          </div>

          {/* Link columns (accordions below lg) */}
          <div className="flex flex-col lg:flex-row lg:gap-16">
            <FooterLinkColumn title="Browse" links={BROWSE_LINKS} />
            <FooterLinkColumn title="Project" links={PROJECT_LINKS} />
          </div>
        </div>

        {/* Disclaimer, copyright, build stamp */}
        <p className="mt-12 text-xs leading-4 text-[var(--color-text-secondary)] max-lg:text-center lg:max-w-4xl">
          eFootLab is an independent, fan-made player database for eFootball. It is not affiliated with, endorsed
          by, or associated with Konami Digital Entertainment. Game data, names, images and trademarks remain the
          property of their respective owners.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3 border-t border-[var(--color-line-separator)] pt-6 lg:items-end">
          <span className="text-sm text-[var(--color-text-secondary)]">© {year} eFootLab</span>
          {GIT_SHA && BUILD_UTC && (
            <span className="text-[11px] leading-4 tabular-nums text-[var(--color-text-dim)]">
              Build {GIT_SHA} · {BUILD_UTC}
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}
