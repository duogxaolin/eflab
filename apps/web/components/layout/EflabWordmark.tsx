// eFootLab wordmark — self-made inline SVG (mark + text), no third-party art.
// The mark is the same artwork as public/eflab-mark.svg (favicon); the text
// uses the page font (Inter) through `font-family: inherit` so it matches the
// header. `currentColor` carries the text colour, the accent token the "Lab".

export function EflabWordmark({
  className = "",
  height = 28,
  showText = true,
}: {
  className?: string;
  /** Rendered height in px; width follows the viewBox ratio. */
  height?: number;
  /** false → mark only (square). */
  showText?: boolean;
}) {
  const width = showText ? Math.round(height * (152 / 32)) : height;
  return (
    <svg
      className={className}
      viewBox={showText ? "0 0 152 32" : "0 0 32 32"}
      width={width}
      height={height}
      role="img"
      aria-label="eFootLab"
      focusable="false"
    >
      <rect width="32" height="32" rx="7" fill="var(--color-accent)" />
      <polygon points="16,7.5 24,13.5 21,23 11,23 8,13.5" fill="var(--color-canvas)" />
      <path d="M13.5 12h5v4l3 5h-11l3-5z" fill="var(--color-accent)" />
      <path d="M14.5 18h3l1.5 2.5h-6z" fill="var(--color-canvas)" />
      {showText && (
        <text
          x="40"
          y="22.5"
          fontFamily="inherit"
          fontSize="19"
          fontWeight="700"
          letterSpacing="-0.4"
          fill="currentColor"
        >
          eFoot<tspan fill="var(--color-accent)">Lab</tspan>
        </text>
      )}
    </svg>
  );
}
