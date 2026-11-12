/**
 * Build 277 (Rakesh, Wax-up Studio roadmap phase 3): one tooth's own changes, each in one direction only,
 * the way a dentist thinks of them - not a proportional scale.
 *
 * - Length: the incisal edge moves along the long axis; the cervical stays where it is (the crown is
 *   stretched from the neck, so a longer tooth is longer only, not wider or thicker).
 * - Width, mesial and distal separately: that side of the crown moves out, the other side held; the change
 *   fades out towards the cervical, so the neck (emergence) is kept.
 * - Spread (build 284): the distal side moves out as for width, and the teeth behind it in the set move along the
 *   arch by as much (lib/waxSmileSet) - the tooth made wider with its neighbours making room, where mesial and
 *   distal alone move one contact and leave every other tooth where it is.
 * - Thickness: the labial face moves out, the palatal surface held; fading towards the cervical too.
 * - Palatal (build 293): the palatal surface moves palatally, the labial face held; to the neck.
 * - Rotation (mesial edge labially +), tip (incisal edge mesially +), torque (incisal edge labially +):
 *   turned about a point in the cervical third, on the tooth's own axes, so the same values on the left
 *   and right teeth are mirror images.
 * - Move: mesially, labially, incisally, mm.
 *
 * All in the tooth's rest frame (lib/waxSmileSet restFrames): origin at the incisal middle on the labial
 * face, mesial, out (labial) and up (incisal) unit vectors; the crown runs from h = 0 (edge) to h = -length.
 */
import * as THREE from "three";
import type { ToothFrame } from "@/lib/dentalWaxup";

export type ToothEdit = {
  length: number;
  mesial: number;
  distal: number;
  spread: number;
  thickness: number;
  /** Build 293: the palatal surface moved palatally (mm), the labial face held - the tooth made fuller bucco-palatally. */
  palatal: number;
  /**
   * Build 305 (Rakesh: "more control points ... either side of the middle palatal point"): the palatal surface on its
   * mesial and its distal side (the marginal ridges), and the labial face on each side (the line angles), each moved
   * outwards from the tooth (mm) - nothing at the middle of the tooth, nothing on the other face.
   */
  palatalM: number;
  palatalD: number;
  labialM: number;
  labialD: number;
  moveMesial: number;
  moveOut: number;
  moveUp: number;
  rotate: number;
  tip: number;
  torque: number;
};

export const NO_EDIT: ToothEdit = { length: 0, mesial: 0, distal: 0, spread: 0, thickness: 0, palatal: 0, palatalM: 0, palatalD: 0, labialM: 0, labialD: 0, moveMesial: 0, moveOut: 0, moveUp: 0, rotate: 0, tip: 0, torque: 0 };

/** The ranges offered, mm and degrees. */
// Build 308 (Rakesh: "why is the canine restricted on how far I can move it buccally"): a tooth may be moved further
// (it was 2 mm labially or palatally, 3 mm along the arch or up and down) - a canine set well inside a crowded arch
// has further than that to come out.
export const EDIT_RANGES: Record<keyof ToothEdit, readonly [number, number]> = {
  length: [-3, 4], mesial: [-2.5, 2.5], distal: [-2.5, 2.5], spread: [-2, 3], thickness: [-1, 1.5], palatal: [-1, 3],
  palatalM: [-1.5, 2], palatalD: [-1.5, 2], labialM: [-1.5, 2], labialD: [-1.5, 2],
  moveMesial: [-5, 5], moveOut: [-6, 6], moveUp: [-5, 5], rotate: [-25, 25], tip: [-15, 15], torque: [-15, 15],
};

export function clampEdit(edit: Partial<ToothEdit>): ToothEdit {
  const out = { ...NO_EDIT };
  for (const key of Object.keys(NO_EDIT) as Array<keyof ToothEdit>) {
    const value = edit[key];
    if (typeof value === "number" && Number.isFinite(value)) out[key] = Math.min(EDIT_RANGES[key][1], Math.max(EDIT_RANGES[key][0], value));
  }
  return out;
}

export const isNoEdit = (edit: ToothEdit | undefined) => !edit || (Object.keys(NO_EDIT) as Array<keyof ToothEdit>).every((key) => Math.abs(edit[key] ?? 0) < 1e-6);

/** How much of the crown, from the cervical, the width and thickness changes fade in over. */
const FADE = 0.45;
/** Build 305: how far from the middle of the tooth (a share of its half width) a side dot's change is whole; and the share of the crown below the incisal edge a labial one fades in over. */
const SIDE_FULL = 0.6;
const EDGE_FADE = 0.25;
const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/** The rigid part of an edit (turns about the cervical-third pivot, then the moves) as a matrix, scene coordinates. */
export function editPose(frame: ToothFrame, length: number, palatal: number, edit: ToothEdit): THREE.Matrix4 {
  const o = new THREE.Vector3(...frame.origin), m = new THREE.Vector3(...frame.mesial).normalize(), f = new THREE.Vector3(...frame.out).normalize(), u = new THREE.Vector3(...frame.up).normalize();
  const pivot = o.clone().addScaledVector(u, -length * 0.66).addScaledVector(f, palatal / 2);
  const turn = (from: THREE.Vector3, to: THREE.Vector3, degrees: number) => {
    const axis = new THREE.Vector3().crossVectors(from, to);
    return axis.lengthSq() < 1e-12 || !degrees ? new THREE.Matrix4() : new THREE.Matrix4().makeRotationAxis(axis.normalize(), (degrees * Math.PI) / 180);
  };
  const rotation = turn(m, f, edit.rotate).multiply(turn(u, m, edit.tip)).multiply(turn(u, f, edit.torque));
  const move = m.clone().multiplyScalar(edit.moveMesial).addScaledVector(f, edit.moveOut).addScaledVector(u, edit.moveUp);
  return new THREE.Matrix4().makeTranslation(pivot.x + move.x, pivot.y + move.y, pivot.z + move.z)
    .multiply(rotation)
    .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
}

