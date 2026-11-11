/**
 * Build 118: Wax-up Studio's palatal form - the library tooth's or the patient's.
 *
 * Joined to the model, a wax tooth only adds (a union): wherever the patient's tooth stands out beyond the
 * library tooth, the patient's surface is what shows. On worn, long teeth the patient's palatal
 * stands proud of a Brenes central over almost its whole height, so the made model kept the patient's palatal
 * and showed the library tooth only labially and at the new edge.
 *
 * "library": before the wax is joined, the patient's surface standing palatal of a wax tooth (within
 * PALATAL_REACH of its palatal face) is pressed onto it - in the tooth's own labio-palatal plane, never sideways towards a
 * neighbour - just inside it, so the whole reference tooth
 * forms the palatal surface - as a technician reduces the palatal of a model to the set-up. The press fades out
 * over PALATAL_FADE towards the palatal gum and the palate, towards the tooth's cervical end and at its
 * mesial and distal edges, so the patient's surface runs on smoothly into the library tooth with no step.
 * Palatal of the tooth's cingulum the press eases out over PALATAL_RAMP, so where the cingulum lies under the palatal
 * gum the gum ramps down to it rather than being dug out behind it. The gum labially, below the tooth and between
 * the teeth beyond the fade is never moved.
 */


export type PalatalForm = "patient" | "library" | "shell";
/**
 * Build 286: what a wax-up starts with. A lab's wax-up of the same scan was its library teeth joined to the scan whole
 * (each one long enough to stand in the gum and full enough to cover the patient's crown), and that read better than
 * the scan pressed or moved onto the library teeth - every tooth keeps its own anatomy, labial and palatal. So the
 * whole library teeth joined on ("patient": the patient's own surface shows only where it stands outside a tooth).
 */
export const PALATAL_DEFAULT: PalatalForm = "patient";
// Build 288: three ways. "patient" (the default) joins the whole teeth and leaves the scan alone; "library" also presses
// the patient's palatal onto the wax teeth where it stands out beyond them - tried as the default on the lab benchmark
// and put back: it tears the scan into slivers at the palatal gum line; "shell" is build 283's scan shaped to the teeth.

/** A wax tooth, in the scan's coordinates: its closed soup and frame (up towards the incisal edge, out labial). */
export type PalatalTooth = { soup: Float32Array; origin: ArrayLike<number>; up: ArrayLike<number>; out: ArrayLike<number>; mesial: ArrayLike<number> };

/** How far palatal of the library tooth's surface the patient's surface is pressed onto it, mm. */
export const PALATAL_REACH = 4;
/** Over how much (the last part of the reach, the cervical end, the mesial and distal edges) the press fades out, mm. */
export const PALATAL_FADE = 1.5;
/** How far inside the library tooth the pressed surface goes (so the join is clean), mm. */
export const PALATAL_SINK = 0.15;
/** A face counts as palatal when its normal points this far palatally (its share along -out). */
export const PALATAL_FACING = 0.1;
/** Palatal of the tooth's most palatal point (its cingulum), the gum and palate ease down to it over this - a ramp, never a trench, mm. */
export const PALATAL_RAMP = 3;

const smooth01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The palatal map's cell, mm. */
const CELL = 0.25;

/**
 * The wax tooth's palatal surface as a map over its outline seen from the palate: for each (mesial, up) cell, how far
 * palatal (along -out) the tooth reaches there, and the outline's reach in each row and column (to fade the press out
 * towards it). The tooth's triangles are sampled finely, so a cell is filled wherever the tooth covers it.
 */
