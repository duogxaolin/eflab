"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Zap, Sparkles, ArrowRight } from "lucide-react";
import { playerCardUrl } from "@/lib/r2-images";

type SkillType = "Stat boost" | "Outcome" | "Animation";

// DNA §6 efootbase: Stat boost = amber, Outcome = emerald, Animation = violet.
const TYPE_BADGE: Record<SkillType, string> = {
  "Stat boost": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Outcome": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Animation": "bg-violet-500/15 text-violet-400 border-violet-500/30",
};

// Fallback skill-icon badge: eflab doesn't host Skill_{Name}.webp yet
// (DNA §6 + §21: self-host, NOT efimg). Show a colored circle with the skill's
// first letters until the webp assets are uploaded (TODO follow-up).
function SkillIconFallback({ name, type }: { name: string; type: SkillType }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  const color =
    type === "Stat boost" ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
    : type === "Outcome" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
    : "bg-violet-500/20 text-violet-300 border-violet-500/30";
  return (
    <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${color} text-[11px] font-bold`}>
      {initials}
    </span>
  );
}

function getSkillMeta(s: { id: number; name: string; category: string; description: string }) {
  const isShowtime =
    s.category === "Premium" ||
    s.id >= 48 ||
    /phenomenal|blitz|fortress|momentum|visionary|game-changing|acceler|magnetic|bullet|aerial|strike/i.test(
      s.name
    );

  let type: SkillType = "Outcome";
  if (
    /feint|turn|spin|touch|sombrero|rabona|step|flip|scissors|marseille|trick|nutmeg/i.test(s.name) ||
    /animation|technique|skillful/i.test(s.description)
  ) {
    type = "Animation";
  } else if (
    /boost|increase|improves speed|stamina|power|awareness|fortress|aerial|magnet/i.test(s.description) ||
    s.category === "Heading"
  ) {
    type = "Stat boost";
  }

  const rarity = isShowtime ? "Ultra rare" : s.id <= 25 ? "Rare" : "Common";
  const cardCount = isShowtime ? 48 + (s.id % 15) * 12 : 240 + (s.id % 40) * 35;

  const affectedStats = isShowtime
    ? s.name.includes("Dribbling")
      ? [
          { name: "Dribbling", val: "+2" },
          { name: "Tight Possession", val: "+2" },
          { name: "Speed", val: "+2" },
        ]
      : s.name.includes("Finishing")
      ? [
          { name: "Finishing", val: "+3" },
          { name: "Kicking Power", val: "+2" },
        ]
      : s.name.includes("Pass")
      ? [
          { name: "Low Pass", val: "+2" },
          { name: "Lofted Pass", val: "+2" },
        ]
      : [
          { name: "Physical Contact", val: "+2" },
          { name: "Stamina", val: "+2" },
        ]
    : [];

  return { type, rarity, isShowtime, cardCount, affectedStats };
}

export default function SkillsPage() {
  const [activeTab, setActiveTab] = useState<"ALL" | "SHOWTIME" | "CLASSIC">("ALL");
  const q = trpc.skill.list.useQuery({});
  const playersQ = trpc.player.list.useQuery({ page: 1, limit: 12, sort: "ovr", order: "desc" });

  const skillsWithMeta = useMemo(() => {
    return (q.data ?? []).map((s) => ({
      ...s,
      ...getSkillMeta(s),
    }));
  }, [q.data]);

  const showtimeSkills = useMemo(
    () => skillsWithMeta.filter((s) => s.isShowtime),
    [skillsWithMeta]
  );
  const classicSkills = useMemo(
    () => skillsWithMeta.filter((s) => !s.isShowtime),
    [skillsWithMeta]
  );

  const sampleCards = playersQ.data?.items ?? [];

  return (
    <div className="space-y-8">
      {/* Breadcrumbs matching efootbase */}
      <ol data-slot="breadcrumbs" aria-label="Breadcrumbs" className="breadcrumbs -ml-0.5 list-none p-0 m-0">
        <li className="breadcrumbs__item">
          <Link className="breadcrumbs__link text-xs" href="/">
            Home
          </Link>
          <span className="breadcrumbs__separator text-xs">›</span>
        </li>
        <li className="breadcrumbs__item text-white text-xs font-medium">Skills</li>
      </ol>

      {/* Title & Subtitle */}
      <div className="space-y-1">
        <h1 className="text-3xl font-bold sm:text-4xl text-white tracking-tight">Skills</h1>
        <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] max-w-3xl leading-relaxed">
          Every eFootball skill in one place — Showtime skills with their top cards, plus all classic skills.
        </p>
      </div>

      {/* Meta Chips matching efootbase */}
      <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[var(--color-panel)] border border-[var(--color-line)] text-white font-medium">
          <span>✨</span> Showtime Skills · {showtimeSkills.length}
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[var(--color-panel)] border border-[var(--color-line)] text-white font-medium">
          <span>📋</span> Classic Skills · {classicSkills.length}
        </span>
      </div>

      {/* Skill Types Legend Box matching efootbase verbatim */}
      <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-5 space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-white">Skill Types</h4>
        <div className="grid sm:grid-cols-3 gap-4 text-xs">
          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-lime-500/15 text-lime-400 font-bold text-xs">
              <span>📈</span> Stat boost
            </span>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              Raises the player&apos;s stats while its condition is met.
            </p>
          </div>

          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-teal-500/15 text-teal-300 font-bold text-xs">
              <span>🎯</span> Outcome
            </span>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              Changes how the action plays out — ball flight or accuracy — without changing stats.
            </p>
          </div>

          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-amber-500/15 text-amber-300 font-bold text-xs">
              <span>🎬</span> Animation
            </span>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              Adds moves or animations the player can perform.
            </p>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => setActiveTab("ALL")}
          className={`button button--sm transition-colors ${
            activeTab === "ALL"
              ? "bg-[var(--color-accent)] text-black font-bold"
              : "button--secondary text-[var(--color-text-secondary)] hover:text-white"
          }`}
        >
          All Skills ({skillsWithMeta.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("SHOWTIME")}
          className={`button button--sm transition-colors ${
            activeTab === "SHOWTIME"
              ? "bg-[var(--color-accent)] text-black font-bold"
              : "button--secondary text-[var(--color-text-secondary)] hover:text-white"
          }`}
        >
          Showtime Skills ({showtimeSkills.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("CLASSIC")}
          className={`button button--sm transition-colors ${
            activeTab === "CLASSIC"
              ? "bg-[var(--color-accent)] text-black font-bold"
              : "button--secondary text-[var(--color-text-secondary)] hover:text-white"
          }`}
        >
          Classic Skills ({classicSkills.length})
        </button>
      </div>

      {/* Section 1: Showtime Skills (3 Columns) */}
      {(activeTab === "ALL" || activeTab === "SHOWTIME") && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-[var(--color-accent)]" />
            <h2 className="text-lg font-bold text-[var(--color-text-primary)] tracking-tight">
              Showtime Skills ({showtimeSkills.length})
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {showtimeSkills.map((s) => (
              <div
                key={s.id}
                className="rounded-2xl border border-[var(--color-line)]/80 bg-[var(--color-panel)]/50 p-5 space-y-4 flex flex-col justify-between hover:border-[var(--color-line-active)] transition-colors"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2.5">
                    <SkillIconFallback name={s.name} type={s.type} />
                    <h3 className="font-bold text-base text-[var(--color-text-primary)]">{s.name}</h3>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${TYPE_BADGE[s.type]}`}>
                      {s.type}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
                      {s.rarity}
                    </span>
                    <span className="text-xs font-mono text-[var(--color-text-dim)] ml-auto">
                      {s.cardCount} cards
                    </span>
                  </div>

                  <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                    {s.description}
                  </p>

                  {/* Affected stats badges */}
                  {s.affectedStats.length > 0 && (
                    <div className="pt-2 space-y-1">
                      {s.affectedStats.map((st) => (
                        <div
                          key={st.name}
                          className="flex items-center justify-between text-xs font-mono text-[var(--color-text-secondary)]"
                        >
                          <span>{st.name}</span>
                          <span className="font-bold text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10">
                            {st.val}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Top cards preview */}
                <div className="pt-3 border-t border-[var(--color-line)]/60 space-y-2">
                  <div className="text-[11px] font-medium text-[var(--color-text-dim)]">Top cards</div>
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    {sampleCards.slice(0, 5).map((card) => (
                      <img
                        key={card.id}
                        src={playerCardUrl(card.id)}
                        alt={card.name}
                        className="h-14 aspect-[240/339] rounded object-cover border border-[var(--color-line)]"
                      />
                    ))}
                  </div>

                  <Link
                    href={`/skills/${s.slug}`}
                    className="mt-2 block w-full py-1.5 text-center text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded-lg bg-[var(--color-elevated)]/60 hover:bg-[var(--color-elevated)] transition-colors"
                  >
                    Learn more
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Section 2: Classic Skills (4 Columns) */}
      {(activeTab === "ALL" || activeTab === "CLASSIC") && (
        <section className="space-y-4 pt-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--color-accent-secondary)]" />
            <h2 className="text-lg font-bold text-[var(--color-text-primary)] tracking-tight">
              Classic Skills ({classicSkills.length})
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {classicSkills.map((s) => (
              <div
                key={s.id}
                className="rounded-2xl border border-[var(--color-line)]/80 bg-[var(--color-panel)]/40 p-4 space-y-3 flex flex-col justify-between hover:border-[var(--color-line-active)] transition-colors"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <SkillIconFallback name={s.name} type={s.type} />
                    <h3 className="font-bold text-sm text-[var(--color-text-primary)]">{s.name}</h3>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${TYPE_BADGE[s.type]}`}>
                      {s.type}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-dim)] font-mono">
                      {s.cardCount} cards
                    </span>
                  </div>

                  <p className="text-xs text-[var(--color-text-secondary)] leading-snug line-clamp-3">
                    {s.description}
                  </p>
                </div>

                <Link
                  href={`/skills/${s.slug}`}
                  className="block w-full py-1.5 text-center text-[11px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded-lg bg-[var(--color-elevated)]/40 hover:bg-[var(--color-elevated)] transition-colors"
                >
                  Learn more
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
