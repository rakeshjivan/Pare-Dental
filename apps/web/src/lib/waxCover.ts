/**
 * Build 318 (Rakesh: "what about the teeth not auto scaling so the wax-up covers the whole tooth on placement" -
 * "but it can't just scale so the tooth becomes giant. It needs to remain anatomical"): what a wax tooth, as it is
 * laid, still leaves of the patient's tooth uncovered, and the least change of the tooth's own shape that covers it.
 *
 * The set is laid so each tooth's labial face stands clear of the patient's crown (lib/waxSmileSet). What can still
 * show is the patient's tooth behind the wax (palatally: the wax tooth is thinner there than the tooth it stands
 * over) and beyond its edge (incisally). Those two are measured here, on the tooth's own directions, and answered
 * with the two changes a dentist would make by hand: the tooth fuller palatally, and a little longer.
 *
 * Kept anatomical, never scaled up:
 *  - only the palatal fullness and the length are touched - the width (set by the contacts) and the labial face
 *    (set by the arch) stay as laid;
 *  - each is capped (COVER_PALATAL_MOST, COVER_LENGTH_MOST), and the length also by the tooth's proportion: its
 *    width stays at least COVER_WIDTH_SHARE of its length (natural crowns: 73 to 78 %, Magne 2003);
 *  - what stands further out than COVER_REACH is not this tooth's to cover (a neighbour tucked behind it, the
 *    palate): it is left, and shows as before where the patient's tooth comes through.
 */
import * as THREE from "three";
import type { ToothFrame } from "@/lib/dentalWaxup";

const CELL = 0.4;
/** The most a tooth is made fuller palatally to cover, and longer, mm. */
export const COVER_PALATAL_MOST = 1.5;
export const COVER_LENGTH_MOST = 1;
/** A tooth's width stays at least this share of its length. */
export const COVER_WIDTH_SHARE = 0.7;
/** How far past the wax the patient's tooth is still this tooth's to cover, mm. */
export const COVER_REACH = 2.5;
/** The cover's margin over the patient's tooth, mm. */
export const COVER_MARGIN = 0.2;
/** How much of the crown, from its edge, is looked at palatally (below is the cingulum running into the gum). */
const COVER_PALATAL_SPAN = 0.6;
/** The fewest proud points of the scan that count as the tooth showing (fewer: noise, a stray corner). */
const COVER_FEWEST = 12;

export type CoverNeed = { palatal: number; incisal: number; palatalPoints: number; incisalPoints: number };

/**
 * How far the patient's tooth stands out of one wax tooth palatally and incisally (mm; the 90th percentile of the
 * proud points, so one stray corner does not decide it). `scan`, `wax`: points (x, y, z ...) in the same
 * coordinates as `frame` - the wax tooth's frame as it stands (origin at the middle of its incisal edge, `out`
 * labial, `up` incisal). `gum`: the gingival margin as a level along `up` of the arch - the scan gumwards of it is
 * gum.
 */
