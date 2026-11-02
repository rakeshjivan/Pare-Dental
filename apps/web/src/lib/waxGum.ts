/**
 * Build 108: Wax-up Studio's Gum line - how the wax teeth meet the gum on the made model.
 *
 * "follow": the patient's gum as it is; the wax teeth go on under it (and, on a hollow model, the hollow
 * goes on under them).
 * "even": a perfected gum line - over each wax tooth the gum is trimmed back (never added) to a scalloped
 * margin: its zenith (most apical point) a set length from the tooth's incisal edge and, as in the healthy
 * maxillary anterior dentition (Chu et al. 2009, J Esthet Restor Dent 21:113), about 1 mm distal of the
 * tooth's long axis on a central incisor, 0.4 mm on a lateral and centred on a canine; from the zenith
 * the margin rises towards the contacts, so the papillae are kept. Each pair (11|21, 12|22, 13|23 and the
 * lower ones) shares one length, so the two sides mirror each other.
 *
 * Only the gum standing in front of a tooth's labial face is trimmed: the region is the tooth swept out
 * labially by GUM_REACH, less the tooth itself, coronal of the margin.
 */

export type Vec3 = [number, number, number];
export type GumMode = "follow" | "even";

/** A wax tooth's frame: its incisal point on the labial face (origin), towards the incisal edge (up), mesial, labial (out). */
export type GumFrame = { origin: Vec3; up: Vec3; mesial: Vec3; out: Vec3 };

/** One wax tooth's gum trim, in the model's coordinates. */
export type GumCut = GumFrame & {
  /** The wax tooth (a closed soup). */
  soup: Float32Array;
  /** How far apical of the incisal edge the zenith lies (the visible crown length at the zenith), mm. */
  keep: number;
  /** The zenith's shift from the middle of the tooth, mm towards distal. */
  distal: number;
  /** The tooth's mesio-distal width, mm. */
  width: number;
};

/** How far in front of the labial face the gum is trimmed, mm. */
export const GUM_REACH = 2.4;
/** How far the margin rises from its zenith to the tooth's contact (half its width away), mm. */
export const GUM_RISE = 3;
/** Chu et al. 2009: the zenith's distal shift by tooth (1 central, 2 lateral, 3 canine), maxillary; lower teeth centred. */
export function zenithShift(fdi: number): number {
  const k = fdi % 10, upper = fdi < 30;
  if (!upper) return 0;
  return k === 1 ? 1 : k === 2 ? 0.4 : 0;
}
/** Chu et al. 2009: the lateral incisor's zenith lies about 1 mm coronal of the line joining the central's and canine's. */
export const LATERAL_CORONAL = 1;

/** The pair a tooth belongs to (its arch and its place from the midline): "upper:1" for 11 and 21. */
export function gumPair(fdi: number): string {
  return `${fdi < 30 ? "upper" : "lower"}:${fdi % 10}`;
}

const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * A point's place in a tooth's frame: `m` along mesial from the zenith's line (positive mesial), `u`
 * apical of the incisal edge (positive towards the root), `o` labial of the origin.
 */
export function inToothFrame(f: GumFrame & { distal?: number }, p: ArrayLike<number>) {
  const d: Vec3 = [p[0] - f.origin[0], p[1] - f.origin[1], p[2] - f.origin[2]];
  return { m: dot(d, f.mesial) + (f.distal ?? 0), u: -dot(d, f.up), o: dot(d, f.out) };
}

/** The margin's height (apical of the incisal edge) a distance `m` from the zenith, for a tooth `width` wide. */
export function marginAt(keep: number, m: number, width: number): number {
  const half = Math.max(1, width / 2);
  return keep - GUM_RISE * (m / half) ** 2;
}

/**
 * The region coronal of the margin, as a closed soup: the parabola's hypograph (convex), from 6 mm beyond
 * the incisal edge to the margin, across 1.4 tooth widths, extruded from `back` mm lingual to `front` mm labial.
 */
