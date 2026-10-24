import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Not found",
  robots: { index: false, follow: false },
};

// Rendered with HTTP 404 by `notFound()` from the server page wrappers (unknown
// player / pack / skill, or a baseId that does not match the card) and for any
// unknown route.
export default function NotFound() {
  return (
    <div className="p-12 text-center rounded-2xl bg-[var(--color-panel)] border border-[var(--color-line)] space-y-4">
      <p className="font-mono text-xs uppercase tracking-wider text-[var(--color-text-dim)]">404</p>
      <h1 className="text-2xl font-bold text-white">Page not found</h1>
      <p className="text-sm text-[var(--color-text-secondary)]">
        The player, pack or skill you are looking for does not exist, or its link has changed.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-xs">
        <Link href="/" className="button button--sm button--secondary">
          Home
        </Link>
        <Link href="/players" className="button button--sm button--secondary">
          Browse players
        </Link>
        <Link href="/packs" className="button button--sm button--secondary">
          Packs
        </Link>
        <Link href="/wiki/skills" className="button button--sm button--secondary">
          Skills
        </Link>
      </div>
    </div>
  );
}
