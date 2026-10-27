// Public URLs of the skills wiki (change efootbase-function-parity, design
// D12), shared by the two server pages that redirect to them:
//   - app/skills/[slug]       every old /skills/<slug> URL → one 308 here;
//   - app/wiki/skills/[slug]  a stored slug that is not the public one → 308.
// Used only from server components.

type SearchParams = Record<string, string | string[] | undefined>;

/** `/wiki/skills/<publicSlug>` with every query parameter of the request
 *  except the old `page` (the skill page no longer pages its top cards).
 *  Typed as a match of the dynamic route `/wiki/skills/[slug]` (a template
 *  literal type, not the bare `Route`, which admits static paths only), so
 *  `permanentRedirect` checks it without a cast. */
export function wikiSkillPath(publicSlug: string, searchParams: SearchParams): `/wiki/skills/${string}` {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "page" || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) out.append(key, v);
  }
  const qs = out.toString();
  return `/wiki/skills/${encodeURIComponent(publicSlug)}${qs ? `?${qs}` : ""}`;
}