function palatalMap(tooth: PalatalTooth) {
  const o = tooth.origin;
  const cells = new Map<number, number>();
  const rows = new Map<number, [number, number]>();
  const cols = new Map<number, [number, number]>();
  const key = (i: number, j: number) => i * 100003 + j;
  const p = [0, 0, 0];
  let b0 = Infinity;
  const put = (m: number, u: number, b: number) => {
    const i = Math.round(m / CELL), j = Math.round(u / CELL);
    const k = key(i, j);
    const was = cells.get(k);
    if (was === undefined || b < was) cells.set(k, b);
    const r = rows.get(j); rows.set(j, r ? [Math.min(r[0], m), Math.max(r[1], m)] : [m, m]);
    const c = cols.get(i); cols.set(i, c ? [Math.min(c[0], u), Math.max(c[1], u)] : [u, u]);
    b0 = Math.min(b0, b);
  };
  const s = tooth.soup;
  for (let t = 0; t + 8 < s.length; t += 9) {
    const local: number[][] = [];
    for (let k = 0; k < 3; k += 1) {
      const d = [s[t + k * 3] - o[0], s[t + k * 3 + 1] - o[1], s[t + k * 3 + 2] - o[2]];
      local.push([dot(d, tooth.mesial), dot(d, tooth.up), dot(d, tooth.out)]);
    }
    const span = Math.max(...[0, 1, 2].map((k) => Math.hypot(local[k][0] - local[(k + 1) % 3][0], local[k][1] - local[(k + 1) % 3][1])));
    const n = Math.min(60, Math.max(1, Math.ceil(span / (CELL * 0.5))));
    for (let a = 0; a <= n; a += 1) for (let b = 0; a + b <= n; b += 1) {
      const wa = a / n, wb = b / n, wc = 1 - wa - wb;
      for (let k = 0; k < 3; k += 1) p[k] = local[0][k] * wa + local[1][k] * wb + local[2][k] * wc;
      put(p[0], p[1], p[2]);
    }
  }
  /** The tooth's palatal-most reach (b) at (m, u), interpolated between cells; null outside its outline. */
  const at = (m: number, u: number): number | null => {
    const fi = m / CELL, fj = u / CELL;
    const i0 = Math.floor(fi), j0 = Math.floor(fj), ti = fi - i0, tj = fj - j0;
    let sum = 0, weight = 0;
    for (const [i, j, w] of [[i0, j0, (1 - ti) * (1 - tj)], [i0 + 1, j0, ti * (1 - tj)], [i0, j0 + 1, (1 - ti) * tj], [i0 + 1, j0 + 1, ti * tj]] as const) {
      const v = cells.get(key(i, j));
      if (v !== undefined && w > 0) { sum += v * w; weight += w; }
    }
    return weight > 0.25 ? sum / weight : null;
  };
  /** How far (mm) inside the outline (m, u) lies: the nearer of its row's and column's ends. */
  const inside = (m: number, u: number) => {
    const r = rows.get(Math.round(u / CELL)), c = cols.get(Math.round(m / CELL));
    if (!r || !c) return -1;
    return Math.min(m - r[0], r[1] - m, u - c[0], c[1] - u);
  };
  return { at, inside, b0 };
}

/**
 * The scan (a triangle soup) with its surface standing palatal of each wax tooth pressed onto that tooth.
 * Each corner moves only along the tooth's labio-palatal direction - never up or down, never sideways - so the
 * patient's tooth is never dragged into streaks; where the patient's tooth stands beyond the wax's outline (past its
 * edge, say) it is left as scanned, the press fading out over PALATAL_FADE inside the outline.
 * Corners at one point move together, so the soup stays closed. Returns the soup unchanged when nothing moved.
 */
export function pressPalatal(scan: Float32Array, teeth: PalatalTooth[]): { positions: Float32Array; moved: number } {
  if (!teeth.length) return { positions: scan, moved: 0 };
  const out = Float32Array.from(scan);
  let moved = 0;
  for (const tooth of teeth) {
    const o = tooth.origin;
    const map = palatalMap(tooth);
    if (!Number.isFinite(map.b0)) continue;
    const seen = new Map<string, number | null>();
    for (let c = 0; c + 2 < out.length; c += 3) {
      const x = out[c], y = out[c + 1], z = out[c + 2];
      const d = [x - o[0], y - o[1], z - o[2]];
      const m = dot(d, tooth.mesial), u = dot(d, tooth.up), b = dot(d, tooth.out);
      if (b > 0.5 || b < map.b0 - PALATAL_REACH - 0.5) continue;
      const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
      let shift = seen.get(key);
      if (shift === undefined) {
        shift = null;
        const edge = map.inside(m, u);
        const wall = edge > 0 ? map.at(m, u) : null;
        // Palatal of the tooth there, within reach.
        if (wall !== null && b < wall && wall - b < PALATAL_REACH) {
          const w = (1 - smooth01((wall - b - (PALATAL_REACH - PALATAL_FADE)) / PALATAL_FADE))
            * smooth01(edge / PALATAL_FADE)
            * (b < map.b0 ? 1 - smooth01((map.b0 - b) / PALATAL_RAMP) : 1);
          if (w > 1e-3) shift = w * (wall + PALATAL_SINK - b);
        }
        seen.set(key, shift);
      }
      if (shift === null) continue;
      out[c] = x + shift * tooth.out[0]; out[c + 1] = y + shift * tooth.out[1]; out[c + 2] = z + shift * tooth.out[2];
      moved += 1;
    }
  }
  return moved ? { positions: out, moved } : { positions: scan, moved: 0 };
}
