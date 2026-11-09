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
  /** The incisal plane turned about the midline (frontal plane), degrees (+ the patient's left side up). */
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

/** The arch plane from the anchors: origin at the midline, across (to the patient's left), forward (labial), normal (incisal). */
function archPlane(a: SetAnchors) {
  const normal = v(a.up).normalize();
  const [c0, c1] = a.canines.map(v);
  // The patient's left is the canine further along `across`; take the line between them as across, either order.
  const across = c1.clone().sub(c0);
  across.addScaledVector(normal, -across.dot(normal));
  if (across.length() < 1e-6) return null;
  across.normalize();
  let forward = new THREE.Vector3().crossVectors(normal, across).normalize();
  if (forward.dot(v(a.out)) < 0) {
    // Keep a right-handed frame with forward labial: flip across (so its side is the other canine).
    across.negate();
    forward = new THREE.Vector3().crossVectors(normal, across).normalize();
  }
  const mid = v(a.midline);
  // Canine tips in the plane: x across, y forward (from the midline). Depth k of y = -k x^2 through them.
  const planar = [c0, c1].map((c) => { const d = c.clone().sub(mid); return { x: d.dot(across), y: d.dot(forward), h: d.dot(normal) }; });
  const k = planar.reduce((s, p) => s + Math.max(0, -p.y) / Math.max(1, p.x * p.x), 0) / 2;
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
  const plane = archPlane(anchors);
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
  const cant = new THREE.Matrix4().makeTranslation(plane.mid.x, plane.mid.y, plane.mid.z)
    .multiply(new THREE.Matrix4().makeRotationAxis(plane.forward, (c.cant * Math.PI) / 180))
    .multiply(new THREE.Matrix4().makeTranslation(-plane.mid.x, -plane.mid.y, -plane.mid.z));
  const matrices = new Map<string, THREE.Matrix4>();
  const apparent = new Map<string, number>();
  for (const tooth of teeth) {
    const p = position(tooth.kind) as 1 | 2 | 3;
    if (p > 3) continue;
    const q = Math.floor(tooth.fdi / 10);
    // FDI quadrants 2 and 3 are the patient's left: +across.
    const s = q === 2 || q === 3 ? 1 : -1;
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
