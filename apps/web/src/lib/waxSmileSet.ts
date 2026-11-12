/**
 * Build 277 (Rakesh, Wax-up Studio roadmap phase 2): the six front teeth set out together on one arch
 * curve from a few whole-set controls, in the order a dentist decides them - the centrals' incisal edge,
 * the midline and cant, the central's width and width/length, the laterals' and canines' proportion
 * (RED), the smile arc, labial fullness. Every tooth's pose is worked out afresh from its rest pose
 * (the library tooth as dropped) each time, never added up, so a control can always go back, both sides
 * stay mirror images, and neighbours stay in contact (each tooth's mesial contact on its neighbour's
 * distal one along the curve).
 *
 * The anchors are the scan's midline at the centrals' incisal edges and the two canine tips (the
 * dentist confirms them). The curve is a parabola symmetric about the midline through the canines,
 * with its depth scaled by `curve` and moved labially by `fullness`.
 *
 * Pure geometry: no scene, no editor. Each tooth gets one matrix (rest pose -> designed pose), which
 * scales it in its own frame (width along the arch about its middle, length from its incisal edge
 * towards the cervical) and moves and turns it onto the curve.
 */
import * as THREE from "three";
import { NATURAL_WIDTHS, type ToothFrame, type ToothKind } from "@/lib/dentalWaxup";

type Vec3 = [number, number, number];

/** One front tooth at rest (as dropped): its frame (incisal middle; out, mesial, up), width along the arch and length, mm. */
export type SetTooth = {
  id: string; fdi: number; kind: ToothKind; frame: ToothFrame; width: number; length: number;
  /**
   * Build 286: the tooth's labial face at rest - how far behind its most labial point the face stands at each
   * FACE_STEP from the incisal edge towards the neck, over the middle of its width (mm, 0 or less; restFrames).
   */
  face?: number[];
};
/** The step of a tooth's labial face profile down its length, mm. */
export const FACE_STEP = 0.5;
/** How far a tooth's labial face has fallen back at its mesial and distal ends, against its middle, mm. */
export const SET_SIDE_FALL = 1;
/** The most a tooth's neck is turned labially (about its incisal edge) to cover the patient's crown, degrees. */
export const SET_TORQUE_MAX = 10;

/**
 * Where the set goes: the midline at the incisal edges, the two canine tips, and the occlusal direction
 * (towards the incisal edges) and labial direction. `labial`: the patient's most labial points across the
 * front teeth (labialProfile), so the set is laid clear of them - a wax-up only adds.
 */
export type SetAnchors = {
  midline: Vec3; canines: [Vec3, Vec3]; up: Vec3; out: Vec3; labial?: Vec3[];
  /**
   * Build 278 (Rakesh, step 2): the seven contacts the dentist marked (lib/waxArchMarks, from the patient's
   * right: 13 distal, 13/12, 12/11, 11/21, 21/22, 22/23, 23 distal - or the lower's). With them each tooth
   * is laid between its two contacts: its width theirs, its length the library's.
   */
  contacts?: Vec3[];
  /**
   * Build 310: the middle of each front tooth's labial gingival margin (from the patient's right; null where there
   * is none) - marked by the dentist, or read on the scan. A tooth with one stands on it: its neck there (the tooth
   * tipped and torqued about its incisal edge to reach it), its length from there to its edge.
   */
  gum?: Array<Vec3 | null>;
  /** Build 310: the gum marks as the dentist left them when the set was laid (to tell when they have been moved). */
  gumMarked?: Array<Vec3 | null>;
  /**
   * Build 286: the patient's centrals as they stand - incisal edge to gingival margin, mm (crownLength). With
   * it the set starts at a central of the usual proportion (its width over `ratio`) where the patient's is
   * shorter than that - worn teeth are lengthened from the start, as a lab does.
   */
  crown?: number;
  /**
   * Build 286: each front tooth's gingival margin on the labial face, as a level along `up` (crownMargins; from
   * the patient's right, null where it cannot be read). With it a tooth is made as long as from its margin to
   * its designed edge - lengthened from the gum line, not slid down off it.
   */
  margins?: Array<number | null>;
};

/** The least wax over the patient's labial surface where the set starts (fullness 0), mm. */
export const SET_CLEAR = 0.3;

/** How far a tooth's length may be taken from the library's to reach from the gum line to its edge (times). */
export const SET_STRETCH = [0.85, 1.6] as const;
/** How far past the gingival margin a tooth's cervical end reaches, mm (so no step shows at the gum line). */
export const SET_BURY = 1;
/** The most the set starts longer than the patient's centrals from their proportion alone, mm. */
export const SET_LENGTHEN_MAX = 4;

export type SetControls = {
  /** The centrals' incisal edge from the anchor, mm (+ longer). */
  length: number;
  /** The midline moved towards the patient's left, mm. */
  midline: number;
  /** The incisal plane turned about the midline (frontal plane), degrees (+ the patient's left side towards the gum). */
  cant: number;
  /** The central's width, mm; null fits the six teeth between the canine tips. */
  centralWidth: number | null;
  /** The central's width over its length. */
  ratio: number;
  /** Apparent (frontal) width of each tooth over the one mesial to it - lateral/central, canine/lateral. */
  red: number;
  /** The laterals' edges short of the centrals', mm. */
  lateralStep: number;
  /** The canine tips short of the centrals' edges, mm (the smile arc). */
  arc: number;
  /** The whole curve moved labially, mm. */
  fullness: number;
  /** The curve's depth, 1 = through the canine tips. */
  curve: number;
};

export const SET_DEFAULTS: SetControls = { length: 0, midline: 0, cant: 0, centralWidth: null, ratio: 0.78, red: 0.7, lateralStep: 0.5, arc: 1, fullness: 0, curve: 1 };

/** The ranges the controls offer (and clamp to). */
export const SET_RANGES = {
  length: [-3, 6], midline: [-3, 3], cant: [-5, 5], centralWidth: [6.5, 10.5], ratio: [0.7, 0.9], red: [0.6, 0.85],
  lateralStep: [0, 1.5], arc: [0, 2.5], fullness: [-1, 2], curve: [0.6, 1.5],
} as const satisfies Record<keyof SetControls, readonly [number, number]>;

/** The result: a matrix per tooth (rest -> designed), and what the design measures. */
export type SetLayout = {
  matrices: Map<string, THREE.Matrix4>;
  /** The central's width and length as designed, and each tooth's apparent width, mm. */
  centralWidth: number;
  centralLength: number;
  apparent: Map<string, number>;
  /** Gap (+) or overlap (-) between each pair of neighbours along the curve, mm; 0 when laid in contact. */
  contacts: Array<{ mesial: string; distal: string; gap: number }>;
};

const v = (a: Vec3) => new THREE.Vector3(a[0], a[1], a[2]);
const clamp = (x: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, x));
/** The canine's cusp tip along its width from the mesial end. */
export const CANINE_TIP = 0.45;
const position = (kind: ToothKind) => (kind === "central" ? 1 : kind === "lateral" ? 2 : 3);

