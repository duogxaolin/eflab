import type { Metadata } from "next";
import { Suspense } from "react";
import { CompareClient } from "./CompareClient";

export const metadata: Metadata = {
  title: "Compare players",
  description: "Compare up to four eFootball player cards side by side — stats, position proficiency and boosters.",
};

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="h-64 rounded-xl bg-[var(--color-panel)]/40 animate-pulse flex items-center justify-center text-xs text-[var(--color-text-dim)]">
          Loading comparison tool…
        </div>
      }
    >
      <CompareClient />
    </Suspense>
  );
}
