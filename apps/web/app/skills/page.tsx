import type { Metadata } from "next";
import { SkillsClient } from "./SkillsClient";

export const metadata: Metadata = {
  title: "Skills",
  description: "Every eFootball player skill with the number of cards that have it and the top cards per skill.",
};

export default function SkillsPage() {
  return <SkillsClient />;
}
