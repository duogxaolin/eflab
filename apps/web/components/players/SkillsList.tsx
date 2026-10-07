import Link from "next/link";
import type { PlayerCardDTO } from "@eflab/shared";

export function SkillsList({ player }: { player: PlayerCardDTO }) {
  return (
    <section className="rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] p-4">
      <h3 className="text-sm font-semibold mb-3 text-[var(--color-text-primary)]">Skills · {player.skills.length}</h3>
      <div className="flex flex-wrap gap-1.5">
        {player.skills.length === 0 ? (
          <div className="text-xs text-[var(--color-text-dim)]">No skills recorded.</div>
        ) : (
          player.skills.map(slug => (
            <Link
              key={slug}
              href={`/skills/${slug}`}
              className="px-2 py-1 text-[11px] rounded-md bg-[var(--color-elevated)] border border-[var(--color-line)] text-[var(--color-text-primary)] hover:bg-[var(--color-accent-secondary)]/10 hover:border-[var(--color-accent-secondary)]/40"
            >
              {slug.split("-").map(w => w[0]?.toUpperCase() + w.slice(1)).join(" ")}
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
