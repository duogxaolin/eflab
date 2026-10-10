"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
import { PackCarousel } from "@/components/packs/PackCarousel";
import type { CardPreview } from "@eflab/shared";
import {
  Search,
  Sparkles,
  Star,
  MessageSquare,
  ArrowUp,
  CheckCircle2,
  ExternalLink,
  Link2,
  Play,
  X,
} from "lucide-react";
import {
  CARD_TYPE_COLOR_VAR,
  CARD_TYPE_LABEL,
  positionOf,
  statTierClass,
} from "@/lib/card-display";
import { playerCardUrl } from "@/lib/r2-images";

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
  const [isFocused, setIsFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsFocused(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Latest 18 players by releaseDate DESC (DISTINCT ON baseId — newest card of each player)
  const latest = trpc.player.trending.useQuery();

  // efootbase homepage "Latest Packs" — 17 curated featured bundles from
  // specialPlayerList (dump/efootbase/packs.json). Cards pre-ordered by
  // efootbase's `list` array, including legend spotlights at the top.
  const featuredBundles = trpc.featured.list.useQuery();

  const search = trpc.player.search.useQuery(
    { q, limit: 8 },
    { enabled: q.trim().length > 0 }
  );

  const latestCards = (latest.data ?? []) as CardPreview[];
  const searchResults = (search.data ?? []).slice(0, 6);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setIsFocused(false);
    if (q.trim()) router.push(`/players?q=${encodeURIComponent(q.trim())}`);
    else router.push("/players");
  };

  return (
    <div className="space-y-8">
      {/* ================= HERO SEARCH BANNER ================= */}
      <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          {/* Left Column: Title, Subtitle, Search Form, Quick Filters */}
          <div className="min-w-0 flex-1">
            {/* Meta tag */}
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono font-semibold uppercase tracking-wider text-[var(--color-accent)] text-[11px]">
                eFootball™ 2027
              </span>
              <span className="text-[var(--color-line)]">/</span>
              <span className="text-[var(--color-text-secondary)]">
                48,407 Players Database
              </span>
            </div>

            {/* Heading & Subtitle */}
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Player Database &amp; Build Simulator
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[var(--color-text-secondary)]">
              Search player stats, simulate max-level progression, and discover the latest packs.
            </p>

            {/* Search Combobox Form */}
            <div ref={searchRef} className="relative mt-4">
              <form onSubmit={submitSearch} className="relative">
                <div className="relative flex items-center">
                  <Search className="absolute left-3.5 size-4 text-[var(--color-text-dim)] pointer-events-none" />
                  <input
                    type="text"
                    value={q}
                    onFocus={() => setIsFocused(true)}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setIsFocused(true);
                    }}
                    placeholder="Search players by name…"
                    aria-label="Search players"
                    className="h-11 w-full rounded-lg bg-[var(--color-canvas)] border border-[var(--color-line)] pl-10 pr-24 text-sm text-white placeholder-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                  />

                  {/* Right actions inside search input */}
                  <div className="absolute right-2.5 flex items-center gap-1.5">
                    {q && (
                      <button
                        type="button"
                        onClick={() => setQ("")}
                        className="flex size-6 items-center justify-center rounded text-[var(--color-text-dim)] hover:text-white transition-colors cursor-pointer"
                        aria-label="Clear search"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                    <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono text-[var(--color-text-dim)] bg-[var(--color-panel)] border border-[var(--color-line)]">
                      ⌘K
                    </kbd>
                    <button
                      type="submit"
                      className="px-2.5 py-1 rounded-md bg-[var(--color-accent)] text-xs font-semibold text-[var(--color-accent-foreground)] hover:brightness-110 transition-all cursor-pointer"
                    >
                      Search
                    </button>
                  </div>
                </div>

                {/* Autocomplete Dropdown */}
                {isFocused && q.trim().length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] shadow-2xl divide-y divide-[var(--color-line-separator)]">
                    <div className="flex items-center justify-between px-3.5 py-1.5 text-[11px] font-mono text-[var(--color-text-dim)] bg-[var(--color-canvas)]/50">
                      <span>{searchResults.length} players found</span>
                      <span>Press Enter to view all</span>
                    </div>

                    {searchResults.length > 0 ? (
                      <div className="max-h-72 overflow-y-auto divide-y divide-[var(--color-line-separator)]/60">
                        {searchResults.map((p) => {
                          const pos = positionOf(p.registeredPosition);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setIsFocused(false);
                                router.push(`/players/${p.baseId}/${p.id}`);
                              }}
                              className="group flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left hover:bg-[var(--color-elevated)] transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="size-8 shrink-0 overflow-hidden rounded bg-[var(--color-canvas)] border border-[var(--color-line)] flex items-center justify-center">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={playerCardUrl(p.id)}
                                    alt=""
                                    className="size-full object-contain"
                                    onError={(e) => {
                                      (e.target as HTMLElement).style.display = "none";
                                    }}
                                  />
                                </div>
                                <div className="min-w-0 truncate">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-sm text-white group-hover:text-[var(--color-accent)] transition-colors truncate">
                                      {p.name}
                                    </span>
                                    <span className="font-mono text-[10px] font-bold px-1 py-0.5 rounded bg-[var(--color-elevated)] border border-[var(--color-line)] text-[var(--color-text-secondary)] shrink-0">
                                      {pos}
                                    </span>
                                  </div>
                                  <div className="text-xs text-[var(--color-text-dim)] truncate mt-0.5">
                                    <span style={{ color: CARD_TYPE_COLOR_VAR[p.cardType] }}>
                                      {CARD_TYPE_LABEL[p.cardType] ?? p.cardType}
                                    </span>
                                    <span className="mx-1.5">•</span>
                                    <span className="font-mono">Max {p.maxOvr ?? p.ovr}</span>
                                  </div>
                                </div>
                              </div>
                              <span className={`font-mono text-xs font-bold shrink-0 ${statTierClass(p.maxOvr ?? p.ovr)}`}>
                                {p.maxOvr ?? p.ovr} OVR
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="px-4 py-4 text-center text-xs text-[var(--color-text-dim)]">
                        No players found matching &quot;{q}&quot;
                      </div>
                    )}

                    {searchResults.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsFocused(false);
                          router.push(`/players?q=${encodeURIComponent(q.trim())}`);
                        }}
                        className="flex w-full items-center justify-center py-2 text-xs font-semibold text-[var(--color-accent)] hover:bg-[var(--color-elevated)] transition-colors cursor-pointer"
                      >
                        View all results for &quot;{q.trim()}&quot; →
                      </button>
                    )}
                  </div>
                )}
              </form>

              {/* Quick Filters */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[var(--color-text-dim)] text-[11px] font-medium mr-1">
                  Quick filters:
                </span>
                <button
                  type="button"
                  onClick={() => router.push("/players?cardType=EPIC")}
                  className="px-2.5 py-1 rounded-md border border-[var(--color-line)] bg-[var(--color-canvas)] text-[var(--color-text-secondary)] hover:text-white hover:border-[var(--color-line-active)] transition-colors cursor-pointer"
                >
                  Epic &amp; Big Time
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/players?cardType=SHOW_TIME")}
                  className="px-2.5 py-1 rounded-md border border-[var(--color-line)] bg-[var(--color-canvas)] text-[var(--color-text-secondary)] hover:text-white hover:border-[var(--color-line-active)] transition-colors cursor-pointer"
                >
                  Show Time
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/players?cardType=HIGHLIGHT")}
                  className="px-2.5 py-1 rounded-md border border-[var(--color-line)] bg-[var(--color-canvas)] text-[var(--color-text-secondary)] hover:text-white hover:border-[var(--color-line-active)] transition-colors cursor-pointer"
                >
                  Highlight
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/players?ovrMin=90")}
                  className="px-2.5 py-1 rounded-md border border-[var(--color-line)] bg-[var(--color-canvas)] text-[var(--color-text-secondary)] hover:text-white hover:border-[var(--color-line-active)] transition-colors cursor-pointer"
                >
                  90+ OVR
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/packs")}
                  className="px-2.5 py-1 rounded-md border border-[var(--color-line)] bg-[var(--color-canvas)] text-[var(--color-text-secondary)] hover:text-white hover:border-[var(--color-line-active)] transition-colors cursor-pointer"
                >
                  Packs
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/compare")}
                  className="px-2.5 py-1 rounded-md border border-[var(--color-line)] bg-[var(--color-canvas)] text-[var(--color-text-secondary)] hover:text-white hover:border-[var(--color-line-active)] transition-colors cursor-pointer"
                >
                  Compare
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Desktop Spotlight (Single Clean Aligned PlayerCard) */}
          {latestCards[0] && (
            <div className="hidden lg:flex flex-col items-center justify-center shrink-0 pl-6 border-l border-[var(--color-line)] min-w-[120px]">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-dim)] mb-2">
                Latest Card
              </span>
              <div className="w-24">
                <PlayerCard player={latestCards[0]} size="sm" showName={true} />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Main 2-Column Layout */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ================= LEFT MAIN COLUMN ================= */}
        <div className="min-w-0 space-y-10">
          {/* 1. Latest Players (3 rows × 6 columns = 18 cards, releaseDate DESC) */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Sparkles className="size-4 text-[var(--color-text-secondary)]" />
              <span>Latest Players</span>
            </h2>

            <div className="grid grid-cols-3 gap-3 px-1 py-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {latest.isLoading
                ? [...Array(18)].map((_, i) => (
                    <div key={i} className="aspect-[240/339] rounded-md bg-[var(--color-panel)] animate-pulse" />
                  ))
                : latestCards.map((p) => (
                    <PlayerCard key={p.id} player={p} size="full" showName />
                  ))}
            </div>
          </section>

          {/* 2. Latest Packs (efootbase specialPlayerList — 17 featured bundles) */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Link2 className="size-4 text-[var(--color-text-secondary)]" />
              <span>Latest Packs</span>
            </h2>

            <div className="space-y-6">
              {[...(featuredBundles.data ?? [])]
                .sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime())
                .slice(0, 3)
                .map((bundle) => (
                  <PackCarousel key={bundle.id} bundle={bundle} autoScroll={true} />
                ))}

              {featuredBundles.isLoading && [0, 1, 2].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-4 w-48 rounded bg-[var(--color-panel)] animate-pulse" />
                  <div className="flex gap-3 px-1 py-2 overflow-x-auto hide-scrollbar">
                    {[...Array(6)].map((_, j) => (
                      <div key={j} className="w-24 shrink-0 sm:w-28 aspect-[240/339] rounded-md bg-[var(--color-panel)] animate-pulse" />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <Link
              href="/packs"
              className="button button--secondary button--sm w-fit no-underline inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-elevated)] transition-colors"
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
