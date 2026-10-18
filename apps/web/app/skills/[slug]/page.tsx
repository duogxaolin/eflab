import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchSkill, isSlug } from "@/lib/api-server";
import { skillDescription, skillLabel } from "@/lib/skill-labels";
import { SkillDetailClient } from "./SkillDetailClient";

// Skill page by slug backed by `skill.byId`; rendered per request so `next
// build` never needs the API (design decision 10).
export const dynamic = "force-dynamic";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  if (!isSlug(slug)) return { title: "Skill not found" };
  const skill = await fetchSkill(slug);
  if (!skill) return { title: "Skill not found", robots: { index: false } };
  const label = skillLabel(skill);
  return {
    title: `${label} skill`,
    description: `${label} — ${skillDescription(skill)} ${skill.playerCount.toLocaleString("en-US")} eFootball cards have this skill.`,
    openGraph: { title: `${label} skill`, type: "website" },
  };
}

export default async function SkillPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  if (!isSlug(slug)) notFound();
  const skill = await fetchSkill(slug);
  if (!skill) notFound();
  return <SkillDetailClient slug={slug} initialData={skill} />;
}
