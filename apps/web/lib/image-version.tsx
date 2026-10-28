"use client";
// The card-image cache version for the client tree (change auto-image-version,
// design D6): the root layout (a server component) resolves it once per
// request — the stored value from `catalogue.meta`, else the build-time / the
// committed fallback (`resolveImageVersion` in lib/r2-images.ts) — and hands
// it down through this context, so every component that builds a card image
// URL (PlayerCard, PlayerSearchRow, the skills index's leader chip, a skill
// page's top-card rows) reads the same value at its first render: no flash of
// an older URL, no second fetch. The context's default is the fallback, so a
// component rendered outside the provider (a test, a storybook) still builds a
// valid URL. A tab opened before a raise keeps its value until its next full
// load (a layout is not re-rendered on client-side navigation) — accepted for
// an image cache.
import { createContext, useContext, type ReactNode } from "react";
import { resolveImageVersion } from "./r2-images";

const ImageVersionContext = createContext<string>(resolveImageVersion(null));

export function ImageVersionProvider({ version, children }: { version: string; children: ReactNode }) {
  return <ImageVersionContext.Provider value={version}>{children}</ImageVersionContext.Provider>;
}

/** The resolved card-image version to pass to `playerCardDynamicUrl` / `playerCardUrl`. */
export function useImageVersion(): string {
  return useContext(ImageVersionContext);
}
