"use client";
import { useEffect } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Shield, Swords, Trophy } from "lucide-react";
import { playingStyleName, type CardPreview, type SkillDTO } from "@eflab/shared";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
import { QueryErrorState } from "@/lib/query-state";
import { SKILL_GROUP_LABELS, skillDescription, skillGroup, skillLabel } from "@/lib/skill-labels";
import { playerCardDynamicUrl } from "@/lib/r2-images";
import { SkillIcon } from "@/components/skills/SkillIcon";
import { SkillEffects } from "@/components/skills/SkillEffects";
import { SectionHeader } from "@/components/layout/SectionHeader";

// One skill at /wiki/skills/<public slug> (change efootbase-function-parity,
// design D12; spec "Skill Leader, Rarity Rank And Top Cards"): the header
// card holds the group, the name, the description, the artwork (letterboxed,
// never cropped), "Cards with this skill N", "Rarity rank #R of T skills"
// (computed by the server page over the listed skills; shared on ties), the
// share of all cards and the leader's card face (the holder with the highest
// max overall, ties by the higher card id); the stored stat boosts and
// activation follow. "Top cards" lists the best card of each of up to 12
// other base players (`skill.players`: max overall DESC, card id DESC, one
// card per base player, the leader's player excluded), each row a link to the
// card page with its face, name, playing styles and max overall — no paging;
// "Show all" opens /players?skill=s_<key>. Label, group, artwork, boosts and
// activation are stored data; nothing is synthesised (no tier word).

export interface SkillRarity {
  rank: number;
  total: number;
}

/** One "Top cards" row: a link to the card page with the face, the name, the
 *  two playing styles and the max overall. */
function TopCardRow({ player }: { player: CardPreview }) {
  const attack = player.playingStyleAttack != null ? playingStyleName(player.playingStyleAttack) : null;
  const defence = player.playingStyleDefense != null ? playingStyleName(player.playingStyleDefense) : null;
  return (
    <Link href={`/players/${player.baseId}/${player.id}`} className="skill-top-row" data-testid="skill-top-row" data-card-id={player.id}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={playerCardDynamicUrl(player.id)}
        alt=""
        width={48}
        height={68}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="skill-top-row__face"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
        }}
      />
      <span className="skill-top-row__body">
        <span className="skill-top-row__name">{player.name}</span>
        {(attack || defence) && (
          <span className="skill-top-row__styles">
            {attack && (
              <span className="skill-top-row__style">
                <Swords className="skill-top-row__icon skill-top-row__icon--attack" aria-hidden />
                <span className="sr-only">Attack: </span>
                {attack}
              </span>
            )}
            {defence && (
              <span className="skill-top-row__style">
                <Shield className="skill-top-row__icon skill-top-row__icon--defence" aria-hidden />
                <span className="sr-only">Defence: </span>
                {defence}
              </span>
            )}
          </span>
        )}
      </span>
      <span className="skill-top-row__ovr">
        <span className="sr-only">Max overall </span>
        {player.maxOvr}
      </span>
    </Link>
  );
}

