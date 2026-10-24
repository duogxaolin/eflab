import { notFound, permanentRedirect } from "next/navigation";
import { fetchSkill, isSkillSlug } from "@/lib/api-server";
import { wikiSkillPath } from "@/lib/skill-routes";

// Old skill URLs, /skills/<slug> (the wiki moved to /wiki/skills in change
// efootbase-function-parity, design D12). Every one answers ONE permanent
// redirect (308) straight to the skill's public URL: the slug — stored or
// public — is resolved through `skill.byId`, so an old URL whose stored slug
// differs from the public one (phenomenal-passing → phenomenal-pass) takes no
// second hop. Data-driven: no slug is listed here or in next.config.ts. An
// unknown or unreleased slug is a 404 (the styled not-found page). The query
// is carried except the old `page`. Nothing is rendered or streamed before the
// redirect (no Suspense boundary, no loading.tsx, no metadata), so Next
// answers with a real 308 and a Location header. `/skills` itself is a config
// redirect (next.config.ts). Rendered per request so `next build` never needs
// the API (design decision 10).
export const dynamic = "force-dynamic";

type Params = { slug: string };
type SearchParams = Record<string, string | string[] | undefined>;

export default async function OldSkillUrl({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<SearchParams> }) {
  const { slug } = await params;
  if (!isSkillSlug(slug)) notFound();
  const skill = await fetchSkill(slug);
  if (!skill) notFound();
  permanentRedirect(wikiSkillPath(skill.publicSlug, await searchParams));
}
