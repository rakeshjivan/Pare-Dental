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
 * Build 334 (Rakesh: "our current line is also slightly V shaped and we are looking for a smooth curve"; continued,
 * it should run on "along the buccal cusp tips"; the canine tips cannot set it - "there are times where there is no
 * canine tip or the canines are out of line"): seen from the occlusal the incisal curve is one smooth arch,
 * y = a - D (|x| / W)^p, fitted to all seven contacts together (no one tooth sets it), with its width (W) and its
 * shape (p: tapered, ovoid, square) on sliders - and it is drawn on past the canines, fainter, so it can be seen to
 * run along the back teeth's buccal cusps.
 *
 * All in the scene's coordinates (as the set's anchors are).
 */
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
  /** Build 334: the arch made wider (+) or narrower (-) at the canines' distal contacts, each side, mm. */
  width?: number;
  /** Build 334: the arch's shape seen from the occlusal - the power its sides fall back by: 2 ovoid (a parabola), less tapered, more square. */
  shape?: number;
  /**
   * Build 332 (Rakesh: "we do need to have the individual ... curve lines to be able to hide and show each
   * separately"): the lines - and the teeth's measurements - put out of view one by one, the rest still shown.
   */
  hide?: Partial<Record<GuidePart, boolean>>;
};
export type GuidePart = "midline" | "incisal" | "caliper";
export const GUIDE_DEFAULTS: GuideSet = { show: true, midline: 0, incisal: 0, arc: null };
export const GUIDE_RANGES = { midline: [-4, 4], incisal: [-6, 6], arc: [-6, 12], labial: [-4, 4], width: [-6, 6], shape: [1.5, 4] } as const;
/** The arch's shape where none is set: a parabola. */
export const ARCH_SHAPE = 2;
/** How far past the canines' distal contacts the incisal curve is drawn on, as a share of the arch's half width. */
const ARCH_ON = 0.75;
/** A contact palatal of the arch (a tooth tucked behind) counts this much in fitting it. */
const ARCH_INSIDE = 0.1;
/** How far the midline runs past the incisal edge and past the gum line, mm. */
const MIDLINE_PAST = 2.5;
/** The crown length taken where no gum mark says, mm. */
const CROWN_GUESS = 10.5;

export type GuideAnchors = { midline: Vec3; canines: [Vec3, Vec3]; up: Vec3; out: Vec3; contacts?: Vec3[]; gum?: Array<Vec3 | null> };
/** The frame the guides are laid in: the marked midline; across towards the patient's left; up towards the incisal. */
export type GuideFrame = { origin: Vec3; across: Vec3; up: Vec3 };
export type GuideLine = { key: "midline" | "incisal"; points: Vec3[]; /** Build 334: a part of the line drawn fainter (the incisal curve carried on past the canines), and which. */ more?: "right" | "left" };

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

  // The incisal curve: one smooth arch through the marked contacts, level at the midline, fallen away by `arc` at the canine tips.
  const half = (Math.abs(side(anchors.canines[0])) + Math.abs(side(anchors.canines[1]))) / 2;
  const forward = flat([up[1] * across[2] - up[2] * across[1], up[2] * across[0] - up[0] * across[2], up[0] * across[1] - up[1] * across[0]]);
  if (!hidden("incisal") && half > 1 && forward) {
    const ahead: Vec3 = dot(forward, labial) < 0 ? [-forward[0], -forward[1], -forward[2]] : forward;
    const arc = set.arc ?? markedArc(anchors);
    const marked = anchors.contacts?.length === 7 ? anchors.contacts : [anchors.canines[0], anchors.midline, anchors.canines[1]];
    const xs = marked.map(side), ys = marked.map((p) => dot(sub(p, origin), ahead));
    // y = a + b x^2 through them all, by least squares - a contact palatal of the arch counting little (as lib/waxSmileSet idealArch).
    let a = 0, b = 0;
    const weight = marked.map(() => 1);
    for (let round = 0; round < 8; round += 1) {
      let s0 = 0, s2 = 0, s4 = 0, t0 = 0, t2 = 0;
      xs.forEach((x, i) => { const w = weight[i], q = x * x; s0 += w; s2 += w * q; s4 += w * q * q; t0 += w * ys[i]; t2 += w * q * ys[i]; });
      const det = s0 * s4 - s2 * s2;
      if (Math.abs(det) < 1e-9) break;
      a = (t0 * s4 - t2 * s2) / det; b = (s0 * t2 - s2 * t0) / det;
      xs.forEach((x, i) => { weight[i] = ys[i] - (a + b * x * x) >= -0.05 ? 1 : ARCH_INSIDE; });
    }
    const ends = (Math.abs(xs[0]) + Math.abs(xs[xs.length - 1])) / 2;
    if (ends > 1 && b < 0) {
      // The arch: as deep at the ends as the fit, its ends moved apart by `width`, its sides falling back by the power `shape`.
      const deep = -b * ends * ends, wide = Math.max(4, ends + (set.width ?? 0)), power = set.shape ?? ARCH_SHAPE;
      const at = (x: number): Vec3 => add(add(origin, across, x), ahead, a - deep * (Math.abs(x) / wide) ** power);
      const run = (from: number, to: number): Vec3[] => {
        const n = Math.max(2, Math.ceil(Math.abs(to - from) / 0.5)), list: Vec3[] = [];
        for (let k = 0; k <= n; k += 1) {
          const x = from + ((to - from) * k) / n, here = at(x), along = sub(at(x + 0.05), at(x - 0.05));
          // Out of the arch here: square to the way the curve runs, on the labial side.
          let way = flat([along[1] * up[2] - along[2] * up[1], along[2] * up[0] - along[0] * up[2], along[0] * up[1] - along[1] * up[0]]) ?? ahead;
          if (dot(way, ahead) < 0) way = [-way[0], -way[1], -way[2]];
          list.push(add(atLevel(here, set.incisal - arc * (x / half) ** 2), way, shift));
        }
        return list;
      };
      out.push({ key: "incisal", points: run(-wide, wide) });
      out.push({ key: "incisal", more: "right", points: run(-wide * (1 + ARCH_ON), -wide) });
      out.push({ key: "incisal", more: "left", points: run(wide, wide * (1 + ARCH_ON)) });
    }
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
