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
export type SetTooth = { id: string; fdi: number; kind: ToothKind; frame: ToothFrame; width: number; length: number };

/** Where the set goes: the midline at the incisal edges, the two canine tips, and the occlusal direction (towards the incisal edges) and labial direction. */
export type SetAnchors = { midline: Vec3; canines: [Vec3, Vec3]; up: Vec3; out: Vec3 };

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
  length: [-3, 4], midline: [-3, 3], cant: [-5, 5], centralWidth: [6.5, 10.5], ratio: [0.7, 0.9], red: [0.6, 0.85],
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
export function layoutSmileSet(teeth: SetTooth[], anchors: SetAnchors, controls: SetControls): SetLayout | null {
  const c = clampControls(controls);
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
  for (const tooth of teeth) {
    const p = position(tooth.kind) as 1 | 2 | 3;
    if (p > 3) continue;
    // FDI quadrants 2 and 3 are the patient's left: +across.
    const s = isLeft(tooth.fdi) ? 1 : -1;
    const x0 = ends[p - 1], x1 = ends[p];
    const y = (x: number) => -k * x * x + c.fullness;
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
  rest: Record<number, { frame: ToothFrame; width: number; length: number }>;
  laid: Record<number, number[]>;
};

/** How far a tooth may have been reshaped (not just moved, turned or sized) and still follow the set, mm. */
export const SCULPTED_MISS = 0.02;

/**
 * Each front tooth's rest frame read from the teeth themselves, as a tooth set has them already turned
 * along its own arch: mesial towards the neighbour mesial to it (the centrals towards each other), in the
 * plane square to `up`; out labial (the side `out` points); the origin the middle of its incisal edge on
 * its labial face; width along mesial and length along up, mm. Teeth by FDI with their soups (scene coordinates).
 */
export function restFrames(teeth: Array<{ fdi: number; soup: ArrayLike<number> }>, up: Vec3, out: Vec3): Map<number, { frame: ToothFrame; width: number; length: number }> {
  const u = v(up).normalize();
  const centroid = (soup: ArrayLike<number>) => {
    const c = new THREE.Vector3();
    const n = Math.max(1, soup.length / 3);
    for (let i = 0; i + 2 < soup.length; i += 3) c.x += soup[i] / n, c.y += soup[i + 1] / n, c.z += soup[i + 2] / n;
    return c;
  };
  const centres = new Map(teeth.map((t) => [t.fdi, centroid(t.soup)]));
  const result = new Map<number, { frame: ToothFrame; width: number; length: number }>();
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
    result.set(tooth.fdi, { frame: { origin: origin.toArray() as Vec3, mesial: mesial.toArray() as Vec3, out: o.toArray() as Vec3, up: u.toArray() as Vec3 }, width: hi - lo, length: top - bottom });
  }
  return result;
}
