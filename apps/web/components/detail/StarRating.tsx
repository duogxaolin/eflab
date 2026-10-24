import { Star } from "lucide-react";
import { WEAK_FOOT_STARS, weakFootStars } from "@eflab/shared";

/** `filled` of `max` stars with an accessible summary — weak foot (4), form
 *  and injury resistance (3, efootbase shows the stored 0–2 as value + 1). */
export function StarRating({
  filled,
  max,
  label,
  className = "",
}: {
  filled: number;
  max: number;
  label: string;
  className?: string;
}) {
  const n = Math.min(max, Math.max(0, Math.round(filled)));
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} role="img" aria-label={`${label}: ${n} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          className={`size-3 ${i < n ? "fill-[var(--color-accent)] text-[var(--color-accent)]" : "text-white/25"}`}
          aria-hidden
        />
      ))}
    </span>
  );
}

/** A stored weak-foot level (usage or accuracy, 0–3) as stars: value + 1 of 4
 *  (`weakFootStars`, the one rule of the player page and compare). */
export function WeakFootStars({ level, label, className }: { level: number; label: string; className?: string }) {
  return <StarRating filled={weakFootStars(level)} max={WEAK_FOOT_STARS} label={label} className={className} />;
}
