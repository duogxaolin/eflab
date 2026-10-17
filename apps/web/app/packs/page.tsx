import type { Metadata } from "next";
import { PacksClient } from "./PacksClient";

export const metadata: Metadata = {
  title: "Packs",
  description: "The latest eFootball player packs and featured bundles, with every card in release order.",
};

export default function PacksPage() {
  return <PacksClient />;
}
