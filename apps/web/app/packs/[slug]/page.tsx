import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchBundle, isBundleSlug } from "@/lib/api-server";
import { formatUtcDate } from "@/lib/format-date";
import { PackClient } from "./PackClient";

// Bundle page by stable slug (design decision 9): `/packs/<name>-<date>` backed
// by `featured.bySlug`. Rendered per request — `next build` never needs the API.
export const dynamic = "force-dynamic";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  if (!isBundleSlug(slug)) return { title: "Pack not found" };
  const bundle = await fetchBundle(slug);
  if (!bundle) return { title: "Pack not found", robots: { index: false } };
  return {
    title: bundle.name,
    description: `${bundle.name} — ${bundle.cards.length} eFootball player cards, released ${formatUtcDate(bundle.releaseDate)}.`,
    openGraph: { title: bundle.name, type: "website" },
  };
}

export default async function PackPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  if (!isBundleSlug(slug)) notFound();
  const bundle = await fetchBundle(slug);
  if (!bundle) notFound();
  return <PackClient slug={slug} initialData={bundle} />;
}