export function coverNeed(scan: ArrayLike<number>, wax: ArrayLike<number>, frame: ToothFrame, width: number, length: number, gum?: { up: [number, number, number]; level: number }): CoverNeed {
  const o = new THREE.Vector3(...frame.origin), m = new THREE.Vector3(...frame.mesial).normalize(), f = new THREE.Vector3(...frame.out).normalize(), u = new THREE.Vector3(...frame.up).normalize();
  const local = (x: number, y: number, z: number, out: number[]) => { const dx = x - o.x, dy = y - o.y, dz = z - o.z; out[0] = dx * m.x + dy * m.y + dz * m.z; out[1] = dx * f.x + dy * f.y + dz * f.z; out[2] = dx * u.x + dy * u.y + dz * u.z; };
  // The wax's palatal face as a map over the tooth (the most palatal b per (a, h) cell), its edge (the highest h per
  // a column) and how thick it is at the edge (b from - to, per column).
  const back = new Map<number, number>(), top = new Map<number, number>(), thin = new Map<number, [number, number]>();
  const key = (ka: number, kh: number) => ka * 4096 + kh;
  const p = [0, 0, 0];
  let lo = Infinity, hi = -Infinity, edge = -Infinity;
  const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < wax.length; i += 3) {
    for (let k = 0; k < 3; k += 1) { box[k] = Math.min(box[k], wax[i + k]); box[k + 3] = Math.max(box[k + 3], wax[i + k]); }
    local(wax[i], wax[i + 1], wax[i + 2], p);
    const ka = Math.round(p[0] / CELL), kh = Math.round(p[2] / CELL);
    back.set(key(ka, kh), Math.min(back.get(key(ka, kh)) ?? Infinity, p[1]));
    top.set(ka, Math.max(top.get(ka) ?? -Infinity, p[2]));
    const span = thin.get(ka);
    if (!span) thin.set(ka, [p[1], p[1]]); else { span[0] = Math.min(span[0], p[1]); span[1] = Math.max(span[1], p[1]); }
    lo = Math.min(lo, p[0]); hi = Math.max(hi, p[0]); edge = Math.max(edge, p[2]);
  }
  if (!Number.isFinite(lo)) return { palatal: 0, incisal: 0, palatalPoints: 0, incisalPoints: 0 };
  const mid = (lo + hi) / 2, half = Math.max(width, hi - lo) / 2;
  const backAt = (ka: number, kh: number) => { let best = Infinity; for (let da = -1; da <= 1; da += 1) for (let dh = -1; dh <= 1; dh += 1) best = Math.min(best, back.get(key(ka + da, kh + dh)) ?? Infinity); return best; };
  const palatal: number[] = [], incisal: number[] = [];
  const reach = COVER_REACH + 1.5;
  for (let i = 0; i + 2 < scan.length; i += 3) {
    const x = scan[i], y = scan[i + 1], z = scan[i + 2];
    if (x < box[0] - reach || x > box[3] + reach || y < box[1] - reach || y > box[4] + reach || z < box[2] - reach || z > box[5] + reach) continue;
    if (gum && x * gum.up[0] + y * gum.up[1] + z * gum.up[2] < gum.level + 0.5) continue;
    local(x, y, z, p);
    // Within the middle four fifths of the tooth's span: at its sides stand its neighbours.
    if (Math.abs(p[0] - mid) > half * 0.8) continue;
    const ka = Math.round(p[0] / CELL), kh = Math.round(p[2] / CELL);
    const up = top.get(ka);
    if (up === undefined) continue;
    if (p[2] > up + 0.05) {
      const span = thin.get(ka)!;
      if (p[2] - up <= COVER_REACH && p[1] > span[0] - 0.5 && p[1] < span[1] + 0.5) incisal.push(p[2] - up);
      continue;
    }
    if (p[2] < edge - COVER_PALATAL_SPAN * length) continue;
    const wall = backAt(ka, kh);
    if (Number.isFinite(wall) && p[1] < wall - 0.05 && wall - p[1] <= COVER_REACH) palatal.push(wall - p[1]);
  }
  const most = (list: number[]) => { if (list.length < COVER_FEWEST) return 0; list.sort((a, b) => a - b); return list[Math.min(list.length - 1, Math.floor(list.length * 0.9))]; };
  return { palatal: most(palatal), incisal: most(incisal), palatalPoints: palatal.length, incisalPoints: incisal.length };
}

/**
 * The change of a tooth's own shape that answers a need, kept anatomical: how much fuller palatally and how much
 * longer (mm, to add to what the tooth already has). `had`: the palatal fullness and length it already has beyond
 * the library tooth. `depth`: the tooth's thickness at rest (negative: palatal of its labial face).
 */
export function coverChange(need: CoverNeed, width: number, length: number, had: { palatal: number; length: number }): { palatal: number; length: number } {
  // The palatal fullness moves the tooth's palatal face by about four fifths of itself where the patient's tooth shows.
  const palatal = need.palatal > 0 ? Math.max(0, Math.min((need.palatal + COVER_MARGIN) / 0.8, COVER_PALATAL_MOST - Math.max(0, had.palatal))) : 0;
  const longest = width / COVER_WIDTH_SHARE - (length + had.length);
  const longer = need.incisal > 0 ? Math.max(0, Math.min(need.incisal + COVER_MARGIN, COVER_LENGTH_MOST - Math.max(0, had.length), longest)) : 0;
  return { palatal: Math.round(palatal * 100) / 100, length: Math.round(longer * 100) / 100 };
}
