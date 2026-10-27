// Pitch grid of the Pitch Map — ONE geometry for the web's Pitch Map
// (apps/web/components/players/PitchMap.tsx places its 13 cells with it) and
// for the grid neighbours Position Training reads (change efootbase-s4-measure,
// design D2): a centre column of seven one-row cells (CF, SS, AMF, CMF, DMF,
// CB, GK from the top) between two side columns of three cells each spanning
// 2 / 3 / 2 of the seven rows (LWF, LMF, LB on the left; RWF, RMF, RB on the
// right). The same layout as the reference's pitch (measured 2026-10-23,
// openspec/ui-dna.md "Pitch Map").
import { POSITIONS, type Position } from "./constants";

/** Rows of the pitch grid. */
export const PITCH_ROWS = 7;

/** One cell of the pitch grid: its column (1 left, 2 centre, 3 right), its
 *  first row (1 = the top, the forwards) and the rows it spans. */
export interface PitchCell {
  col: 1 | 2 | 3;
  row: number;
  rowSpan: number;
}

/** The 13 cells (POSITIONS keys). */
export const PITCH_GRID: Readonly<Record<Position, PitchCell>> = {
  GK: { col: 2, row: 7, rowSpan: 1 },
  CB: { col: 2, row: 6, rowSpan: 1 },
  LB: { col: 1, row: 6, rowSpan: 2 },
  RB: { col: 3, row: 6, rowSpan: 2 },
  DMF: { col: 2, row: 5, rowSpan: 1 },
  CMF: { col: 2, row: 4, rowSpan: 1 },
  LMF: { col: 1, row: 3, rowSpan: 3 },
  RMF: { col: 3, row: 3, rowSpan: 3 },
  AMF: { col: 2, row: 3, rowSpan: 1 },
  LWF: { col: 1, row: 1, rowSpan: 2 },
  RWF: { col: 3, row: 1, rowSpan: 2 },
  SS: { col: 2, row: 2, rowSpan: 1 },
  CF: { col: 2, row: 1, rowSpan: 1 },
};

/** True when two cells share an edge: the same column with touching row
 *  ranges, or neighbouring columns with overlapping row ranges. */
function shareEdge(a: PitchCell, b: PitchCell): boolean {
  const aEnd = a.row + a.rowSpan; // first row after a
  const bEnd = b.row + b.rowSpan;
  if (a.col === b.col) return aEnd === b.row || bEnd === a.row;
  if (Math.abs(a.col - b.col) !== 1) return false;
  return a.row < bEnd && b.row < aEnd;
}

/** Edge-sharing neighbours of every cell of a grid, in POSITIONS order. */
export function pitchNeighbours(grid: Readonly<Record<Position, PitchCell>>): Record<Position, Position[]> {
  const out = {} as Record<Position, Position[]>;
  for (const p of POSITIONS) out[p] = POSITIONS.filter((q) => q !== p && shareEdge(grid[p], grid[q]));
  return out;
}

/** The grid neighbours of each position on the Pitch Map (derived from
 *  PITCH_GRID, so the map and Position Training cannot disagree):
 *  CF {SS, LWF, RWF} · SS {CF, AMF, LWF, RWF} · AMF {SS, CMF, LMF, RMF} ·
 *  CMF {AMF, DMF, LMF, RMF} · DMF {CMF, CB, LMF, RMF} · CB {DMF, GK, LB, RB} ·
 *  LWF {CF, SS, LMF} · RWF {CF, SS, RMF} · LMF {LWF, AMF, CMF, DMF, LB} ·
 *  RMF {RWF, AMF, CMF, DMF, RB} · LB {LMF, CB, GK} · RB {RMF, CB, GK} ·
 *  GK {CB, LB, RB}. */
export const PITCH_NEIGHBOURS: Readonly<Record<Position, readonly Position[]>> = Object.freeze(pitchNeighbours(PITCH_GRID));
