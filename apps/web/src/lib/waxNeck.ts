/**
 * Build 289 (Rakesh: "the palatal not fitting the wax-up tooth to the palatal scan gum line"): a library tooth is a
 * crown that stops at its neck. Laid on an arch with its labial neck at the gum line - and turned to cover the
 * patient's tooth - its palatal neck often ends short of the palatal gum, which lies further gumwards and palatal;
 * joined to the scan, the tooth's flat end then shows as a ledge above the gum.
 *
 * So for the model, each tooth's neck is drawn out into a short root: the cervical part of the tooth is carried
 * gumwards along its own axis, and a little palatally, more and more towards its end. The crown (most of the tooth)
 * is not touched at all, the root is hidden in the gum, and where the tooth leaves the gum - labial and palatal -
 * is where the two surfaces meet: the patient's own gum line.
 */
type Vec3 = [number, number, number];

/** Where the neck begins, as a part of the tooth's length from its incisal edge. */
export const NECK_FROM = 0.72;
/** How far the tooth's cervical end is carried gumwards, mm; and palatally for each mm gumwards. */
export const NECK_REACH = 4.5;
export const NECK_LEAN = 0.3;

/**
 * A wax tooth (`soup`, a triangle soup) with its neck drawn out. `frame`: the tooth's incisal middle (`origin`), its
 * `up` (towards its incisal edge) and `out` (labial), in the soup's coordinates. A new soup; the crown's corners are
 * the very same numbers.
 */
export function extendNeck(soup: ArrayLike<number>, frame: { origin: ArrayLike<number>; up: ArrayLike<number>; out: ArrayLike<number> }, reach = NECK_REACH): Float32Array {
  const out = Float32Array.from(soup);
  const norm = (v: ArrayLike<number>): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const up = norm(frame.up), labial = norm(frame.out), o = frame.origin;
  // The tooth's length: its corner furthest gumwards of the incisal middle.
  let length = 0;
  for (let i = 0; i + 2 < out.length; i += 3) length = Math.max(length, (o[0] - out[i]) * up[0] + (o[1] - out[i + 1]) * up[1] + (o[2] - out[i + 2]) * up[2]);
  if (length < 2) return out;
  for (let i = 0; i + 2 < out.length; i += 3) {
    const depth = (o[0] - out[i]) * up[0] + (o[1] - out[i + 1]) * up[1] + (o[2] - out[i + 2]) * up[2];
    const s = (depth / length - NECK_FROM) / (1 - NECK_FROM);
    if (s <= 0) continue;
    // Eased in from nothing where the neck begins, so the surface carries on smoothly from the crown.
    const by = reach * s * s;
    out[i] -= (up[0] + labial[0] * NECK_LEAN) * by;
    out[i + 1] -= (up[1] + labial[1] * NECK_LEAN) * by;
    out[i + 2] -= (up[2] + labial[2] * NECK_LEAN) * by;
  }
  return out;
}
