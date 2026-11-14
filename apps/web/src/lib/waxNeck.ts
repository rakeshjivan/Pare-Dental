/**
 * Build 289 (Rakesh: "the palatal not fitting the wax-up tooth to the palatal scan gum line"): a library tooth is a
 * crown that stops at its neck. Laid on an arch with its labial neck at the gum line - and turned to cover the
 * patient's tooth - its palatal neck often ends short of the palatal gum, which lies further gumwards and palatal;
 * joined to the scan, the tooth's flat end then shows as a ledge above the gum.
 *
 * So for the model, the palatal side of each tooth's neck is drawn out into a short root: carried gumwards along the
 * tooth's own axis, and a little palatally, more and more towards its end (the labial side stays where it was laid). The crown (most of the tooth)
 * is not touched at all, the root is hidden in the gum, and where the tooth leaves the gum - labial and palatal -
 * is where the two surfaces meet: the patient's own gum line.
 */
type Vec3 = [number, number, number];

/** Where the neck begins, as a part of the tooth's length from its incisal edge. */
export const NECK_FROM = 0.72;
/** How far the tooth's cervical end is carried gumwards, mm; and palatally for each mm gumwards. */
export const NECK_REACH = 4.5;
export const NECK_LEAN = 0.3;
/** Across the neck from its labial face (0) to its palatal (1): nothing moves up to the first, all of it from the second. */
export const NECK_LABIAL = 0.3;
export const NECK_PALATAL = 0.75;

/**
 * A wax tooth (`soup`, a triangle soup) with its neck drawn out. `frame`: the tooth's incisal middle (`origin`), its
 * `up` (towards its incisal edge) and `out` (labial), in the soup's coordinates. A new soup; the crown's corners are
 * the very same numbers.
 */
/** Pare Dental: the longest a neck is drawn out to reach under the palatal gum, mm; the leans tried (palatal per mm gumwards),
 * the usual first - less where the gum falls away palatally, more where it stands out. */
export const NECK_REACH_MOST = 9;
export const NECK_LEANS = [0.3, 0.15, 0, 0.6, 1];
/** How deep under the patient's surface the end of the neck must be, mm; and the share of its end that must be there. */
export const NECK_UNDER = 0.3;
export const NECK_UNDER_SHARE = 0.95;

/**
 * Pare Dental (Rakesh: "the buccal gingival margin correctly masks over the wax-up tooth, so the tooth appears to
 * grow from the gum line - the palatal doesn't"): a fixed reach and lean can leave the drawn-out palatal neck lying
 * over the palatal gum where it slopes away into the palate. With `under` (the height of a point above the patient's
 * surface, negative under it), each tooth takes the least reach - and the least lean - that puts the end of its
 * palatal neck under the gum, so the gum hides it there as it does labially.
 */
export function extendNeck(soup: ArrayLike<number>, frame: { origin: ArrayLike<number>; up: ArrayLike<number>; out: ArrayLike<number> }, reach = NECK_REACH, under?: (x: number, y: number, z: number) => number): Float32Array {
  if (under) {
    const fit = neckFit(soup, frame, reach, under);
    return drawNeck(soup, frame, fit.reach, fit.lean);
  }
  return drawNeck(soup, frame, reach, NECK_LEAN);
}

/** The reach and lean that take the end of the tooth's palatal neck under the patient's surface (the most tried if none does). */
export function neckFit(soup: ArrayLike<number>, frame: { origin: ArrayLike<number>; up: ArrayLike<number>; out: ArrayLike<number> }, reach: number, under: (x: number, y: number, z: number) => number): { reach: number; lean: number; under: number } {
  const ends = neckEnds(soup, frame);
  if (!ends.length) return { reach, lean: NECK_LEAN, under: 1 };
  const norm = (v: ArrayLike<number>): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const up = norm(frame.up), labial = norm(frame.out);
  let best = { reach: NECK_REACH_MOST, lean: NECK_LEANS[NECK_LEANS.length - 1], under: 0 };
  for (let r = reach; r <= NECK_REACH_MOST + 1e-9; r += 0.5) {
    for (const lean of NECK_LEANS) {
      let hidden = 0;
      for (const [x, y, z, w] of ends) {
        const by = r * w;
        if (under(x - (up[0] + labial[0] * lean) * by, y - (up[1] + labial[1] * lean) * by, z - (up[2] + labial[2] * lean) * by) < -NECK_UNDER) hidden += 1;
      }
      const share = hidden / ends.length;
      if (share >= NECK_UNDER_SHARE) return { reach: r, lean, under: share };
      if (share > best.under) best = { reach: r, lean, under: share };
    }
  }
  return best;
}

/** The corners at the end of the palatal neck (well into it and well palatal), each with its share of the move. */
function neckEnds(soup: ArrayLike<number>, frame: { origin: ArrayLike<number>; up: ArrayLike<number>; out: ArrayLike<number> }): Array<[number, number, number, number]> {
  const ends: Array<[number, number, number, number]> = [];
  neckWalk(soup, frame, (i, s, palatal) => { if (s > 0.85 && palatal > 0.85) ends.push([soup[i], soup[i + 1], soup[i + 2], s * s * palatal]); });
  return ends;
}