/** The controls kept in their ranges. */
export function clampControls(c: SetControls): SetControls {
  const r = SET_RANGES;
  return {
    length: clamp(c.length, r.length), midline: clamp(c.midline, r.midline), cant: clamp(c.cant, r.cant),
    centralWidth: c.centralWidth === null ? null : clamp(c.centralWidth, r.centralWidth), ratio: clamp(c.ratio, r.ratio),
    red: clamp(c.red, r.red), lateralStep: clamp(c.lateralStep, r.lateralStep), arc: clamp(c.arc, r.arc),
    fullness: clamp(c.fullness, r.fullness), curve: clamp(c.curve, r.curve),
  };
}

/**
 * The arch plane from the anchors: origin at the midline, `across` towards the patient's left (from where
 * the left-quadrant teeth stand, else the second canine), `forward` labial, `normal` incisal. Not
 * necessarily right-handed: on an upper arch the incisal direction points down the face.
 */
function archPlane(a: SetAnchors, towardsLeft: THREE.Vector3 | null) {
  const normal = v(a.up).normalize();
  const [c0, c1] = a.canines.map(v);
  const across = c1.clone().sub(c0);
  across.addScaledVector(normal, -across.dot(normal));
  if (across.length() < 1e-6) return null;
  across.normalize();
  if (towardsLeft && across.dot(towardsLeft) < 0) across.negate();
  const forward = v(a.out).addScaledVector(normal, -v(a.out).dot(normal));
  forward.addScaledVector(across, -forward.dot(across));
  if (forward.length() < 1e-6) return null;
  forward.normalize();
  const mid = v(a.midline);
  // Canine tips in the plane: x across, y forward (from the midline). Depth k of y = -k x^2 through them.
  const planar = [c0, c1].map((c) => { const d = c.clone().sub(mid); return { x: d.dot(across), y: d.dot(forward) }; });
  const k = planar.reduce((sum, p) => sum + Math.max(0, -p.y) / Math.max(1, p.x * p.x), 0) / 2;
  const halfSpan = (Math.abs(planar[0].x) + Math.abs(planar[1].x)) / 2;
  return { mid, normal, across, forward, k: Math.max(0.004, k), halfSpan };
}

