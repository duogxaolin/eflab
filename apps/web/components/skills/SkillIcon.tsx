"use client";
import { useState } from "react";

// efootbase skill artwork (R2 `skills/Skill_<Name>.webp` — a game still, not a
// glyph). The 67 files come in two sizes, measured from the snapshot files: 58
// are 576×346 and 9 are 576×324. The box is always 576:346 and the image is drawn
// with `object-fit: contain`, so nothing is cropped: a 576×324 still is
// letterboxed (≈ 5.5% of the height on the tinted background), a 576×346 one
// fills the box exactly. Raw <img> like PlayerCard: lazy, async decode,
// explicit width/height so the box is reserved before the bytes arrive (no
// layout shift). Decorative — the skill name is always printed next to it — so
// the alt text is empty. A missing or failed image leaves the reserved, tinted box.
const ICON_W = 576;
const ICON_H = 346;

export function SkillIcon({
  src,
  width,
  className = "",
}: {
  src: string | null;
  /** Rendered width in CSS px (height follows 576:346), or "fluid" = 100% of
   *  the container with the same aspect ratio. */
  width: number | "fluid";
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const fluid = width === "fluid";
  const w = fluid ? ICON_W : width;
  const h = fluid ? ICON_H : Math.round((width * ICON_H) / ICON_W);
  const box = fluid ? { width: "100%", aspectRatio: `${ICON_W} / ${ICON_H}` } : { width: w, height: h };
  if (!src || failed) {
    return <span aria-hidden className={`block shrink-0 bg-[var(--color-elevated)] ${className}`} style={box} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={w}
      height={h}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`block shrink-0 object-contain bg-[var(--color-elevated)] ${fluid ? "h-auto" : ""} ${className}`}
      style={box}
    />
  );
}