export function marginRegion(cut: GumCut, back = 8, front = GUM_REACH + 2): Float32Array {
  const half = Math.max(1, cut.width / 2) * 1.4;
  const steps = 24;
  // The outline in (m, u), anticlockwise seen from labial: along the margin from distal to mesial, then back along the top.
  const ring: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i += 1) {
    const m = -half + (2 * half * i) / steps;
    ring.push([m, marginAt(cut.keep, m, cut.width)]);
  }
  ring.push([half, -6], [-half, -6]);
  const at = (m: number, u: number, o: number): Vec3 => {
    const mm = m - cut.distal;
    return [
      cut.origin[0] + cut.mesial[0] * mm - cut.up[0] * u + cut.out[0] * o,
      cut.origin[1] + cut.mesial[1] * mm - cut.up[1] * u + cut.out[1] * o,
      cut.origin[2] + cut.mesial[2] * mm - cut.up[2] * u + cut.out[2] * o,
    ];
  };
  const out: number[] = [];
  const tri = (a: Vec3, b: Vec3, c: Vec3) => out.push(...a, ...b, ...c);
  const n = ring.length;
  // Caps (a fan - the outline is convex) and the sides.
  for (let i = 1; i + 1 < n; i += 1) {
    tri(at(...ring[0], front), at(...ring[i], front), at(...ring[i + 1], front));
    tri(at(...ring[0], -back), at(...ring[i + 1], -back), at(...ring[i], -back));
  }
  for (let i = 0; i < n; i += 1) {
    const a = ring[i], b = ring[(i + 1) % n];
    tri(at(...a, -back), at(...b, -back), at(...b, front));
    tri(at(...a, -back), at(...b, front), at(...a, front));
  }
  // Wound so the outward faces point out: check one face against the middle and flip if not.
  const mid = at(0, cut.keep / 2 - 3, (front - back) / 2);
  const a = out.slice(0, 3), b = out.slice(3, 6), c = out.slice(6, 9);
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const nrm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  if (dot(nrm, [a[0] - mid[0], a[1] - mid[1], a[2] - mid[2]]) < 0) {
    for (let i = 0; i < out.length; i += 9) for (let k = 0; k < 3; k += 1) { const t = out[i + 3 + k]; out[i + 3 + k] = out[i + 6 + k]; out[i + 6 + k] = t; }
  }
  return Float32Array.from(out);
}

/** Moves a cut by a rigid move (column-major 4x4). */
export function moveGumCut(cut: GumCut, m: ArrayLike<number>): GumCut {
  const p = (v: Vec3): Vec3 => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
  const d = (v: Vec3): Vec3 => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2], m[1] * v[0] + m[5] * v[1] + m[9] * v[2], m[2] * v[0] + m[6] * v[1] + m[10] * v[2]];
  const soup = new Float32Array(cut.soup.length);
  for (let i = 0; i + 2 < soup.length; i += 3) { const q = p([cut.soup[i], cut.soup[i + 1], cut.soup[i + 2]]); soup[i] = q[0]; soup[i + 1] = q[1]; soup[i + 2] = q[2]; }
  return { ...cut, soup, origin: p(cut.origin), up: d(cut.up), mesial: d(cut.mesial), out: d(cut.out) };
}

/**
 * Chu et al. 2009's levels from the central incisors' length: the canines' zenith level with the centrals',
 * the laterals' 1 mm coronal of it - each as a length from that tooth's own incisal edge. `teeth` are the
 * arch's wax teeth (frames in one set of coordinates, `up` towards the incisal edge); `arch` the arch's
 * own incisal direction. Returns the length for each pair ("upper:1" ...), or null without a central.
 */
export function idealLevels(teeth: Array<{ fdi: number; frame: GumFrame }>, centralKeep: number, arch: Vec3): Record<string, number> | null {
  const centrals = teeth.filter((t) => t.fdi % 10 === 1);
  if (!centrals.length) return null;
  const a = Math.hypot(...arch) > 0 ? arch.map((v) => v / Math.hypot(...arch)) : [0, 0, 1];
  // The centrals' zenith level along the arch's incisal direction (their mean).
  const zenith = (t: { frame: GumFrame }, keep: number) => dot(t.frame.origin, a) - keep * dot(t.frame.up, a);
  const level = centrals.reduce((s, t) => s + zenith(t, centralKeep), 0) / centrals.length;
  const out: Record<string, number> = {};
  const upper = centrals[0].fdi < 30;
  out[`${upper ? "upper" : "lower"}:1`] = centralKeep;
  for (const k of [2, 3]) {
    const these = teeth.filter((t) => t.fdi % 10 === k);
    if (!these.length) continue;
    const want = level + (k === 2 ? LATERAL_CORONAL : 0);
    // keep such that origin.a - keep * up.a = want.
    const keeps = these.map((t) => (dot(t.frame.origin, a) - want) / Math.max(0.2, dot(t.frame.up, a)));
    out[`${upper ? "upper" : "lower"}:${k}`] = Math.max(0, keeps.reduce((s, v) => s + v, 0) / keeps.length);
  }
  return out;
}

/** The nearest-surface look-up a gum reading needs (lib/nearestSurface's NearestSurface). */
export type SurfaceProbe = { nearest(x: number, y: number, z: number, out: number[] | Float64Array): number; lastTriangle: number; triangleNormal(t: number, out: number[] | Float64Array): void };

type ToothGum = GumFrame & { distal: number; width: number };

/**
 * Each corner of a wax tooth (a soup) against the patient's scan: how far in front of (+) or under (-) the
 * scan's surface it lies, or Infinity beyond the probe's reach. The scan's faces may point either way (some
 * exports run inside out): the side the tooth's incisal third is on counts as in front.
 */
