"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
import type { CardPreview } from "@eflab/shared";
import { Search, Star, MessageSquare, ArrowUp, CheckCircle2, ExternalLink, Link2, Play } from "lucide-react";

const FEATURED_VIDEOS = [
  {
    title: "This 3-5-2 Posession Tactic COULD BREAK eFootball 2026...",
    url: "https://www.youtube.com/watch?v=iev3Rej-wtA",
    thumb: "https://i.ytimg.com/vi/iev3Rej-wtA/hqdefault.jpg",
  },
  {
    title: "LIVE: WE BACK! IS THIS NEW GULLIT BROKEN? Testing Dream Team",
    url: "https://www.youtube.com/watch?v=7imZtmzeLPw",
    thumb: "https://i.ytimg.com/vi/7imZtmzeLPw/hqdefault.jpg",
  },
  {
    title: "LIVE: EFOOTBALL CASH PRIZE TOURNAMENT FINALS",
    url: "https://www.youtube.com/watch?v=lMD3fWH3Uks",
    thumb: "https://i.ytimg.com/vi/lMD3fWH3Uks/hqdefault.jpg",
  },
];

const COMMUNITY_COMMENTS = [
  {
    id: "c1",
    author: "Ahmed Farag",
    upvotes: 4,
    text: "Two days to go, be ready for world war end game 😭😭",
    gif: "https://static.klipy.com/ii/da290b156d64898341638f3c299e7478/69/57/tq2d3stO.gif",
    cardName: "Riccardo Calafiori",
    cardOvr: 85,
    cardPos: "LB",
  },
  {
    id: "c2",
    author: "nixs$7",
    upvotes: 3,
    text: "Thank you for showing us that failing isn't the end, but simply one step closer to perfection.",
    cardName: "Lionel Messi",
    cardOvr: 90,
    cardPos: "SS",
  },
  {
    id: "c3",
    author: "Roycline Mwenda",
    upvotes: 2,
    text: "1964 😭 hopefully end of war for a soldier innit",
    cardName: "Cristiano Ronaldo",
    cardOvr: 87,
    cardPos: "CF",
  },
  {
    id: "c4",
    author: "Abshir 123",
    upvotes: 1,
    text: "I need this version on my account, beast stats in game 🙌🏻",
    gif: "https://static.klipy.com/ii/d6b0ce929193df3c242ac34b5654d2ce/f3/d4/YojFChlB.gif",
    cardName: "Lilian Thuram",
    cardOvr: 87,
    cardPos: "CB",
  },
];