/** Walk along y = -k x^2 from x0 by chord length `w` (x grows away from the midline). */
function chordStep(k: number, x0: number, w: number) {
  const y = (x: number) => -k * x * x;
  let lo = x0, hi = x0 + w;
  for (let n = 0; n < 40; n += 1) {
    const m = (lo + hi) / 2;
    if (Math.hypot(m - x0, y(m) - y(x0)) < w) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

/** The widths along the arch and where each tooth's mesial and distal ends fall (x), for central width W. */
function laySide(k: number, W: number, red: number, natural: Record<1 | 2 | 3, number>) {
  // True widths start from the natural proportions (Magne), then are trimmed so the apparent widths keep the RED.
  const widths: Record<1 | 2 | 3, number> = { 1: W, 2: W * (natural[2] / natural[1]), 3: W * (natural[3] / natural[1]) };
  let ends: number[] = [];
  for (let round = 0; round < 8; round += 1) {
    ends = [0];
    for (const p of [1, 2, 3] as const) ends.push(chordStep(k, ends[ends.length - 1], widths[p]));
    const apparent = [1, 2, 3].map((p) => ends[p] - ends[p - 1]);
    // Lateral and canine true widths scaled towards the apparent proportion wanted, within 25% of natural.
    for (const p of [2, 3] as const) {
      const want = apparent[p - 2] * red;
      const scaled = widths[p] * (want / Math.max(0.1, apparent[p - 1]));
      const nat = W * (natural[p] / natural[1]);
      widths[p] = Math.min(nat * 1.25, Math.max(nat * 0.75, scaled));
    }
  }
  ends = [0];
  for (const p of [1, 2, 3] as const) ends.push(chordStep(k, ends[ends.length - 1], widths[p]));
  return { widths, ends };
}

/**
 * Lay the front teeth (13 to 23, any of them) out from the anchors and controls. Returns null when the
 * anchors give no arch (the canines on top of each other).
 */
export function layoutSmileSet(teeth: SetTooth[], anchors: SetAnchors, controls: SetControls, extra?: Map<string, { mesial: number; distal: number }>): SetLayout | null {
  const c = clampControls(controls);
  if (anchors.contacts?.length === 7) return layoutFromMarks(teeth, anchors, c, extra);
  // Which way is the patient's left: from the left-quadrant teeth (FDI 2x, 3x) against the right ones, as they stand at rest.
  const isLeft = (fdi: number) => { const q = Math.floor(fdi / 10); return q === 2 || q === 3; };
  const mean = (list: SetTooth[]) => list.reduce((sum, t) => sum.add(v(t.frame.origin)), new THREE.Vector3()).divideScalar(Math.max(1, list.length));
  const lefts = teeth.filter((t) => isLeft(t.fdi)), rights = teeth.filter((t) => !isLeft(t.fdi));
  const towardsLeft = lefts.length && rights.length ? mean(lefts).sub(mean(rights)) : null;
  const plane = archPlane(anchors, towardsLeft);
  if (!plane) return null;
  const k = plane.k * c.curve;
  const natural: Record<1 | 2 | 3, number> = { 1: NATURAL_WIDTHS.central, 2: NATURAL_WIDTHS.lateral, 3: NATURAL_WIDTHS.canine };
  // Central width: given, or found so the canine's cusp tip (CANINE_TIP of its width from its mesial end)
  // falls on the canine tips' span.
  let W = c.centralWidth ?? 8.5;
  if (c.centralWidth === null) {
    let lo = 6.5, hi = 10.5;
    for (let n = 0; n < 40; n += 1) {
      const m = (lo + hi) / 2;
      const { ends, widths } = laySide(k, m, c.red, natural);
      const tip = chordStep(k, ends[2], widths[3] * CANINE_TIP);
      if (tip < plane.halfSpan) lo = m; else hi = m;
    }
    W = (lo + hi) / 2;
  }
  const { widths, ends } = laySide(k, W, c.red, natural);
  // Clear of the patient's teeth: the curve moved labially until it stands SET_CLEAR in front of the most
  // labial point of the patient's crowns everywhere across the six teeth; fullness is added on top of that.
  let clear = 0;
  const reach = ends[3] + 1;
  for (const point of anchors.labial ?? []) {
    const d = v(point).sub(plane.mid);
    const x = Math.abs(d.dot(plane.across) - c.midline);
    if (x > reach) continue;
    clear = Math.max(clear, d.dot(plane.forward) + SET_CLEAR + k * x * x);
  }
  const L = W / c.ratio;
  const centralRest = teeth.find((t) => t.kind === "central");
  const lengthScale = centralRest ? L / Math.max(1, centralRest.length) : 1;
  const heights: Record<1 | 2 | 3, number> = { 1: c.length, 2: c.length - c.lateralStep, 3: c.length - c.arc };
  // Cant: the patient's left side turned towards the gum (against the incisal direction) for plus, either arch.
  const cantAxis = new THREE.Vector3().crossVectors(plane.normal, plane.across).normalize();
  const cant = new THREE.Matrix4().makeTranslation(plane.mid.x, plane.mid.y, plane.mid.z)
    .multiply(new THREE.Matrix4().makeRotationAxis(cantAxis, (c.cant * Math.PI) / 180))
    .multiply(new THREE.Matrix4().makeTranslation(-plane.mid.x, -plane.mid.y, -plane.mid.z));
  const matrices = new Map<string, THREE.Matrix4>();
  const apparent = new Map<string, number>();
  // Build 277 (phase 3): a tooth widened on its own (mesial, distal, mm) pushes its neighbours along the
  // curve, each side on its own, so the contacts stay closed. Where each tooth's own chord starts and ends.
  const step = (x: number, w: number) => (w >= 0 ? chordStep(k, x, w) : x + w);
  const chords = new Map<string, [number, number]>();
  for (const left of [false, true]) {
    let at = 0;
    for (const p of [1, 2, 3] as const) {
      const tooth = teeth.find((t) => isLeft(t.fdi) === left && position(t.kind) === p);
      const more = tooth ? extra?.get(tooth.id) : undefined;
      const start = step(at, more?.mesial ?? 0);
      const end = chordStep(k, start, widths[p]);
      if (tooth) chords.set(tooth.id, [start, end]);
      at = step(end, more?.distal ?? 0);
    }
  }
  for (const tooth of teeth) {
    const p = position(tooth.kind) as 1 | 2 | 3;
    if (p > 3) continue;
    // FDI quadrants 2 and 3 are the patient's left: +across.
    const s = isLeft(tooth.fdi) ? 1 : -1;
    const [x0, x1] = chords.get(tooth.id) ?? [ends[p - 1], ends[p]];
    const y = (x: number) => -k * x * x + clear + c.fullness;
    // Designed frame: incisal middle on the curve; mesial towards the midline along the chord; up the normal.
    const mesial2 = new THREE.Vector2(s * x0 - s * x1, y(x0) - y(x1)).normalize();
    const mesial = plane.across.clone().multiplyScalar(mesial2.x).addScaledVector(plane.forward, mesial2.y).normalize();
    const up = plane.normal.clone();
    const out = new THREE.Vector3().crossVectors(up, mesial).normalize();
    if (out.dot(plane.forward) < 0) out.negate();
    // The incisal middle halfway along the chord, so its mesial and distal ends lie on the curve (in contact).
    const target = plane.mid.clone().addScaledVector(plane.across, s * (x0 + x1) / 2 + c.midline).addScaledVector(plane.forward, (y(x0) + y(x1)) / 2).addScaledVector(up, heights[p]);
    // Rest frame -> designed frame, with the scale in the tooth's own axes (width about its middle, length from its edge).
    const r = tooth.frame;
    const rest = new THREE.Matrix4().makeBasis(v(r.mesial).normalize(), v(r.out).normalize(), v(r.up).normalize()).setPosition(v(r.origin));
    const designed = new THREE.Matrix4().makeBasis(mesial, out, up).setPosition(target);
    const scale = new THREE.Matrix4().makeScale(widths[p] / Math.max(1, tooth.width), 1, lengthScale);
    const m = cant.clone().multiply(designed).multiply(scale).multiply(rest.clone().invert());
    matrices.set(tooth.id, m);
    apparent.set(tooth.id, x1 - x0);
  }
  // Neighbours: laid end to end along the curve, so in contact by construction; reported for the readout.
  const contacts: SetLayout["contacts"] = [];
  const byFdi = new Map(teeth.map((t) => [t.fdi, t.id]));
  for (const q of [1, 2]) for (const n of [1, 2]) {
    const a = byFdi.get(q * 10 + n), b = byFdi.get(q * 10 + n + 1);
    if (a && b) contacts.push({ mesial: a, distal: b, gap: 0 });
  }
  const r11 = byFdi.get(11), r21 = byFdi.get(21);
  if (r11 && r21) contacts.push({ mesial: r11, distal: r21, gap: 0 });
  return { matrices, centralWidth: W, centralLength: L, apparent, contacts };
}

/**
 * The affine move (least squares) that takes a soup's corners to where they stand in another soup of the
 * same triangles, and how far the worst corner misses it (mm). A tooth moved, turned or sized on its own
 * after the set was laid is such a move; a tooth sculpted is not (its miss is large). Null when the soups
 * do not match or are degenerate.
 */
export function affineBetween(before: ArrayLike<number>, after: ArrayLike<number>): { matrix: THREE.Matrix4; miss: number } | null {
  if (before.length !== after.length || before.length < 12) return null;
  const n = before.length / 3;
  // Normal equations: (X^T X) a_k = X^T y_k, X rows [x y z 1], centred for conditioning.
  const c = [0, 0, 0];
  for (let i = 0; i < n; i += 1) for (let k = 0; k < 3; k += 1) c[k] += before[i * 3 + k] / n;
  const xtx = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  const xty = Array.from({ length: 3 }, () => [0, 0, 0, 0]);
  for (let i = 0; i < n; i += 1) {
    const row = [before[i * 3] - c[0], before[i * 3 + 1] - c[1], before[i * 3 + 2] - c[2], 1];
    for (let a = 0; a < 4; a += 1) {
      for (let b = 0; b < 4; b += 1) xtx[a][b] += row[a] * row[b];
      for (let k = 0; k < 3; k += 1) xty[k][a] += row[a] * after[i * 3 + k];
    }
  }
  const M = new THREE.Matrix4().fromArray(xtx.flat()); // symmetric, so the column-major read is the same matrix
  if (Math.abs(M.determinant()) < 1e-9) return null;
  const inv = M.clone().invert().elements; // column-major
  const solve = (y: number[]) => [0, 1, 2, 3].map((r) => [0, 1, 2, 3].reduce((s, col) => s + inv[col * 4 + r] * y[col], 0));
  const rows = [0, 1, 2].map((k) => solve(xty[k]));
  const centred = new THREE.Matrix4().set(rows[0][0], rows[0][1], rows[0][2], rows[0][3], rows[1][0], rows[1][1], rows[1][2], rows[1][3], rows[2][0], rows[2][1], rows[2][2], rows[2][3], 0, 0, 0, 1);
  const matrix = centred.multiply(new THREE.Matrix4().makeTranslation(-c[0], -c[1], -c[2]));
  let miss = 0;
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i += 1) {
    p.set(before[i * 3], before[i * 3 + 1], before[i * 3 + 2]).applyMatrix4(matrix);
    miss = Math.max(miss, Math.hypot(p.x - after[i * 3], p.y - after[i * 3 + 1], p.z - after[i * 3 + 2]));
  }
  return { matrix, miss };
}

/**
 * One arch's set as Wax-up Studio keeps it: the controls, the anchors, each front tooth's rest pose
 * (as dropped, scene coordinates) and the set's last move of it from rest (a matrix, column-major).
 * Whatever else was done to a tooth since (moved on its own) is read back from the tooth itself.
 */
export type SmileRecord = {
  controls: SetControls;
  anchors: SetAnchors;
  rest: Record<number, { frame: ToothFrame; width: number; length: number; face?: number[] }>;
  laid: Record<number, number[]>;
  /** Build 277 (phase 3): each front tooth's own changes (lib/waxToothEdit), by FDI, as last laid. */
  own?: Record<number, import("@/lib/waxToothEdit").ToothEdit>;
  /** Being changed and not yet laid (shown in the panel at once). */
  pending?: Record<number, import("@/lib/waxToothEdit").ToothEdit>;
  /** One tooth's change made on its partner across the midline too (default on). */
  mirror?: boolean;
  /** Build 292: whether a tooth's neighbour gives way when its contact is moved (off: only the tooth itself changes). */
  give?: boolean;
};

/** How far a tooth may have been reshaped (not just moved, turned or sized) and still follow the set, mm. */
export const SCULPTED_MISS = 0.02;

/**
 * Each front tooth's rest frame read from the teeth themselves, as a tooth set has them already turned
 * along its own arch: mesial towards the neighbour mesial to it (the centrals towards each other), in the
 * plane square to `up`; out labial (the side `out` points); the origin the middle of its incisal edge on
 * its labial face; width along mesial and length along up, mm. Teeth by FDI with their soups (scene coordinates).
 */
export function restFrames(teeth: Array<{ fdi: number; soup: ArrayLike<number> }>, up: Vec3, out: Vec3): Map<number, { frame: ToothFrame; width: number; length: number; face: number[] }> {
  const u = v(up).normalize();
  const centroid = (soup: ArrayLike<number>) => {
    const c = new THREE.Vector3();
    const n = Math.max(1, soup.length / 3);
    for (let i = 0; i + 2 < soup.length; i += 3) c.x += soup[i] / n, c.y += soup[i + 1] / n, c.z += soup[i + 2] / n;
    return c;
  };
  const centres = new Map(teeth.map((t) => [t.fdi, centroid(t.soup)]));
  const result = new Map<number, { frame: ToothFrame; width: number; length: number; face: number[] }>();
  for (const tooth of teeth) {
    const q = Math.floor(tooth.fdi / 10), n = tooth.fdi % 10;
    const towards = n === 1 ? centres.get((q === 1 ? 2 : q === 2 ? 1 : q === 3 ? 4 : 3) * 10 + 1) : centres.get(q * 10 + n - 1);
    const c = centres.get(tooth.fdi)!;
    let mesial = towards ? towards.clone().sub(c) : new THREE.Vector3();
    mesial.addScaledVector(u, -mesial.dot(u));
    if (mesial.length() < 1e-6) mesial = new THREE.Vector3().crossVectors(u, v(out)).normalize();
    mesial.normalize();
    const o = new THREE.Vector3().crossVectors(u, mesial).normalize();
    if (o.dot(v(out)) < 0) o.negate();
    let lo = Infinity, hi = -Infinity, top = -Infinity, bottom = Infinity, front = -Infinity;
    const p = new THREE.Vector3();
    for (let i = 0; i + 2 < tooth.soup.length; i += 3) {
      p.set(tooth.soup[i], tooth.soup[i + 1], tooth.soup[i + 2]).sub(c);
      const a = p.dot(mesial), b = p.dot(u), f = p.dot(o);
      lo = Math.min(lo, a); hi = Math.max(hi, a); top = Math.max(top, b); bottom = Math.min(bottom, b); front = Math.max(front, f);
    }
    if (!Number.isFinite(lo)) continue;
    const origin = c.clone().addScaledVector(mesial, (lo + hi) / 2).addScaledVector(u, top).addScaledVector(o, front);
    // The labial face down the tooth: the most labial corner at each height, over the middle of the width.
    const steps = Math.max(1, Math.ceil((top - bottom) / FACE_STEP));
    const face = new Array<number>(steps + 1).fill(-Infinity);
    const middle = (lo + hi) / 2, reach = (hi - lo) * 0.3;
    for (let i = 0; i + 2 < tooth.soup.length; i += 3) {
      p.set(tooth.soup[i], tooth.soup[i + 1], tooth.soup[i + 2]).sub(c);
      if (Math.abs(p.dot(mesial) - middle) > reach) continue;
      const k = Math.round((top - p.dot(u)) / FACE_STEP);
      if (k >= 0 && k <= steps) face[k] = Math.max(face[k], p.dot(o) - front);
    }
    for (let k = 0, last = -1; k <= steps; k += 1) {
      if (!Number.isFinite(face[k])) continue;
      for (let j = last + 1; j < k; j += 1) face[j] = last < 0 ? face[k] : face[last] + ((face[k] - face[last]) * (j - last)) / (k - last);
      last = k;
      if (k === steps || !face.slice(k + 1).some(Number.isFinite)) for (let j = k + 1; j <= steps; j += 1) face[j] = face[k];
    }
    result.set(tooth.fdi, { frame: { origin: origin.toArray() as Vec3, mesial: mesial.toArray() as Vec3, out: o.toArray() as Vec3, up: u.toArray() as Vec3 }, width: hi - lo, length: top - bottom, face: face.map((x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : 0)) });
  }
  return result;
}

/**
 * The patient's most labial point in each 0.5 mm strip across the front of the arch at each millimetre of height,
 * from the incisal edges to 8 mm gingival of them (scene coordinates) - what the set must stand clear of. `points`: the
 * scan's corners (x, y, z in a row).
 */
export function labialProfile(points: ArrayLike<number>, anchors: Omit<SetAnchors, "labial">): Vec3[] {
  const plane = archPlane(anchors, null);
  if (!plane) return [];
  const strips = new Map<number, { y: number; p: Vec3 }>();
  const p = new THREE.Vector3();
  for (let i = 0; i + 2 < points.length; i += 3) {
    p.set(points[i], points[i + 1], points[i + 2]);
    const d = p.clone().sub(plane.mid);
    const h = d.dot(plane.normal), x = d.dot(plane.across), y = d.dot(plane.forward);
    if (h < -8 || h > 1.5 || Math.abs(x) > plane.halfSpan + 8) continue;
    // Build 286: one for each millimetre of height too, so a tooth's face can be laid against the crown all the way down.
    const key = Math.round(x * 2) * 64 + Math.round(h) + 16;
    const was = strips.get(key);
    if (!was || y > was.y) strips.set(key, { y, p: p.toArray() as Vec3 });
  }
  return [...strips.values()].map((entry) => entry.p);
}

/** The least depth of the crease where crown meets gum, mm (over 2 mm either side). */
const MARGIN_CREASE = 0.1;
/** A crease this deep is taken as the margin at once, mm; and the nearest to the incisal edge it is looked for, mm. */
const MARGIN_CLEAR = 0.15;
const MARGIN_FROM = 4.5;
/** How far a tooth's crown length (as a central's would be) may stand from the middle of the six before it is taken as misread, mm. */
const MARGIN_AGREE = 1.75;

/**
 * Build 286: where each front tooth's gingival margin is on the labial face (`margins`: its level along `up`, from
 * the patient's right; null where it cannot be read), and how long the patient's centrals stand from incisal edge
 * to margin (`crown`: the mean of the two, mm; null if neither can be read). Down a strip 3 mm wide through the
 * middle of each tooth (between its marked contacts), the most labial surface at each height has a crease where
 * the crown meets the gum: the first clear one between 4.5 and 13 mm from the edge. `points`: the scan's corners.
 */
export function crownMargins(points: ArrayLike<number>, anchors: Pick<SetAnchors, "contacts" | "up" | "out">, marked?: ReadonlyArray<Vec3 | null | undefined>): { margins: Array<number | null>; crown: number | null; gum: Array<Vec3 | null> } {
  const contacts = anchors.contacts;
  const margins: Array<number | null> = [null, null, null, null, null, null];
  const gum: Array<Vec3 | null> = [null, null, null, null, null, null];
  if (!contacts || contacts.length < 7) return { margins, crown: null, gum };
  // Build 310: where on the labial face each margin is (its strip's middle, its front at each depth below the edge).
  const strips: Array<{ middle: THREE.Vector3; out: THREE.Vector3; front: Float64Array } | null> = [null, null, null, null, null, null];
  const up = v(anchors.up).normalize();
  const flat = (p: THREE.Vector3) => p.clone().addScaledVector(up, -p.dot(up));
  const STEP = 0.25, REACH = Math.round(2 / STEP), DEEP = Math.round(15 / STEP);
  const centre = flat(contacts.reduce((sum, p) => sum.add(v(p)), new THREE.Vector3()).divideScalar(contacts.length)).addScaledVector(flat(v(anchors.out)).normalize(), -15);
  const central: number[] = [];
  const edges: Array<number | null> = [null, null, null, null, null, null], crowns: Array<number | null> = [null, null, null, null, null, null];
  for (let tooth = 0; tooth < 6; tooth += 1) {
    const chord = flat(v(contacts[tooth + 1])).sub(flat(v(contacts[tooth])));
    if (chord.length() < 3) continue;
    const want = chord.clone().normalize();
    const out = new THREE.Vector3().crossVectors(up, want).normalize();
    const middle = flat(v(contacts[tooth])).add(flat(v(contacts[tooth + 1]))).multiplyScalar(0.5);
    if (out.dot(middle.clone().sub(centre)) < 0) out.negate();
    const base = (v(contacts[tooth]).dot(up) + v(contacts[tooth + 1]).dot(up)) / 2;
    // The strip's corners: how far labial and how high, from the middle of the tooth.
    const strip: number[] = [];
    let edge = -Infinity;
    for (let i = 0; i + 2 < points.length; i += 3) {
      const x = points[i], y = points[i + 1], z = points[i + 2];
      const h = x * up.x + y * up.y + z * up.z;
      if (h < base - 18 || h > base + 8) continue;
      const dx = x - h * up.x - middle.x, dy = y - h * up.y - middle.y, dz = z - h * up.z - middle.z;
      if (Math.abs(dx * want.x + dy * want.y + dz * want.z) > 1.5) continue;
      const f = dx * out.x + dy * out.y + dz * out.z;
      if (f < -7 || f > 5) continue;
      strip.push(f, h);
      if (h > edge) edge = h;
    }
    if (!Number.isFinite(edge)) continue;
    // Build 310: a margin marked by the dentist is the margin; the tooth's edge is still read here (for the crown's length).
    if (marked?.[tooth]) edges[tooth] = edge;
    const front = new Float64Array(DEEP + 1).fill(-Infinity);
    for (let i = 0; i < strip.length; i += 2) {
      const k = Math.round((edge - strip[i + 1]) / STEP);
      if (k >= 0 && k <= DEEP && strip[i] > front[k]) front[k] = strip[i];
    }
    // How deep the crease is at each height (the surface 2 mm either side bridged over it).
    const crease = new Float64Array(DEEP + 1);
    for (let k = REACH; k + REACH <= DEEP; k += 1) {
      const lo = front[k - REACH], hi = front[k + REACH];
      if (Number.isFinite(front[k]) && Number.isFinite(lo) && Number.isFinite(hi)) crease[k] = (lo + hi) / 2 - front[k];
    }
    // The first clear crease going gumwards from the edge (a crown is rounded outwards all the way to its
    // margin; further up the gum has folds of its own, often deeper); failing one, the deepest.
    let best = -1, depth = MARGIN_CREASE;
    const from = Math.round(MARGIN_FROM / STEP), to = Math.min(DEEP - REACH, Math.round(13 / STEP));
    for (let k = from; k <= to && best < 0; k += 1) if (crease[k] >= MARGIN_CLEAR && crease[k] >= crease[k - 1] && crease[k] >= crease[k + 1]) best = k;
    // (Not within 1.5 mm of where the scan stops: its cut edge reads as a crease too.)
    let last = DEEP;
    while (last > 0 && !Number.isFinite(front[last])) last -= 1;
    const end = Math.min(to, last - REACH - Math.round(1.5 / STEP));
    if (best > end) best = -1;
    if (best < 0) for (let k = from; k <= end; k += 1) if (crease[k] > depth) { depth = crease[k]; best = k; }
    if (best < 0) continue;
    edges[tooth] = edge;
    crowns[tooth] = best * STEP;
    strips[tooth] = { middle, out, front };
  }
  // Build 293 (a hard scan: one central read 11.5 mm from edge to gum beside its twin's 4.5, and the set was laid with
  // one tooth towering over a squat one): the six readings checked against each other. Each crown's length as a
  // central's would be (a lateral stands about 0.86 of a central, a canine 0.95); the middle of those is what this
  // mouth's teeth stand; a reading more than MARGIN_AGREE from it is a misreading (a fold in the gum, a scan
  // artefact) and takes the middle one instead.
  const share = [0.95, 0.86, 1, 1, 0.86, 0.95];
  const asCentral = crowns.map((length, tooth) => (length === null ? null : length / share[tooth]));
  const read = asCentral.filter((x): x is number => x !== null).sort((a, b) => a - b);
  // Build 310: the marked ones, as marked - never checked against the others, never replaced.
  const markedCentral: number[] = [];
  for (let tooth = 0; tooth < 6; tooth += 1) {
    const mark = marked?.[tooth];
    if (!mark) continue;
    margins[tooth] = v(mark).dot(up);
    gum[tooth] = [mark[0], mark[1], mark[2]];
    const edge = edges[tooth];
    if ((tooth === 2 || tooth === 3) && edge !== null) markedCentral.push(edge - margins[tooth]!);
  }
  const crownOf = (lengths: number[]) => (lengths.length ? lengths.reduce((sum, x) => sum + x, 0) / lengths.length : null);
  if (!read.length) return { margins, crown: crownOf(markedCentral), gum };
  const middle = read.length % 2 ? read[(read.length - 1) / 2] : (read[read.length / 2 - 1] + read[read.length / 2]) / 2;
  for (let tooth = 0; tooth < 6; tooth += 1) {
    const edge = edges[tooth], length = asCentral[tooth];
    if (marked?.[tooth] || edge === null || length === null) continue;
    const kept = Math.abs(length - middle) > MARGIN_AGREE ? middle : length;
    margins[tooth] = edge - kept * share[tooth];
    if (tooth === 2 || tooth === 3) central.push(kept);
    // Where that is on the scan: the strip's most labial surface at that depth below the edge.
    const strip = strips[tooth];
    if (strip) {
      const k = Math.min(strip.front.length - 1, Math.max(0, Math.round((kept * share[tooth]) / STEP)));
      let f = strip.front[k];
      for (let reach = 1; !Number.isFinite(f) && reach <= 4; reach += 1) f = Number.isFinite(strip.front[k - reach] ?? NaN) ? strip.front[k - reach] : strip.front[k + reach] ?? NaN;
      if (Number.isFinite(f)) { const at = strip.middle.clone().addScaledVector(strip.out, f).addScaledVector(up, margins[tooth]!); gum[tooth] = [at.x, at.y, at.z]; }
    }
  }
  return { margins, crown: crownOf([...central, ...markedCentral]), gum };
}

/** Build 310: the most a tooth is torqued or tipped to bring its neck over its gum mark, degrees. */
export const GUM_TURN_MAX = 30;
/** How much of the way a tooth is tipped along the arch towards its gum mark, and the most, degrees. */
export const GUM_TIP_SHARE = 0.5;
/** How far off its gum mark a tooth's neck may stand before the tooth is turned towards it, mm. */
export const GUM_SLACK = 1;
export const GUM_TIP_MAX = 6;
/** How little a mark lying palatal of the arch counts in finding it, against one on it or labial of it. */
const ARCH_INSIDE = 0.1;

/**
 * Build 309 (Rakesh, of a crowded arch - a lateral tucked behind, a canine standing out: "even though I marked the
 * contacts properly, why did the teeth import like this"): the seven contacts as they would stand on an even arch.
 *
 * Laid from mark to mark, each wax tooth copies the patient's tooth - a lateral tucked behind its neighbours put the
 * wax lateral behind them too, turned as the patient's is: the crowding again, in wax. A wax-up is the arch put
 * right. So: an even arch (a parabola seen from the occlusal) is found through the marks - by those that lie on it
 * or labial of it; one tucked behind hardly counts - and made to pass through the midline mark and the two end
 * marks (the canines' distal contacts, where the wax meets the teeth that stay). The four contacts between are set
 * along it, each tooth given its share of the way round in proportion to its marked width (so where the teeth are
 * crowded each is a little narrower than marked, where they are spaced a little wider - the dentist widens or
 * narrows from there). Each contact keeps the height it was marked at. Marks already on an even arch are left where
 * they are, near enough.
 */
export function idealArch(marks: Vec3[], upIn: Vec3, outIn: Vec3): Vec3[] {
  if (marks.length !== 7) return marks;
  const up = v(upIn).normalize();
  const out = v(outIn).addScaledVector(up, -v(outIn).dot(up)).normalize();
  const across = new THREE.Vector3().crossVectors(up, out).normalize();
  const points = marks.map(v), origin = points[3];
  let xs = points.map((p) => p.clone().sub(origin).dot(across));
  // `across` runs from the first mark to the last.
  if (xs[6] < xs[0]) { across.negate(); xs = xs.map((x) => -x); }
  const ys = points.map((p) => p.clone().sub(origin).dot(out)), zs = points.map((p) => p.dot(up));
  if (!(xs[0] < -2 && xs[6] > 2)) return marks;
  // y = a + b x^2 by weighted least squares, the weights renewed: a mark palatal of the curve counts little.
  let a = 0, b = 0;
  const weight = new Array(7).fill(1);
  for (let round = 0; round < 8; round += 1) {
    let s0 = 0, s2 = 0, s4 = 0, t0 = 0, t2 = 0;
    for (let i = 0; i < 7; i += 1) { const w = weight[i], q = xs[i] * xs[i]; s0 += w; s2 += w * q; s4 += w * q * q; t0 += w * ys[i]; t2 += w * q * ys[i]; }
    const det = s0 * s4 - s2 * s2;
    if (Math.abs(det) < 1e-9) return marks;
    a = (t0 * s4 - t2 * s2) / det; b = (s0 * t2 - s2 * t0) / det;
    for (let i = 0; i < 7; i += 1) weight[i] = ys[i] - (a + b * xs[i] * xs[i]) >= -0.05 ? 1 : ARCH_INSIDE;
  }
  // An arch curves back from the midline; one that does not is no arch to lay teeth on.
  if (!(b < 0)) return marks;
  const result = marks.map((p) => [...p] as Vec3);
  for (const side of [-1, 1] as const) {
    const end = side < 0 ? 0 : 6, span = Math.abs(xs[end]);
    // The curve on this side, made to pass through the midline mark (0, 0) and the end mark.
    const lift0 = -a, liftEnd = ys[end] - (a + b * xs[end] * xs[end]);
    const yAt = (x: number) => a + b * x * x + lift0 + (liftEnd - lift0) * (Math.abs(x) / span);
    const N = 240, along = new Float64Array(N + 1);
    for (let k = 1; k <= N; k += 1) { const x0 = (side * span * (k - 1)) / N, x1 = (side * span * k) / N; along[k] = along[k - 1] + Math.hypot(x1 - x0, yAt(x1) - yAt(x0)); }
    // The three teeth of this side from the midline out, by their marked widths (seen from the occlusal).
    const order = side < 0 ? [3, 2, 1, 0] : [3, 4, 5, 6];
    const widths = [0, 1, 2].map((k) => Math.hypot(xs[order[k + 1]] - xs[order[k]], ys[order[k + 1]] - ys[order[k]]));
    const whole = widths[0] + widths[1] + widths[2];
    if (!(whole > 1)) continue;
    let share = 0;
    for (const k of [0, 1]) {
      share += widths[k] / whole;
      const want = share * along[N];
      let j = 1;
      while (j < N && along[j] < want) j += 1;
      const t = (want - along[j - 1]) / Math.max(1e-9, along[j] - along[j - 1]);
      const x = (side * span * (j - 1 + t)) / N, y = yAt(x), i = order[k + 1];
      const at = origin.clone().addScaledVector(up, -origin.dot(up)).addScaledVector(across, x).addScaledVector(out, y).addScaledVector(up, zs[i]);
      result[i] = [at.x, at.y, at.z];
    }
  }
  return result;
}

/**
 * Build 278 (Rakesh, step 2, revised): the library set fitted to the dentist's marks while keeping its own
 * design - each tooth keeps the set's tip, torque and rotation against its neighbours, and is only turned
 * about the vertical so its mesial and distal ends meet its two marked contacts (seen from the occlusal),
 * sized in width to them (its length the library's). The incisal steps are the set's own: the centrals level
 * with the midline mark (plus `length`; longer from the start where the patient's centrals are short for their
 * width - `crown`), the canines brought to the tips marked, the laterals half as far,
 * so the smile line stays the set's. Each tooth stands SET_CLEAR in front of the patient's labial surface
 * (plus fullness). A tooth widened on its own pushes the teeth distal to it along by as much.
 */
function layoutFromMarks(teeth: SetTooth[], anchors: SetAnchors, c: SetControls, extra?: Map<string, { mesial: number; distal: number }>): SetLayout | null {
  const up = v(anchors.up).normalize();
  const flat = (p: THREE.Vector3) => p.clone().addScaledVector(up, -p.dot(up));
  const mid = v(anchors.midline);
  const level = (p: THREE.Vector3) => p.clone().sub(mid).dot(up);
  const outHint = v(anchors.out).addScaledVector(up, -v(anchors.out).dot(up)).normalize();
  // Build 309: the teeth are laid on an even arch through the marks, not from mark to mark (idealArch).
  const contacts = idealArch(anchors.contacts!, anchors.up, [outHint.x, outHint.y, outHint.z]).map(v);
  const centre = flat(contacts.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(contacts.length)).addScaledVector(outHint, -15);
  const order = (fdi: number) => { const q = Math.floor(fdi / 10), n = fdi % 10; return q === 1 || q === 4 ? 3 - n : 2 + n; };
  const isLeft = (fdi: number) => { const q = Math.floor(fdi / 10); return q === 2 || q === 3; };
  // The set's own incisal levels: each tooth's edge against the centrals' (mean), mm along up.
  const centrals = teeth.filter((t) => position(t.kind) === 1);
  if (!centrals.length) return null;
  const centralLevel = centrals.reduce((sum, t) => sum + v(t.frame.origin).dot(up), 0) / centrals.length;
  // How far each canine must move to stand at its tip mark: carried by the canine fully, the lateral half.
  const canineCorrection = new Map<boolean, number>();
  for (const left of [false, true]) {
    const canine = teeth.find((t) => isLeft(t.fdi) === left && position(t.kind) === 3);
    if (!canine) continue;
    const own = v(canine.frame.origin).dot(up) - centralLevel;
    canineCorrection.set(left, level(v(anchors.canines[left ? 1 : 0])) - own);
  }
  // Build 281 (Rakesh had to take the centrals' edge to its 4 mm limit): where the canine tips marked say the whole
  // set belongs further incisally than the patient's (worn) central edge, the set starts there - its own design
  // kept, the centrals lengthened with it. Never shorter than the patient's centrals: the wax only adds there.
  const corrections = [...canineCorrection.values()];
  const lift = corrections.length ? Math.max(0, corrections.reduce((sum, x) => sum + x, 0) / corrections.length) : 0;
  for (const [left, x] of canineCorrection) canineCorrection.set(left, x - lift);
  // Build 286 (the lab's wax-up of the same scan stood 3 mm longer than ours): a central of the usual proportion.
  // Where the patient's centrals (edge to gingival margin) are shorter than their marked width over `ratio`, the
  // whole set starts longer by the difference - the canines and laterals with it, the set's own smile line kept.
  let proportion = 0;
  if (anchors.crown && contacts.length >= 5) {
    // By the centrals as marked (the patient's own widths), not as shared out along the arch.
    const marked = anchors.contacts!.map(v);
    const centralWide = (flat(marked[2]).distanceTo(flat(marked[3])) + flat(marked[3]).distanceTo(flat(marked[4]))) / 2;
    proportion = Math.min(SET_LENGTHEN_MAX, Math.max(0, centralWide / c.ratio - anchors.crown));
  }
  const longer = Math.max(0, proportion - lift);
  const shiftOf = new Map<string, number>();
  for (const left of [false, true]) {
    let shift = 0;
    for (const p of [1, 2, 3] as const) {
      const tooth = teeth.find((t) => isLeft(t.fdi) === left && position(t.kind) === p);
      if (!tooth) continue;
      const more = extra?.get(tooth.id);
      shiftOf.set(tooth.id, shift + (more?.mesial ?? 0));
      shift += (more?.mesial ?? 0) + (more?.distal ?? 0);
    }
  }
  const matrices = new Map<string, THREE.Matrix4>();
  const apparent = new Map<string, number>();
  let centralWidth = 0, centralLength = 0;
  for (const tooth of teeth) {
    const i = order(tooth.fdi);
    if (i < 0 || i > 5) continue;
    const left = i >= 3;
    const mesialAt = contacts[left ? i : i + 1], distalAt = contacts[left ? i + 1 : i];
    const chord = flat(mesialAt).sub(flat(distalAt));
    const width = chord.length();
    if (width < 1) continue;
    const want = chord.clone().normalize();
    const r = tooth.frame;
    const origin = v(r.origin);
    const libMesial = flat(v(r.mesial)).normalize();
    // Turned about the vertical only, so the set's tip and torque stay.
    const yaw = Math.atan2(new THREE.Vector3().crossVectors(libMesial, want).dot(up), libMesial.dot(want));
    const turn = new THREE.Matrix4().makeRotationAxis(up, yaw);
    // Width along the tooth's own mesial direction, about its incisal middle.
    const k = width / Math.max(1, tooth.width);
    const m = libMesial;
    const widen = new THREE.Matrix4().set(
      1 + (k - 1) * m.x * m.x, (k - 1) * m.x * m.y, (k - 1) * m.x * m.z, 0,
      (k - 1) * m.y * m.x, 1 + (k - 1) * m.y * m.y, (k - 1) * m.y * m.z, 0,
      (k - 1) * m.z * m.x, (k - 1) * m.z * m.y, 1 + (k - 1) * m.z * m.z, 0,
      0, 0, 0, 1,
    );
    let out = new THREE.Vector3().crossVectors(up, want).normalize();
    const middle = flat(mesialAt).add(flat(distalAt)).multiplyScalar(0.5);
    if (out.dot(middle.clone().sub(centre)) < 0) out.negate();
    const p = position(tooth.kind) as 1 | 2 | 3;
    const share = p === 1 ? 0 : p === 2 ? 0.5 : 1;
    const height = origin.dot(up) - centralLevel + lift + longer + c.length + share * (canineCorrection.get(left) ?? 0);
    // Build 286: as long as from the patient's gingival margin to the designed edge - the tooth lengthened (or
    // shortened a little) along its own axis from its incisal edge, so its neck stays at the gum line however
    // far the edge is taken. Within SET_STRETCH of the library's length; the library's where no margin was read.
    const margin = anchors.margins?.[i];
    let stretch = 1;
    if (margin !== null && margin !== undefined && tooth.length > 1) {
      const axis = v(r.up).normalize();
      // The edge's level less the margin's is the length along `up`; along the tooth's own (tipped) axis it is a little more.
      const upright = Math.max(0.5, Math.abs(axis.dot(up)));
      stretch = Math.min(SET_STRETCH[1], Math.max(SET_STRETCH[0], (mid.dot(up) + height - margin + SET_BURY) / upright / tooth.length));
    }
    // Clear of the patient's tooth. Without the tooth's face (older sets): its most labial point SET_CLEAR in front of
    // the patient's most labial. With it (build 286): the face laid against the patient's crown all the way down
    // from the edge to the gum line - the neck turned labially about the incisal edge (torque, to SET_TORQUE_MAX) as
    // far as saves moving the whole tooth out, then the tooth out until its face covers the crown by SET_CLEAR.
    const edgeLevel = mid.dot(up) + height;
    const near: Array<{ f: number; d: number; side: number }> = [];
    for (const point of anchors.labial ?? []) {
      const d = flat(v(point)).sub(middle);
      const across = Math.abs(d.dot(want));
      if (across > width / 2 + 0.5) continue;
      // How far the tooth's face has fallen back by there, towards its mesial and distal sides (nothing over its middle).
      const side = Math.max(0, across / width - 0.3) / 0.2;
      near.push({ f: d.dot(out), d: edgeLevel - v(point).dot(up), side: SET_SIDE_FALL * side * side });
    }
    let forward = 0, torque = 0;
    const faceOf = tooth.face;
    if (!faceOf?.length || margin === null || margin === undefined) {
      for (const q of near) forward = Math.max(forward, q.f + SET_CLEAR);
    } else {
      const reachDown = edgeLevel - margin - 0.5;
      const need = (degrees: number) => {
        const slope = Math.tan((degrees * Math.PI) / 180);
        let most = 0;
        for (const q of near) {
          // From the tooth's edge to the gum line: against the face at that depth (build 288: across its whole
          // width - a patient's tooth turned in the arch stands out at one side, which the middle alone missed).
          if (q.d < 0 || q.d > reachDown) continue;
          const at = q.d / stretch / FACE_STEP, k = Math.min(faceOf.length - 1, Math.floor(at)), k1 = Math.min(faceOf.length - 1, k + 1);
          const behind = faceOf[k] + (faceOf[k1] - faceOf[k]) * (at - k);
          most = Math.max(most, q.f + SET_CLEAR - behind + q.side - slope * q.d);
        }
        return most;
      };
      let best = Infinity;
      for (let degrees = 0; degrees <= SET_TORQUE_MAX; degrees += 1) {
        const out0 = need(degrees), cost = out0 + 0.08 * degrees;
        if (cost < best - 1e-9) { best = cost; forward = out0; torque = degrees; }
      }
    }
    // Build 310: with the tooth's gum mark, its neck stands on it - the tooth cannot leave its root. Seen from the
    // occlusal the mark may lie off the even arch (a tooth tucked behind, one standing out): the edge stays on the
    // arch and the tooth is torqued (labio-palatally, to GUM_TURN_MAX) about its incisal edge until its neck is over
    // the mark, and tipped (mesio-distally) part of the way towards it. The torque that clears the patient's crown is the least.
    let tip = 0;
    const gumAt = anchors.gum?.[i];
    if (gumAt && margin !== null && margin !== undefined) {
      const down = edgeLevel - margin;
      if (down > 3) {
        const g = flat(v(gumAt)).sub(middle);
        const behindNeck = faceOf?.length ? faceOf[Math.min(faceOf.length - 1, Math.round(down / stretch / FACE_STEP))] : 0;
        // Only as far as the neck is really off its mark (more than GUM_SLACK): a tooth laid against the patient's
        // own crown has its neck near enough already, and one brought exactly onto the mark while its face still
        // had to clear the crown ended flared - the edge thrown out, the neck drawn in.
        const slack = (run: number) => Math.sign(run) * Math.max(0, Math.abs(run) - GUM_SLACK);
        const degreesOf = (run: number) => (Math.atan(run / down) * 180) / Math.PI;
        const off = slack(g.dot(out) - (forward + behindNeck + Math.tan((torque * Math.PI) / 180) * down));
        if (off !== 0) {
          torque = Math.max(-GUM_TURN_MAX, Math.min(GUM_TURN_MAX, torque + degreesOf(off)));
          if (faceOf?.length) {
            // Still clear of the patient's crown, at this torque.
            const slope = Math.tan((torque * Math.PI) / 180), reachDown = down - 0.5;
            let most = 0;
            for (const q of near) {
              if (q.d < 0 || q.d > reachDown) continue;
              const at = q.d / stretch / FACE_STEP, k = Math.min(faceOf.length - 1, Math.floor(at)), k1 = Math.min(faceOf.length - 1, k + 1);
              most = Math.max(most, q.f + SET_CLEAR - (faceOf[k] + (faceOf[k1] - faceOf[k]) * (at - k)) + q.side - slope * q.d);
            }
            forward = most;
          }
        }
        // Along the arch only part of the way, and little: teeth tipped fully to their necks lean apart or across
        // each other (two centrals with their necks a little apart stood open like a book) - the long axes of a
        // wax-up stay near the set's own.
        tip = Math.max(-GUM_TIP_MAX, Math.min(GUM_TIP_MAX, GUM_TIP_SHARE * degreesOf(slack(g.dot(want) + (shiftOf.get(tooth.id) ?? 0)))));
      }
    }
    const target = middle.clone().addScaledVector(up, edgeLevel).addScaledVector(out, forward + c.fullness).addScaledVector(want, -(shiftOf.get(tooth.id) ?? 0));
    // The torque: about the tooth's own mesio-distal axis through its incisal middle, the neck going labially.
    const neckOut = new THREE.Vector3().crossVectors(libMesial, v(r.up).normalize()).dot(v(r.out)) > 0 ? -1 : 1;
    // The tip: about the tooth's own labio-palatal axis through its incisal middle, the neck going mesially.
    const libOut = flat(v(r.out)).normalize();
    const neckMesial = new THREE.Vector3().crossVectors(libOut, v(r.up).normalize().negate()).dot(libMesial) > 0 ? 1 : -1;
    const tilt = new THREE.Matrix4().makeRotationAxis(libOut, neckMesial * (tip * Math.PI) / 180).multiply(new THREE.Matrix4().makeRotationAxis(libMesial, neckOut * (torque * Math.PI) / 180));
    const a = v(r.up).normalize();
    const lengthen = new THREE.Matrix4().set(
      1 + (stretch - 1) * a.x * a.x, (stretch - 1) * a.x * a.y, (stretch - 1) * a.x * a.z, 0,
      (stretch - 1) * a.y * a.x, 1 + (stretch - 1) * a.y * a.y, (stretch - 1) * a.y * a.z, 0,
      (stretch - 1) * a.z * a.x, (stretch - 1) * a.z * a.y, 1 + (stretch - 1) * a.z * a.z, 0,
      0, 0, 0, 1,
    );
    const matrix = new THREE.Matrix4().makeTranslation(target.x, target.y, target.z)
      .multiply(turn).multiply(tilt).multiply(widen).multiply(lengthen)
      .multiply(new THREE.Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z));
    matrices.set(tooth.id, matrix);
    apparent.set(tooth.id, width);
    if (p === 1 && !centralWidth) { centralWidth = width; centralLength = tooth.length * stretch; }
  }
  return { matrices, centralWidth, centralLength, apparent, contacts: [] };
}
