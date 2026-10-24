import type { Metadata } from "next";
import { utcDayKey, type FeaturedListDTO } from "@eflab/shared";
import { ApiUnavailableError, apiQuery } from "@/lib/api-server";
import { PacksClient } from "./PacksClient";

export const metadata: Metadata = {
  title: "Packs",
  description: "The latest eFootball player packs and featured bundles, with every card of each pack.",
};

// Rendered per request (change efootbase-function-parity "Packs Order And Last
// Updated"): the "Last updated" chip is the age of the newest card release
// counted in whole UTC days from the request's day, so the day is taken here,
// once, and handed to the client together with the bundles — the server HTML
// and the hydrated page print the same text, and `next build` never needs the
// API or freezes the build day into the page.
export const dynamic = "force-dynamic";

export default async function PacksPage() {
  const todayUtc = utcDayKey(new Date());
  let initialData: FeaturedListDTO | undefined;
  try {
    initialData = await apiQuery<FeaturedListDTO>("featured.list", undefined);
  } catch (error) {
    // The API did not answer this render: the client asks again itself (and
    // shows its error state if that fails too) — the page never 500s here.
    if (!(error instanceof ApiUnavailableError)) throw error;
    console.error("[packs] server fetch of featured.list failed; the client will retry", error.message);
  }
  return <PacksClient todayUtc={todayUtc} initialData={initialData} />;
}
