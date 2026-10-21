/** Pack card grid (/packs and /packs/[slug]): 4 / 5 / 6 / 7 / 8 columns at
 *  base / 640 / 768 / 1024 / 1280 px, gap 12, `px-1 py-2` so the 1.05 hover
 *  scale is not clipped (reference measurements: 74.75 px at 390, 108.8 at
 *  768, 128.5 at 1440). */
export const PACK_GRID = "grid grid-cols-4 gap-3 px-1 py-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8";