/** The palatal-most point's depth behind the labial face (negative, mm), as the rest soup has it. */
export function palatalDepth(soup: ArrayLike<number>, frame: ToothFrame): number {
  const o = frame.origin, f = new THREE.Vector3(...frame.out).normalize();
  let least = 0;
  for (let i = 0; i + 2 < soup.length; i += 3) least = Math.min(least, (soup[i] - o[0]) * f.x + (soup[i + 1] - o[1]) * f.y + (soup[i + 2] - o[2]) * f.z);
  return least;
}

/** A tooth's rest soup with its own changes made (scene coordinates). */
export function editTooth(rest: ArrayLike<number>, frame: ToothFrame, width: number, length: number, edit: ToothEdit, palatal = palatalDepth(rest, frame)): Float32Array {
  const o = new THREE.Vector3(...frame.origin), m = new THREE.Vector3(...frame.mesial).normalize(), f = new THREE.Vector3(...frame.out).normalize(), u = new THREE.Vector3(...frame.up).normalize();
  const half = Math.max(0.5, width / 2), L = Math.max(1, length), depth = Math.min(-0.5, palatal);
  const pose = editPose(frame, length, palatal, edit);
  const out = new Float32Array(rest.length);
  const p = new THREE.Vector3();
  for (let i = 0; i + 2 < rest.length; i += 3) {
    p.set(rest[i] - o.x, rest[i + 1] - o.y, rest[i + 2] - o.z);
    let a = p.dot(m), b = p.dot(f), h = p.dot(u);
    // Crown share from the cervical (0) to the edge (1), and the fade that keeps the neck.
    const share = Math.min(1, Math.max(0, (h + L) / L));
    const keepNeck = smooth(share / FADE);
    if (a >= 0) a += edit.mesial * Math.min(1, a / half) * keepNeck;
    else a -= (edit.distal + (edit.spread ?? 0)) * Math.min(1, -a / half) * keepNeck;
    b += edit.thickness * Math.min(1, Math.max(0, (b - depth) / -depth)) * keepNeck;
    // Build 293 (Rakesh: "pull the tooth on the palatal so it becomes wider bucco-palatal without affecting the buccal
    // surface"): the palatal surface out, more the further palatal, nothing at the labial face - all the way to the
    // neck, where the tooth has to reach the palatal gum.
    const back = Math.min(1, Math.max(0, b / depth));
    b -= (edit.palatal ?? 0) * back;
    // Build 305: one side of one face - most half way from the middle of the tooth to its contact and beyond, nothing
    // at the middle (where the middle palatal dot is); the palatal ones as far as the neck (as the palatal is), the
    // labial ones leaving the neck on the gum line and the incisal edge where it is.
    const side = smooth(Math.abs(a) / (SIDE_FULL * half));
    const pal = a >= 0 ? edit.palatalM ?? 0 : edit.palatalD ?? 0, lab = a >= 0 ? edit.labialM ?? 0 : edit.labialD ?? 0;
    if (pal) b -= pal * side * smooth(back);
    if (lab) b += lab * side * smooth(1 - back) * keepNeck * smooth((1 - share) / EDGE_FADE);
    h += edit.length * share;
    p.copy(o).addScaledVector(m, a).addScaledVector(f, b).addScaledVector(u, h).applyMatrix4(pose);
    out[i] = p.x; out[i + 1] = p.y; out[i + 2] = p.z;
  }
  return out;
}

/**
 * Build 301 (Rakesh: a tooth shaped with the brushes lost its dots, or the dots "just distort the tooth"): the tooth
 * that `edit` would turn into `made` - editTooth undone. With it a tooth reshaped by the brushes stays in the set:
 * its rest shape is read back from what it has become, so its own changes go on from there exactly as before.
 * The turns and moves are undone exactly; the changes of shape (each corner moved by an amount that depends on
 * where it is) by going back from where each corner ended until editTooth lands on it (to within `within`, mm).
 * `palatal`: the rest tooth's palatal depth, as editTooth was given it.
 */
export function uneditTooth(made: ArrayLike<number>, frame: ToothFrame, width: number, length: number, edit: ToothEdit, palatal: number, within = 1e-4): Float32Array {
  const back = editPose(frame, length, palatal, edit).invert();
  const target = new Float32Array(made.length);
  const p = new THREE.Vector3();
  for (let i = 0; i + 2 < made.length; i += 3) {
    p.set(made[i], made[i + 1], made[i + 2]).applyMatrix4(back);
    target[i] = p.x; target[i + 1] = p.y; target[i + 2] = p.z;
  }
  const shape: ToothEdit = { ...edit, moveMesial: 0, moveOut: 0, moveUp: 0, rotate: 0, tip: 0, torque: 0 };
  if (isNoEdit(shape)) return target;
  let rest = Float32Array.from(target);
  for (let round = 0; round < 200; round += 1) {
    const now = editTooth(rest, frame, width, length, shape, palatal);
    let worst = 0;
    const next = new Float32Array(rest.length);
    for (let i = 0; i < rest.length; i += 1) {
      const miss = now[i] - target[i];
      worst = Math.max(worst, Math.abs(miss));
      // A little short of the whole miss each round, so a corner on a steep part of the change settles instead of swinging.
      next[i] = rest[i] - 0.8 * miss;
    }
    rest = next;
    if (worst < within) break;
  }
  return rest;
}
