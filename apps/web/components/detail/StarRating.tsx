import { Star } from "lucide-react";

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