export function SkillDetailClient({ slug, initialData, rarity }: { slug: string; initialData: SkillDTO; rarity: SkillRarity | null }) {
  const detail = trpc.skill.byId.useQuery({ slug }, { initialData });
  const skill = detail.data ?? initialData;
  const label = skillLabel(skill);
  const group = skillGroup(skill);
  const leader = skill.leader;

  // The page no longer pages its top cards: an old `?page=` is removed from
  // the URL (native replaceState — Next keeps useSearchParams in sync, and no
  // server round trip happens). `null` state: Next treats a state carrying its
  // own markers as its own call and would skip that sync.
  const searchParams = useSearchParams();
  const hasPageParam = searchParams.has("page");
  useEffect(() => {
    if (!hasPageParam) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("page");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [hasPageParam]);

  const holders = trpc.skill.players.useQuery({ slug });
  const catalogue = trpc.player.list.useQuery({ page: 1, limit: 1 }, { staleTime: 60 * 60_000 });

  // The real holder count, fetched with the skill.
  const total = skill.playerCount;
  const allCards = catalogue.data?.total;
  const share = allCards ? `${((total / allCards) * 100).toFixed(total / allCards < 0.1 ? 2 : 1)}%` : "—";
  const showAllHref = skill.key ? (`/players?skill=${encodeURIComponent(skill.key)}` as Route) : undefined;
  const rows = holders.data?.rows ?? [];

  return (
    <div>
      <nav aria-label="Breadcrumb">
        <ol data-slot="breadcrumbs" className="breadcrumbs -ml-0.5 mb-3 list-none p-0">
          <li className="breadcrumbs__item">
            <Link className="breadcrumbs__link hit-44" href="/">
              Home
            </Link>
            <span className="breadcrumbs__separator" aria-hidden>
              ›
            </span>
          </li>
          <li className="breadcrumbs__item">
            <Link className="breadcrumbs__link hit-44" href="/wiki/skills">
              Skills
            </Link>
            <span className="breadcrumbs__separator" aria-hidden>
              ›
            </span>
          </li>
          <li className="breadcrumbs__item" aria-current="page">
            {label}
          </li>
        </ol>
      </nav>

      {/* Header card: text and artwork on the left; the numbers and the
          leader's face on the right from 1024 px (below the text before). */}
      <section className="efb-card skill-hero" aria-labelledby="skill-title" data-testid="skill-hero" data-group={group}>
        <div className="min-w-0 space-y-3">
          <span className={`chip chip--lg chip--default ${group === "showtime" ? "text-[var(--color-showtime)]" : ""}`}>{SKILL_GROUP_LABELS[group]}</span>
          <h1 id="skill-title" className={`efb-h1 ${group === "showtime" ? "text-[var(--color-showtime)]" : "text-[var(--color-text-primary)]"}`}>
            {label}
          </h1>
          <p className="efb-subtitle">{skillDescription(skill)}</p>
          {skill.iconUrl && (
            <div className="w-full max-w-72">
              <SkillIcon src={skill.iconUrl} width="fluid" className="rounded-2xl" />
            </div>
          )}
        </div>

        <div className="skill-hero__aside">
          {/* Metrics — all derived from PlayerSkill rows */}
          <dl className="skill-hero__stats">
            <div>
              <dt className="text-sm text-[var(--color-text-secondary)]">Cards with this skill</dt>
              <dd className="skill-hero__count" data-testid="skill-count">
                {total.toLocaleString("en-US")}
              </dd>
            </div>
            {rarity && (
              <div>
                <dt className="sr-only">Rarity rank</dt>
                <dd className="text-sm text-[var(--color-text-secondary)]" data-testid="skill-rank" data-rank={rarity.rank} data-total={rarity.total}>
                  Rarity rank #{rarity.rank} of {rarity.total} skills
                </dd>
              </div>
            )}
            <div>
              <dt className="sr-only">Share of all cards</dt>
              <dd className="text-xs text-[var(--color-text-secondary)] tabular-nums" data-testid="skill-share">
                {share} of {allCards !== undefined ? allCards.toLocaleString("en-US") : "all"} cards
              </dd>
            </div>
          </dl>
          {leader && (
            <figure className="skill-hero__leader" data-testid="skill-leader-face" data-card-id={leader.id}>
              {/* The face prints the card's level-1 overall, as every card
                  tile; the leader is chosen — and the Top cards rows are
                  labelled — by max overall, so the caption names it
                  (browser QA 2026-10-25 (l): "87" on the face beside rows
                  reading 102–103). */}
              <figcaption className="mb-1.5 text-xs text-[var(--color-text-secondary)]">
                Top card · <span data-testid="skill-leader-max-ovr">max overall {leader.maxOvr}</span>
              </figcaption>
              <PlayerCard player={leader} priority />
            </figure>
          )}
        </div>
      </section>

      {(skill.effects.length > 0 || skill.activation) && (
        <section aria-labelledby="skill-effects" className="efb-card mt-4 space-y-2" data-testid="skill-effects">
          <h2 id="skill-effects" className="efb-card__title">
            Stat boost
          </h2>
          <SkillEffects effects={skill.effects} activation={skill.activation} />
        </section>
      )}

      {/* Top cards — the best card of each other base player, best first */}
      <section className="mt-8 space-y-3" aria-labelledby="skill-top-cards" data-testid="skill-top-cards">
        <SectionHeader id="skill-top-cards" title="Top cards" icon={Trophy} tone="amber" showAllHref={total > 0 ? showAllHref : undefined} />

        {holders.isError ? (
          <QueryErrorState error={holders.error} onRetry={() => void holders.refetch()} title="Could not load the cards with this skill" />
        ) : holders.isPending ? (
          <ol className="grid list-none gap-2 p-0 md:grid-cols-2" aria-busy="true" aria-label="Loading the top cards">
            {[...Array(Math.min(12, Math.max(0, total - 1)))].map((_, i) => (
              <li key={i} className="h-[84px] animate-pulse rounded-2xl bg-[var(--color-panel)]" />
            ))}
          </ol>
        ) : total === 0 ? (
          <div className="rounded-2xl bg-[var(--color-panel)] p-12 text-center text-xs text-[var(--color-text-secondary)]">No cards have this skill.</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl bg-[var(--color-panel)] p-8 text-center text-xs text-[var(--color-text-secondary)]">
            Only {leader ? leader.name : "one player"} has this skill.
          </div>
        ) : (
          <ol className="grid list-none gap-2 p-0 md:grid-cols-2" aria-label={`Top cards with ${label}`}>
            {rows.map((p) => (
              <li key={p.id} className="min-w-0">
                <TopCardRow player={p} />
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