/** Each corner of the neck, with how far into the neck it is (s, 0 to 1) and how palatal (0 to 1). */
function neckWalk(soup: ArrayLike<number>, frame: { origin: ArrayLike<number>; up: ArrayLike<number>; out: ArrayLike<number> }, visit: (i: number, s: number, palatal: number) => void) {
  const norm = (v: ArrayLike<number>): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const up = norm(frame.up), labial = norm(frame.out), o = frame.origin;
  let length = 0;
  for (let i = 0; i + 2 < soup.length; i += 3) length = Math.max(length, (o[0] - soup[i]) * up[0] + (o[1] - soup[i + 1]) * up[1] + (o[2] - soup[i + 2]) * up[2]);
  if (length < 2) return;
  let front = -Infinity, back = Infinity;
  for (let i = 0; i + 2 < soup.length; i += 3) {
    const depth = (o[0] - soup[i]) * up[0] + (o[1] - soup[i + 1]) * up[1] + (o[2] - soup[i + 2]) * up[2];
    if (depth < length * NECK_FROM) continue;
    const b = (soup[i] - o[0]) * labial[0] + (soup[i + 1] - o[1]) * labial[1] + (soup[i + 2] - o[2]) * labial[2];
    front = Math.max(front, b); back = Math.min(back, b);
  }
  if (!(front - back > 0.5)) return;
  for (let i = 0; i + 2 < soup.length; i += 3) {
    const depth = (o[0] - soup[i]) * up[0] + (o[1] - soup[i + 1]) * up[1] + (o[2] - soup[i + 2]) * up[2];
    const s = (depth / length - NECK_FROM) / (1 - NECK_FROM);
    if (s <= 0) continue;
    const across = (front - ((soup[i] - o[0]) * labial[0] + (soup[i + 1] - o[1]) * labial[1] + (soup[i + 2] - o[2]) * labial[2])) / (front - back);
    const q = Math.min(1, Math.max(0, (across - NECK_LABIAL) / (NECK_PALATAL - NECK_LABIAL)));
    const palatal = q * q * (3 - 2 * q);
    if (palatal > 0) visit(i, s, palatal);
  }
}

function drawNeck(soup: ArrayLike<number>, frame: { origin: ArrayLike<number>; up: ArrayLike<number>; out: ArrayLike<number> }, reach: number, lean: number): Float32Array {
  const out = Float32Array.from(soup);
  const norm = (v: ArrayLike<number>): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const up = norm(frame.up), labial = norm(frame.out), o = frame.origin;
  // The tooth's length: its corner furthest gumwards of the incisal middle.
  let length = 0;
  for (let i = 0; i + 2 < out.length; i += 3) length = Math.max(length, (o[0] - out[i]) * up[0] + (o[1] - out[i + 1]) * up[1] + (o[2] - out[i + 2]) * up[2]);
  if (length < 2) return out;
  // The neck from labial to palatal: how far behind the tooth's labial face its corners there reach.
  let front = -Infinity, back = Infinity;
  for (let i = 0; i + 2 < out.length; i += 3) {
    const depth = (o[0] - out[i]) * up[0] + (o[1] - out[i + 1]) * up[1] + (o[2] - out[i + 2]) * up[2];
    if (depth < length * NECK_FROM) continue;
    const b = (out[i] - o[0]) * labial[0] + (out[i + 1] - o[1]) * labial[1] + (out[i + 2] - o[2]) * labial[2];
    front = Math.max(front, b); back = Math.min(back, b);
  }
  if (!(front - back > 0.5)) return out;
  for (let i = 0; i + 2 < out.length; i += 3) {
    const depth = (o[0] - out[i]) * up[0] + (o[1] - out[i + 1]) * up[1] + (o[2] - out[i + 2]) * up[2];
    const s = (depth / length - NECK_FROM) / (1 - NECK_FROM);
    if (s <= 0) continue;
    // Only the palatal side of the neck: its labial side stays at the gum line where the tooth was laid (drawn out
    // too, it came through the labial gum above the tooth on the lab benchmark).
    const across = (front - ((out[i] - o[0]) * labial[0] + (out[i + 1] - o[1]) * labial[1] + (out[i + 2] - o[2]) * labial[2])) / (front - back);
    const q = Math.min(1, Math.max(0, (across - NECK_LABIAL) / (NECK_PALATAL - NECK_LABIAL)));
    const palatal = q * q * (3 - 2 * q);
    if (palatal <= 0) continue;
    // Eased in from nothing where the neck begins, so the surface carries on smoothly from the crown.
    const by = reach * s * s * palatal;
    out[i] -= (up[0] + labial[0] * lean) * by;
    out[i + 1] -= (up[1] + labial[1] * lean) * by;
    out[i + 2] -= (up[2] + labial[2] * lean) * by;
  }
  return out;
}
