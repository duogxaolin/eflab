import type { Metadata } from "next";
import { Suspense } from "react";
import { SkillsClient, SkillsIntro, SkillsSkeleton } from "./SkillsClient";

export const metadata: Metadata = {
  title: "Skills",
  description: "Every eFootball player skill with the number of cards that have it and the top cards per skill.",
};

// SkillsClient reads `group` / `q` from the URL (useSearchParams), so the
// static page renders the heading and the loading grid until the client has it.
export default function SkillsPage() {
  return (
    <Suspense
      fallback={
        <div>
          <SkillsIntro />
          <SkillsSkeleton />
        </div>
      }
    >
      <SkillsClient />
    </Suspense>
  );
}
