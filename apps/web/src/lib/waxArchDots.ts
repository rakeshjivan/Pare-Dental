/**
 * Build 107: Wax-up Studio's landmarks, the dentist's way.
 *
 * Each tooth is anchored by three dots on the scan - its cervical zenith and its mesial and distal
 * contacts (where it is, how wide, where the gum is). Three more dots set the arch: the midline
 * between the centrals at the incisal edge and the two canine tips, placed where the new edges are
 * wanted (on the tooth, or past a worn one). The incisal curve runs through those three; each tooth's
 * edge sits on it, the laterals a little shorter. The four marks the fit works from (mesial,
 * distal, cervical, incisal) follow from the two.
 */
import type { ToothMarks } from "./dentalWaxup";

type Vec3 = [number, number, number];
export type ToothAnchors = { cervical: Vec3; mesial: Vec3; distal: Vec3 };
/** The order a tooth's anchors are clicked in. */
export const ANCHOR_ORDER = ["cervical", "mesial", "distal"] as const;
/** The order the arch dots are clicked in: midline, the patient's right canine tip, the left. */
export const ARCH_DOT_ORDER = ["midline", "right", "left"] as const;
/** Stand-in for "the arch" in the marking queue (no tooth has FDI 0). */
export const ARCH_STEP = 0;
/** The canine whose tip is an arch dot: the patient's right or left, upper or lower. */
export const canineOf = (slot: "upper" | "lower", side: "right" | "left") => (slot === "upper" ? (side === "right" ? 13 : 23) : side === "right" ? 43 : 33);
/** How much shorter the laterals are set than the arch curve, mm. */
export const LATERAL_SHORTER = 0.75;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (a: Vec3) => Math.sqrt(dot(a, a));
const mid = (a: Vec3, b: Vec3): Vec3 => scale(add(a, b), 0.5);

/** The incisal curve at s (-1: the right canine tip, 0: the midline, 1: the left) - a parabola through the three dots. */
export function archCurveAt(arch: [Vec3, Vec3, Vec3], s: number): Vec3 {
  const [m, r, l] = arch;
  const half = scale(sub(l, r), 0.5);
  const bend = sub(scale(add(l, r), 0.5), m);
  return add(add(m, scale(half, s)), scale(bend, s * s));
}

/** Points along the incisal curve, for drawing it (a little past each canine). */
export function archCurvePoints(arch: [Vec3, Vec3, Vec3], count = 48, reach = 1.15): Vec3[] {
  return Array.from({ length: count }, (_, i) => archCurveAt(arch, -reach + (2 * reach * i) / (count - 1)));
}

/** The direction from the incisal edges towards the gum, from the anchored teeth (null if none). */
export function gumward(anchors: Record<number, ToothAnchors>): Vec3 | null {
  let up: Vec3 = [0, 0, 0];
  for (const a of Object.values(anchors)) up = add(up, sub(a.cervical, mid(a.mesial, a.distal)));
  const n = length(up);
  return n > 1e-6 ? scale(up, 1 / n) : null;
}

/**
 * Each anchored tooth's four marks: its contacts and zenith as clicked, its incisal mark on the
 * incisal curve where the tooth stands (seen along the gumward direction), laterals set shorter.
 */
export function marksFromAnchors(anchors: Record<number, ToothAnchors>, arch: Vec3[] | null | undefined, lateralShorter = LATERAL_SHORTER): Record<number, ToothMarks> {
  if (!arch || arch.length < 3) return {};
  const curve = arch as [Vec3, Vec3, Vec3];
  const up = gumward(anchors);
  if (!up) return {};
  const flat = (v: Vec3) => sub(v, scale(up, dot(v, up)));
  const out: Record<number, ToothMarks> = {};
  for (const [key, a] of Object.entries(anchors)) {
    const fdi = Number(key);
    const centre = flat(mid(a.mesial, a.distal));
    // The point of the curve nearest the tooth seen from above: a coarse sweep, then a finer one.
    let best = 0, bestD = Infinity;
    for (let i = 0; i <= 320; i += 1) {
      const s = -1.6 + (3.2 * i) / 320;
      const d = length(sub(flat(archCurveAt(curve, s)), centre));
      if (d < bestD) { bestD = d; best = s; }
    }
    for (let i = -20; i <= 20; i += 1) {
      const s = best + i * 0.0005;
      const d = length(sub(flat(archCurveAt(curve, s)), centre));
      if (d < bestD) { bestD = d; best = s; }
    }
    let incisal = archCurveAt(curve, best);
    // A canine's edge is its tip - the arch dot placed for it.
    const q = Math.floor(fdi / 10);
    if (fdi % 10 === 3) incisal = q === 1 || q === 4 ? curve[1] : curve[2];
    if (fdi % 10 === 2) incisal = add(incisal, scale(up, lateralShorter));
    out[fdi] = { mesial: a.mesial, distal: a.distal, cervical: a.cervical, incisal };
  }
  return out;
}
