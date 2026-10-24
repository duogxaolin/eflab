import type { Metadata } from "next";
import { Suspense } from "react";
import { SkillsClient, SkillsFrame, SkillsIntro, SkillsRail, SkillsSkeleton } from "./SkillsClient";

export const metadata: Metadata = {
  title: "Skills",
  description: "Every eFootball player skill with the number of cards that have it, the best card for each and the top cards per skill.",
};

// The skills wiki index (/skills answers 308 here, next.config.ts).
// SkillsClient reads `group` / `q` from the URL (useSearchParams), so the
// static page renders the rail, the heading and the loading grid until the
// client has it.
export default function SkillsPage() {
  return (
    <Suspense
      fallback={
        <SkillsFrame rail={<SkillsRail />}>
          <SkillsIntro />
          <SkillsSkeleton />
        </SkillsFrame>
      }
    >
      <SkillsClient />
    </Suspense>
  );
}
