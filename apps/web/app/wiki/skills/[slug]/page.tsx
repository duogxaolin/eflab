import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { skillRarityRank } from "@eflab/shared";
import { fetchSkill, fetchSkillList, isSkillSlug } from "@/lib/api-server";
import { skillDescription, skillLabel } from "@/lib/skill-labels";
import { wikiSkillPath } from "@/lib/skill-routes";
import { SkillDetailClient } from "./SkillDetailClient";

// Skill page at /wiki/skills/<public slug> (change efootbase-function-parity,
// design D12), backed by `skill.byId` — which answers the public slug (the
// stored key without `s_`, `-` for `_`) and the stored slug. A stored slug
// that is not the public one answers 308 to the public URL (a real 308: no
// Suspense boundary or loading.tsx wraps the page); an unknown or unreleased
// slug is a 404. The old /skills/<slug> URLs never pass through here: their
// own page (app/skills/[slug]) answers one 308 straight to the public URL.
// Rendered per request so `next build` never needs the API (design
// decision 10).
export const dynamic = "force-dynamic";

type Params = { slug: string };
type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  if (!isSkillSlug(slug)) return { title: "Skill not found" };
  const skill = await fetchSkill(slug);
  if (!skill) return { title: "Skill not found", robots: { index: false } };
  const label = skillLabel(skill);
  return {
    title: `${label} skill`,
    description: `${label} — ${skillDescription(skill)} ${skill.playerCount.toLocaleString("en-US")} eFootball cards have this skill.`,
    openGraph: { title: `${label} skill`, type: "website" },
  };
}

export default async function SkillPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<SearchParams> }) {
  const { slug } = await params;
  if (!isSkillSlug(slug)) notFound();
  const [skill, skills] = await Promise.all([fetchSkill(slug), fetchSkillList()]);
  if (!skill) notFound();
  if (skill.publicSlug !== slug) permanentRedirect(wikiSkillPath(skill.publicSlug, await searchParams));
  return <SkillDetailClient slug={skill.publicSlug} initialData={skill} rarity={skillRarityRank(skills, skill.slug)} />;
}