export function gumSides(soup: ArrayLike<number>, tooth: ToothGum, scan: SurfaceProbe): Float32Array {
  const n = Math.floor(soup.length / 3);
  const side = new Float32Array(n);
  const q = [0, 0, 0], tn = [0, 0, 0];
  const incisal: number[] = [];
  for (let v = 0; v < n; v += 1) {
    const x = soup[v * 3], y = soup[v * 3 + 1], z = soup[v * 3 + 2];
    const d = scan.nearest(x, y, z, q);
    if (!(d < Infinity) || scan.lastTriangle < 0) { side[v] = Infinity; continue; }
    scan.triangleNormal(scan.lastTriangle, tn);
    side[v] = (x - q[0]) * tn[0] + (y - q[1]) * tn[1] + (z - q[2]) * tn[2];
    if (inToothFrame(tooth, [x, y, z]).u < 3) incisal.push(side[v]);
  }
  incisal.sort((a, b) => a - b);
  if (incisal.length && incisal[incisal.length >> 1] < 0) for (let v = 0; v < n; v += 1) if (side[v] < Infinity) side[v] = -side[v];
  return side;
}

/** How far the gum covers a corner: in front of the scan (or clear of it) it shows; under it, it is covered. */
const COVERED = -0.03;

/**
 * The visible crown length at the zenith now: from the incisal edge to the most apical labial corner, in a strip
 * 1.2 mm either side of the zenith's line, that the gum does not cover, mm. "Covered" is under the scan's surface -
 * which is also inside the patient's own tooth, so a wax tooth sunk in the patient's near its edge is not read as
 * gum-covered there. A corner beyond the look-up's reach counts as shown in the tooth's incisal half (wax standing
 * clear of the scan) and as covered in its cervical half (deep under the gum).
 */
export function visibleLength(soup: ArrayLike<number>, tooth: ToothGum & { length?: number }, sides: Float32Array): number {
  let best = 0;
  const length = tooth.length ?? 12;
  const n = Math.floor(soup.length / 9);
  for (let t = 0; t < n; t += 1) {
    const o = t * 9;
    const e1 = [soup[o + 3] - soup[o], soup[o + 4] - soup[o + 1], soup[o + 5] - soup[o + 2]];
    const e2 = [soup[o + 6] - soup[o], soup[o + 7] - soup[o + 1], soup[o + 8] - soup[o + 2]];
    const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    const len = Math.hypot(nx, ny, nz) || 1;
    if ((nx * tooth.out[0] + ny * tooth.out[1] + nz * tooth.out[2]) / len < 0.3) continue;
    for (let k = 0; k < 3; k += 1) {
      const v = t * 3 + k;
      const f = inToothFrame(tooth, [soup[v * 3], soup[v * 3 + 1], soup[v * 3 + 2]]);
      const shown = Number.isFinite(sides[v]) ? sides[v] >= COVERED : f.u < length * 0.5;
      if (shown && Math.abs(f.m) <= 1.2 && f.u > best) best = f.u;
    }
  }
  return Math.min(best, length);
}

/** The preview's colours (RGB, 0-1). */
export const GUM_COLOURS = {
  covered: [0.62, 0.7, 0.78],
  margin: [0.84, 0.25, 0.2],
  trimmed: [0.95, 0.7, 0.3],
  line: [0.18, 0.62, 0.36],
} as const;

/**
 * A wax tooth's corners coloured for the Gum line step: under the patient's gum (blue-grey), the patient's
 * gum line on it (red); with the even line, the gum that goes (amber) and the new margin (green); the
 * rest in the tooth's own colour.
 */
export function gumPaint(soup: ArrayLike<number>, tooth: ToothGum, sides: Float32Array, base: readonly number[], keep: number | null): Float32Array {
  const n = Math.floor(soup.length / 3);
  const out = new Float32Array(n * 3);
  for (let v = 0; v < n; v += 1) {
    const s = sides[v];
    const f = inToothFrame(tooth, [soup[v * 3], soup[v * 3 + 1], soup[v * 3 + 2]]);
    let c: readonly number[] = base;
    if (s < COVERED) c = GUM_COLOURS.covered;
    if (Math.abs(s) <= 0.08) c = GUM_COLOURS.margin;
    if (keep !== null && f.o > -1.5) {
      const margin = marginAt(keep, f.m, tooth.width);
      if (s < COVERED && f.u < margin) c = GUM_COLOURS.trimmed;
      if (Math.abs(f.u - margin) < 0.15 && Math.abs(f.m) < tooth.width / 2) c = GUM_COLOURS.line;
    }
    out[v * 3] = c[0]; out[v * 3 + 1] = c[1]; out[v * 3 + 2] = c[2];
  }
  return out;
}
