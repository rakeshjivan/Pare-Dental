/**
 * Build 331 (Rakesh: guide lines in view - "midline, incisal curve, zenith line, with a caliper readout (width,
 * length, W/L %)"; "the markers also need to be user adjustable with the use of sliders along with a show hide
 * button"): the lines a wax-up is designed to, drawn over the teeth in Design, and each tooth measured.
 *
 * The lines' heights come from the dentist's own marks, not from the wax teeth - a guide that followed the teeth
 * would say nothing about them:
 *  - the midline: upright through the marked midline;
 *  - the incisal curve: at the marked midline's edge level, falling away to the canine tips as marked.
 * Each is then moved with its slider (mm), the incisal curve's depth too.
 *
 * Build 333 (Rakesh, of the incisal curve: "it stays static when rotating the model"; it should look "at the tips
 * from the front" and, the model turned, be seen "running through the centre of the teeth" - as the line of
 * occlusion does - so the teeth can be set to it from any view; more curve than -2 to 5 mm; the zenith line "isn't
 * helping much so it can be removed"): the incisal curve is one curve in space the teeth are set to - round the
 * arch on the even arch through the marked contacts (lib/waxSmileSet idealArch: where the set is first laid), moved
 * labially or palatally with its own slider; its height as before. It does not follow the wax teeth (a line that
 * did would always look right). The zenith line is gone.
 *
 * All in the scene's coordinates (as the set's anchors are).
 */
import { idealArch } from "@/lib/waxSmileSet";

type Vec3 = [number, number, number];

/** How the guides stand: shown or not, and each line's own change from where the marks put it, mm. */
export type GuideSet = {
  show: boolean;
  /** The midline moved towards the patient's left (+) or right (-). */
  midline: number;
  /** The incisal curve moved incisally (+: longer teeth) or gingivally (-). */
  incisal: number;
  /** How far the incisal curve has fallen away gingivally at the canine tips; null: as the canine tips were marked. */
  arc: number | null;
  /** Build 333: the incisal curve moved labially (+) or palatally (-) from the arch through the marked contacts. */
  labial?: number;
  /**
   * Build 332 (Rakesh: "we do need to have the individual ... curve lines to be able to hide and show each
   * separately"): the lines - and the teeth's measurements - put out of view one by one, the rest still shown.
   */
  hide?: Partial<Record<GuidePart, boolean>>;
};
export type GuidePart = "midline" | "incisal" | "caliper";
export const GUIDE_DEFAULTS: GuideSet = { show: true, midline: 0, incisal: 0, arc: null };
export const GUIDE_RANGES = { midline: [-4, 4], incisal: [-6, 6], arc: [-6, 12], labial: [-4, 4] } as const;
/** How far the midline runs past the incisal edge and past the gum line, mm. */
const MIDLINE_PAST = 2.5;
/** The crown length taken where no gum mark says, mm. */
const CROWN_GUESS = 10.5;

export type GuideAnchors = { midline: Vec3; canines: [Vec3, Vec3]; up: Vec3; out: Vec3; contacts?: Vec3[]; gum?: Array<Vec3 | null> };
/** The frame the guides are laid in: the marked midline; across towards the patient's left; up towards the incisal. */
export type GuideFrame = { origin: Vec3; across: Vec3; up: Vec3 };
export type GuideLine = { key: "midline" | "incisal"; points: Vec3[] };

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const unit = (a: Vec3): Vec3 | null => { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : null; };

/** The guides' frame from the set's anchors (null when the canine tips do not say which way is across). */
export function guideFrame(anchors: GuideAnchors): GuideFrame | null {
  let up = unit(anchors.up);
  if (!up) return null;
  // Towards the incisal: away from the gum marks, where there are any.
  const gums = (anchors.gum ?? []).filter(Boolean) as Vec3[];
  if (gums.length) { let s = 0; for (const g of gums) s += dot(sub(g, anchors.midline), up); if (s > 0) up = [-up[0], -up[1], -up[2]]; }
  const span = sub(anchors.canines[1], anchors.canines[0]);
  const across = unit(add(span, up, -dot(span, up)));
  return across ? { origin: anchors.midline, across, up } : null;
}

