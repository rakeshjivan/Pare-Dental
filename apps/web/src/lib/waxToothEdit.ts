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
  moveMesial: number;
  moveOut: number;
  moveUp: number;
  rotate: number;
  tip: number;
  torque: number;
};

export const NO_EDIT: ToothEdit = { length: 0, mesial: 0, distal: 0, spread: 0, thickness: 0, palatal: 0, moveMesial: 0, moveOut: 0, moveUp: 0, rotate: 0, tip: 0, torque: 0 };

/** The ranges offered, mm and degrees. */
export const EDIT_RANGES: Record<keyof ToothEdit, readonly [number, number]> = {
  length: [-3, 4], mesial: [-2.5, 2.5], distal: [-2.5, 2.5], spread: [-2, 3], thickness: [-1, 1.5], palatal: [-1, 3],
  moveMesial: [-3, 3], moveOut: [-2, 2], moveUp: [-3, 3], rotate: [-25, 25], tip: [-15, 15], torque: [-15, 15],
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
    b -= (edit.palatal ?? 0) * Math.min(1, Math.max(0, b / depth));
    h += edit.length * share;
    p.copy(o).addScaledVector(m, a).addScaledVector(f, b).addScaledVector(u, h).applyMatrix4(pose);
    out[i] = p.x; out[i + 1] = p.y; out[i + 2] = p.z;
  }
  return out;
}
