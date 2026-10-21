// Card grid of /players (and its loading skeletons): 4 columns, 6 from 768 px,
// 5 beside the filter rail from 1024 px, 6 from 1280 px; 12 px gap; px-1 / py-2
// leave room for the tiles' 1.05 hover scale. A plain module (not a "use
// client" one) so the server page's Suspense fallback can use it too.
export const PLAYERS_GRID = "grid grid-cols-4 gap-3 px-1 py-2 md:grid-cols-6 lg:grid-cols-5 xl:grid-cols-6";