export default function HomePage() {
  const router = useRouter();
  const [q, setQ] = useState("");

  // Top 18 distinct star players across Epic, Big Time, Show Time, Highlight
  const trending = trpc.player.trending.useQuery();

  // 3 exact featured packs: Spanish League Midfielders, Piemonte BN, Netherlands
  const featuredPacks = trpc.pack.featured.useQuery();

  const search = trpc.player.search.useQuery(
    { q, limit: 8 },
    { enabled: q.trim().length > 0 }
  );

  const trendingCards = (trending.data ?? []) as CardPreview[];
  const searchResults = (search.data ?? []).slice(0, 6);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) router.push(`/players?q=${encodeURIComponent(q.trim())}`);
    else router.push("/players");
  };

  return (
    <div className="space-y-8">
      {/* Player Search Combobox (efootbase exact style) */}
      <form onSubmit={submitSearch} className="player-search-combobox relative w-full">
        <div className="relative h-11 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[var(--color-text-dim)] pointer-events-none" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search players by name…"
            aria-label="Search players"
            className="w-full h-11 pl-10 pr-4 text-sm rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] text-white placeholder-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-accent)] transition-all shadow-sm"
          />
        </div>
        {q.trim() && searchResults.length > 0 && (
          <div className="absolute z-50 mt-1.5 w-full rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] shadow-2xl overflow-hidden">
            {searchResults.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => router.push(`/players/${p.baseId}/${p.id}`)}
                className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-[var(--color-elevated)] transition-colors text-left cursor-pointer"
              >
                <div className="truncate">
                  <span className="font-semibold text-sm text-white">{p.name}</span>
                  <span className="text-xs text-[var(--color-text-dim)] ml-2">{p.cardType.replace(/_/g, " ")}</span>
                </div>
                <span className="font-mono text-xs font-bold text-[var(--color-accent)] shrink-0">{p.ovr} OVR</span>
              </button>
            ))}
          </div>
        )}
      </form>

      {/* Main 2-Column Layout */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ================= LEFT MAIN COLUMN ================= */}
        <div className="min-w-0 space-y-10">
          {/* 1. Trending Players (3 rows × 6 columns = 18 cards) */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Star className="size-4 text-[var(--color-text-secondary)]" />
              <span>Trending Players</span>
            </h2>

            <div className="grid grid-cols-3 gap-3 px-1 py-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {trending.isLoading
                ? [...Array(18)].map((_, i) => (
                    <div key={i} className="aspect-[240/339] rounded-md bg-[var(--color-panel)] animate-pulse" />
                  ))
                : trendingCards.map((p) => (
                    <PlayerCard key={p.id} player={p} size="full" showName />
                  ))}
            </div>
          </section>

          {/* 2. Latest Packs (3 real featured packs with all cards inside) */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Link2 className="size-4 text-[var(--color-text-secondary)]" />
              <span>Latest Packs</span>
            </h2>

            <div className="space-y-6">
              {(featuredPacks.data ?? []).map((pack) => (
                <section key={pack.id} className="space-y-2">
                  <div className="flex items-center justify-between text-xs border-b border-[var(--color-line-separator)]/60 pb-2">
                    <Link
                      href={`/packs/${pack.id}`}
                      className="font-semibold text-sm text-white hover:text-[var(--color-accent)] transition-colors no-underline"
                    >
                      {pack.name}
                    </Link>
                    <span className="font-mono text-[var(--color-text-dim)] text-[11px]">
                      {new Date(pack.releaseDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 px-1 py-2">
                    {pack.cards.map((p) => (
                      <PlayerCard key={p.id} player={p as CardPreview} size="full" showName />
                    ))}
                  </div>
                </section>
              ))}

              {featuredPacks.isLoading && [0, 1, 2].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-4 w-48 rounded bg-[var(--color-panel)] animate-pulse" />
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 px-1 py-2">
                    {[...Array(6)].map((_, j) => (
                      <div key={j} className="aspect-[240/339] rounded-md bg-[var(--color-panel)] animate-pulse" />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <Link
              href="/packs"
              className="button button--outline w-fit no-underline inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-transparent px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-panel)] transition-colors"
            >
              Show all packs
            </Link>
          </section>
        </div>

        {/* ================= RIGHT SIDEBAR (320px) ================= */}
        <aside className="space-y-8">
          {/* 3. Creator Spotlight */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Star className="size-4 text-[var(--color-text-secondary)]" />
              <span>Creator Spotlight</span>
            </h2>

            <div className="card card--secondary overflow-hidden p-0 rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] shadow-lg">
              <div className="relative">
                {/* Banner image from efootbase assets */}
                <div className="relative h-24 overflow-hidden sm:h-28">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt=""
                    src="https://cdn.assets.efootbase.com/eFootBase/uploads/banners/large_image_picker_283_E635_C_271_D_471_E_B88_B_08_F7_CD_8230_F1_18022_000047_E798_A3_CBF_0_ba3f5cc861.webp"
                    className="absolute inset-0 size-full object-cover"
                  />
                  <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                </div>
                {/* Avatar */}
                <div className="px-4 pb-3 pt-3">
                  <div className="size-12 -mt-9 shrink-0 rounded-full border-[3px] border-[var(--color-panel)] bg-[var(--color-elevated)] flex items-center justify-center font-bold text-white shadow-md text-base">
                    <span>⚽</span>
                  </div>
                  <div className="mt-2 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-base font-semibold leading-tight text-white">eFootball Universe</span>
                        <CheckCircle2 className="size-4 text-sky-400 shrink-0" />
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--color-text-dim)] tabular-nums">693 followers</p>
                    </div>
                    <a
                      href="https://youtube.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--color-text-secondary)] hover:text-white inline-flex items-center gap-1 no-underline shrink-0"
                    >
                      <span>YouTube</span>
                      <ExternalLink className="size-3" />
                    </a>
                  </div>
                </div>
              </div>

              {/* 3 Featured Video Cards */}
              <div className="px-4 pb-4 pt-1 space-y-3.5 border-t border-[var(--color-line-separator)]">
                {FEATURED_VIDEOS.map((vid, i) => (
                  <a
                    key={i}
                    href={vid.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block no-underline"
                  >
                    <div className="relative aspect-video overflow-hidden rounded-lg bg-[var(--color-canvas)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={vid.thumb}
                        alt=""
                        className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                        <span className="size-10 rounded-full bg-black/75 flex items-center justify-center backdrop-blur-sm text-white shadow-lg">
                          <Play className="size-4 fill-white translate-x-0.5" />
                        </span>
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-white/90 group-hover:text-[var(--color-accent)] transition-colors">
                      {vid.title}
                    </p>
                  </a>
                ))}
              </div>
            </div>
          </section>

          {/* 4. COMMENTS */}
          <section className="card card--secondary rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] overflow-hidden shadow-lg">
            <div className="px-4 pt-4 pb-2 border-b border-[var(--color-line-separator)] flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white">
                <MessageSquare className="size-3.5 text-[var(--color-text-secondary)]" />
                <span>COMMENTS</span>
              </h3>
              <span className="text-[11px] text-[var(--color-text-dim)] font-mono">Top — Last 24h</span>
            </div>

            <div className="p-3 space-y-3 max-h-[34rem] overflow-y-auto">
              {COMMUNITY_COMMENTS.map((c) => (
                <div
                  key={c.id}
                  className="p-3 rounded-lg bg-[var(--color-canvas)]/70 border border-[var(--color-line-separator)] space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="size-6 rounded-full bg-[var(--color-elevated)] flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                        {c.author[0]}
                      </div>
                      <span className="font-semibold text-xs text-white truncate">{c.author}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] font-mono text-[var(--color-accent)] shrink-0 font-bold">
                      <ArrowUp className="size-3" />
                      <span>{c.upvotes}</span>
                    </div>
                  </div>

                  <p className="text-xs text-white/80 leading-relaxed">
                    {c.text}
                  </p>

                  {c.gif && (
                    <div className="rounded-lg overflow-hidden max-h-36 border border-white/5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.gif} alt="reaction" className="w-full object-cover" loading="lazy" />
                    </div>
                  )}

                  <div className="pt-1 flex items-center justify-between text-[10px] text-[var(--color-text-dim)] border-t border-[var(--color-line-separator)]/60">
                    <span className="truncate">Card: {c.cardName} ({c.cardOvr} {c.cardPos})</span>
                    <span className="text-[var(--color-accent)] font-semibold">View →</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
