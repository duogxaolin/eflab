import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CARD_TYPE_LABELS } from "@eflab/shared";
import { fetchPlayer, isNumericId } from "@/lib/api-server";
import { PlayerDetailClient } from "./PlayerDetailClient";

// Player card page (design decision 10): the server wrapper fetches the card
// over HTTP, answers HTTP 404 when the card is unknown or `baseId` is not the
// card's base, and names the player in the document title. Rendered per
// request so `next build` never needs the API.
export const dynamic = "force-dynamic";

type Params = { baseId: string; cardId: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { baseId, cardId } = await params;
  if (!isNumericId(baseId) || !isNumericId(cardId)) return { title: "Player not found" };
  const player = await fetchPlayer(baseId, cardId);
  if (!player) return { title: "Player not found", robots: { index: false } };
  const title = `${player.name} ${player.ovr} OVR — ${CARD_TYPE_LABELS[player.cardType]}`;
  return {
    title,
    description: `${player.name} (${CARD_TYPE_LABELS[player.cardType]}) — ${player.ovr} OVR, max ${player.maxOvr}${
      player.pack ? `, from ${player.pack.name}` : ""
    }. Full eFootball stats, skills, boosters and position ratings.`,
    openGraph: { title, type: "profile" },
  };
}

export default async function PlayerPage({ params }: { params: Promise<Params> }) {
  const { baseId, cardId } = await params;
  if (!isNumericId(baseId) || !isNumericId(cardId)) notFound();
  const player = await fetchPlayer(baseId, cardId);
  if (!player) notFound();
  return <PlayerDetailClient baseId={baseId} cardId={cardId} initialData={player} />;
}