/** A smooth run through points (Catmull-Rom), `per` steps between each pair. */
function smooth(points: Vec3[], per = 6): Vec3[] {
  if (points.length < 3) return points.slice();
  const out: Vec3[] = [];
  for (let i = 0; i + 1 < points.length; i += 1) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    for (let k = 0; k < per; k += 1) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((a) => 0.5 * (2 * p1[a] + (p2[a] - p0[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (3 * p1[a] - p0[a] - 3 * p2[a] + p3[a]) * t3)) as Vec3);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/** How far the canine tips, as marked, stand gingival of the midline's edge level (the incisal curve's own depth), mm. */
export function markedArc(anchors: GuideAnchors): number {
  const frame = guideFrame(anchors);
  if (!frame) return 0;
  return -(dot(sub(anchors.canines[0], frame.origin), frame.up) + dot(sub(anchors.canines[1], frame.origin), frame.up)) / 2;
}

/** The guide lines as runs of points in the scene (a line that cannot be laid is left out). */
export function guideLines(anchors: GuideAnchors, set: GuideSet): GuideLine[] {
  const frame = guideFrame(anchors);
  if (!frame) return [];
  const { origin, across, up } = frame;
  const level = (p: Vec3) => dot(sub(p, origin), up), side = (p: Vec3) => dot(sub(p, origin), across);
  /** A point brought to a level along up. */
  const atLevel = (p: Vec3, h: number) => add(p, up, h - level(p));
  const out: GuideLine[] = [];
  const hidden = (key: GuidePart) => set.hide?.[key] === true;
  const gumLevels = (anchors.gum ?? []).filter(Boolean).map((g) => level(g as Vec3));
  const neck = gumLevels.length ? gumLevels.reduce((a, b) => a + b, 0) / gumLevels.length : -CROWN_GUESS;
  /** Level with the arch (no part along up), as a unit vector. */
  const flat = (a: Vec3): Vec3 | null => unit(add(a, up, -dot(a, up)));
  const labial = flat(anchors.out) ?? [0, 0, 0], shift = set.labial ?? 0;

  // The midline: upright, from past the edge to past the gum line.
  if (!hidden("midline")) {
    const base = add(add(origin, across, set.midline), labial, shift);
    out.push({ key: "midline", points: [add(base, up, MIDLINE_PAST), add(base, up, neck - MIDLINE_PAST)] });
  }

  // The incisal curve: round the even arch through the marked contacts, level at the midline, fallen away by `arc` at the canine tips.
  const half = (Math.abs(side(anchors.canines[0])) + Math.abs(side(anchors.canines[1]))) / 2;
  if (!hidden("incisal") && half > 1) {
    const arc = set.arc ?? markedArc(anchors);
    const marked = anchors.contacts?.length === 7 ? idealArch(anchors.contacts, anchors.up, anchors.out) : [anchors.canines[0], anchors.midline, anchors.canines[1]];
    const run = smooth(marked);
    const points = run.map((p, i) => {
      // Out of the arch here: square to the way the curve runs, on the labial side.
      const along = sub(run[Math.min(run.length - 1, i + 1)], run[Math.max(0, i - 1)]);
      let way = flat([along[1] * up[2] - along[2] * up[1], along[2] * up[0] - along[0] * up[2], along[0] * up[1] - along[1] * up[0]]) ?? labial;
      if (dot(way, labial) < 0) way = [-way[0], -way[1], -way[2]];
      return add(atLevel(p, set.incisal - arc * (side(p) / half) ** 2), way, shift);
    });
    out.push({ key: "incisal", points });
  }
  return out;
}

export type Caliper = {
  /** Mesio-distal width at the tooth's widest, and length from its incisal edge to its gum mark (or its own end), mm. */
  width: number; length: number;
  /** Width over length, %. */
  ratio: number;
  /** In the scene: the widest span's two ends, the edge and the neck the length was taken between, and where a label goes (past the edge). */
  span: [Vec3, Vec3]; edge: Vec3; neck: Vec3; label: Vec3;
};
type Frame = { origin: ArrayLike<number>; mesial: ArrayLike<number>; up: ArrayLike<number>; out: ArrayLike<number> };

/**
 * A tooth measured as with a caliper: its triangles (scene) read along its own frame - mesial for the width, up
 * (towards the incisal) for the length. With a gum mark the length is the crown's, from the edge to the mark's
 * level, and only what stands incisal of the mark is measured for width (the tooth is laid a little under the gum).
 */
export function toothCaliper(tris: ArrayLike<number>, frame: Frame, gum?: Vec3 | null): Caliper | null {
  const o = [frame.origin[0], frame.origin[1], frame.origin[2]] as Vec3, m = [frame.mesial[0], frame.mesial[1], frame.mesial[2]] as Vec3, u = [frame.up[0], frame.up[1], frame.up[2]] as Vec3, f = [frame.out[0], frame.out[1], frame.out[2]] as Vec3;
  let top = -Infinity, bottom = Infinity;
  for (let i = 0; i + 2 < tris.length; i += 3) {
    const h = (tris[i] - o[0]) * u[0] + (tris[i + 1] - o[1]) * u[1] + (tris[i + 2] - o[2]) * u[2];
    if (h > top) top = h;
    if (h < bottom) bottom = h;
  }
  if (!Number.isFinite(top)) return null;
  const marked = gum ? dot(sub(gum, o), u) : null;
  // A mark that is not on this tooth (above its edge, or far past its end) is not used.
  const floor = marked !== null && marked < top - 1 && marked > bottom - 3 ? marked : bottom;
  let lo = Infinity, hi = -Infinity, loH = 0, hiH = 0, front = -Infinity;
  for (let i = 0; i + 2 < tris.length; i += 3) {
    const dx = tris[i] - o[0], dy = tris[i + 1] - o[1], dz = tris[i + 2] - o[2];
    const h = dx * u[0] + dy * u[1] + dz * u[2];
    if (h < floor) continue;
    const a = dx * m[0] + dy * m[1] + dz * m[2], d = dx * f[0] + dy * f[1] + dz * f[2];
    if (a < lo) { lo = a; loH = h; }
    if (a > hi) { hi = a; hiH = h; }
    if (d > front) front = d;
  }
  if (!(hi > lo) || !(top > floor)) return null;
  const width = hi - lo, length = top - floor, at = (a: number, h: number): Vec3 => add(add(add(o, m, a), u, h), f, front);
  const mid = (lo + hi) / 2, wide = (loH + hiH) / 2;
  return { width, length, ratio: (width / length) * 100, span: [at(lo, wide), at(hi, wide)], edge: at(mid, top), neck: at(mid, floor), label: at(mid, top + 1.6) };
}
