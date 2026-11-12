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
import { bendAt, bendSpace, type SpaceBend, type SpaceHandle } from "@/lib/toothSpace";

type P3 = [number, number, number];

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
  /**
   * Build 311 (Rakesh: "often you need to widen or flare the incisal whilst leaving the middle and neck narrow"): the
   * mesial and the distal incisal corner moved outwards along the arch (mm) - the whole side of the tooth with it,
   * the full amount at the edge and nothing at the neck, keeping the side's own full curve between.
   */
  flareM: number;
  flareD: number;
  moveMesial: number;
  moveOut: number;
  moveUp: number;
  rotate: number;
  tip: number;
  torque: number;
  /**
   * Build 312 (Rakesh: "often you need to widen or flare the incisal whilst leaving the middle and neck narrow or a
   * combination ... after a change is made to a part of the tooth it seems to recalculate and fix up the tooth to
   * accommodate"): the dots locked on this tooth - each `p`, where the dot stands on the tooth at rest, and `q`,
   * where it stood when it was locked (both mm on the tooth's own directions: mesial, out, up; before the tooth is
   * turned and moved). Whatever else is changed, a locked dot's spot of the tooth stays at `q` and the tooth round
   * it gives, by the gentlest bend there is (lib/toothSpace).
   */
  held?: Array<{ p: P3; q: P3 }>;
  /** Build 312: dots that were locked and have been let go - what their lock had made of the tooth is kept (the spot `at` moved by `pull`), no longer following later changes. */
  kept?: Array<{ p: P3; at: P3; pull: P3 }>;
};
/** The numbers of an edit (all of it but the locks). */
export type EditKey = Exclude<keyof ToothEdit, "held" | "kept">;
/** Build 312: where each dot of a tooth stands on it, as shares of its width (mesial +), its thickness (labial 0, palatal -1) and its length (edge 0, neck -1). */
export type ToothDot = "edge" | "mesial" | "distal" | "middle" | "palatal" | "neck" | "palatalM" | "palatalD" | "labialM" | "labialD" | "flareM" | "flareD";
export const TOOTH_DOTS: Record<ToothDot, P3> = {
  edge: [0, -0.15, 0], mesial: [0.5, -0.4, -0.4], distal: [-0.5, -0.4, -0.4], middle: [0, -0.45, -0.35], palatal: [0, -1, -0.6], neck: [0, -0.1, -0.92],
  palatalM: [0.32, -0.9, -0.55], palatalD: [-0.32, -0.9, -0.55], labialM: [0.32, -0.08, -0.55], labialD: [-0.32, -0.08, -0.55],
  flareM: [0.5, -0.3, -0.1], flareD: [-0.5, -0.3, -0.1],
};
/** Build 312: more spots at the neck that a locked dot's bend leaves alone, so the neck stays on the gum line all round. */
const NECK_PINS: P3[] = [[0.4, -0.5, -0.97], [-0.4, -0.5, -0.97], [0, -0.75, -1]];

export const NO_EDIT: ToothEdit = { length: 0, mesial: 0, distal: 0, spread: 0, thickness: 0, palatal: 0, palatalM: 0, palatalD: 0, labialM: 0, labialD: 0, flareM: 0, flareD: 0, moveMesial: 0, moveOut: 0, moveUp: 0, rotate: 0, tip: 0, torque: 0 };

/** The ranges offered, mm and degrees. */
// Build 308 (Rakesh: "we need complete freedom of movement of teeth - if the marked teeth and the automatic placement
// are wrong, the limited distance the teeth can move is a problem"): a tooth's place is not limited - it may be
// moved anywhere and turned right round (the figures below are only there to stop a slip of the hand sending it out
// of sight). Its shape still is: a library tooth stretched beyond these is no longer that tooth.
export const EDIT_RANGES: Record<EditKey, readonly [number, number]> = {
  length: [-3, 4], mesial: [-2.5, 2.5], distal: [-2.5, 2.5], spread: [-2, 3], thickness: [-1, 1.5], palatal: [-1, 3],
  palatalM: [-1.5, 2], palatalD: [-1.5, 2], labialM: [-1.5, 2], labialD: [-1.5, 2], flareM: [-1.5, 2], flareD: [-1.5, 2],
  moveMesial: [-60, 60], moveOut: [-60, 60], moveUp: [-60, 60], rotate: [-180, 180], tip: [-90, 90], torque: [-90, 90],
};
/**
 * What a slider in the panel runs over (it is widened to hold a value already beyond it): fine control near where the
 * set placed the tooth. Dragging the tooth itself is not held to these.
 */
export const EDIT_SLIDERS: Record<EditKey, readonly [number, number]> = {
  ...EDIT_RANGES,
  moveMesial: [-5, 5], moveOut: [-6, 6], moveUp: [-5, 5], rotate: [-45, 45], tip: [-25, 25], torque: [-25, 25],
};

const isP3 = (x: unknown): x is P3 => Array.isArray(x) && x.length === 3 && x.every((n) => typeof n === "number" && Number.isFinite(n));
export function clampEdit(edit: Partial<ToothEdit>): ToothEdit {
  const out: ToothEdit = { ...NO_EDIT };
  const held = Array.isArray(edit.held) ? edit.held.filter((one) => one && isP3(one.p) && isP3(one.q)) : [];
  const kept = Array.isArray(edit.kept) ? edit.kept.filter((one) => one && isP3(one.p) && isP3(one.at) && isP3(one.pull)) : [];
  if (held.length) out.held = held;
  if (kept.length) out.kept = kept;
  for (const key of Object.keys(NO_EDIT) as Array<EditKey>) {
    const value = edit[key];
    if (typeof value === "number" && Number.isFinite(value)) out[key] = Math.min(EDIT_RANGES[key][1], Math.max(EDIT_RANGES[key][0], value));
  }
  return out;
}

export const isNoEdit = (edit: ToothEdit | undefined) => !edit || (!edit.held?.length && !edit.kept?.length && (Object.keys(NO_EDIT) as Array<EditKey>).every((key) => Math.abs((edit[key] as number | undefined) ?? 0) < 1e-6));
/** Build 312: a tooth's shape as a short text - two edits with the same text make the same shape (its turns and moves aside). */
export const heldKey = (edit: ToothEdit | undefined) => (edit?.held?.length || edit?.kept?.length ? JSON.stringify([edit.held ?? [], edit.kept ?? []]) : "");

/** How much of the crown, from the cervical, the width and thickness changes fade in over. */
const FADE = 0.45;
/** Build 305: how far from the middle of the tooth (a share of its half width) a side dot's change is whole; and the share of the crown below the incisal edge a labial one fades in over. */
const SIDE_FULL = 0.6;
const EDGE_FADE = 0.25;
/**
 * Build 311: an incisal corner's change runs from the neck (nothing) to the edge (the whole of it), growing faster
 * low down than high up (the power FLARE_BOW, under 1) - so the side of the tooth keeps its own full curve from
 * neck to contact, and is a little fuller for it. It is a share of how far out each point already is, so the side's
 * own shape is scaled, not replaced.
 * (Rakesh, of two earlier forms. Over the incisal half only, eased at both ends: "it's not quite right due to the
 * concavity in the middle that is created". Growing evenly from the neck, the side a straight run: "not straight -
 * you can see the three-dimensional curve of the tooth". A tooth's side is full between its neck and its contact:
 * never hollow, never flat.)
 */
const FLARE_FROM = 0.03;
const FLARE_BOW = 0.7;
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

/**
 * A tooth's change of shape (not its turns and moves) as a move of each point of it, on the tooth's own directions:
 * `at(a, b, h, out)` - a along the arch (mesial +), b through the tooth (labial face 0, palatal -), h along it (edge
 * 0, neck -length) - writes where that point goes.
 */
function shaper(width: number, length: number, edit: ToothEdit, palatal: number): (a: number, b: number, h: number, out: number[]) => void {
  const half = Math.max(0.5, width / 2), L = Math.max(1, length), depth = Math.min(-0.5, palatal);
  const plain = (a: number, b: number, h: number, out: number[]) => {
    // Crown share from the cervical (0) to the edge (1), and the fade that keeps the neck.
    const share = Math.min(1, Math.max(0, (h + L) / L));
    const keepNeck = smooth(share / FADE);
    if (a >= 0) a += edit.mesial * Math.min(1, a / half) * keepNeck;
    else a -= (edit.distal + (edit.spread ?? 0)) * Math.min(1, -a / half) * keepNeck;
    // Build 311: the incisal corners - the full amount at the edge, nothing at the neck, the side's curve kept between.
    const flare = a >= 0 ? edit.flareM ?? 0 : edit.flareD ?? 0;
    if (flare) a += Math.sign(a) * flare * Math.min(1, Math.abs(a) / half) * Math.pow(Math.min(1, Math.max(0, (share - FLARE_FROM) / (1 - FLARE_FROM))), FLARE_BOW);
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
    out[0] = a; out[1] = b; out[2] = h;
  };
  const bend = lockBend(width, L, depth, edit, plain);
  if (!bend) return plain;
  const move = [0, 0, 0];
  return (a, b, h, out) => {
    plain(a, b, h, out);
    bendAt(bend, out[0], out[1], out[2], move);
    out[0] += move[0]; out[1] += move[1]; out[2] += move[2];
  };
}

/** Where a dot stands on a tooth at rest, mm on the tooth's own directions, from its shares. */
export const dotPoint = (share: readonly number[], width: number, length: number, palatal: number): P3 => [share[0] * width, share[1] * -Math.min(-0.5, palatal), share[2] * Math.max(1, length)];
const apart = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** Two dots are the same dot when their rest spots are this close, mm. */
const SAME_DOT = 0.05;

/**
 * Build 312: the bend that keeps the locked dots where they were locked. After the tooth's other changes of shape
 * (`plain`), each locked dot's spot is taken back to where it was locked; what a let-go lock had made is kept; and
 * every other dot of the tooth (and the neck all round) stays where the other changes put it - so the tooth gives
 * only between a locked dot and its neighbours. Null when nothing is or was locked.
 */
function lockBend(width: number, length: number, depth: number, edit: ToothEdit, plain: (a: number, b: number, h: number, out: number[]) => void): SpaceBend | null {
  const held = edit.held ?? [], kept = edit.kept ?? [];
  if (!held.length && !kept.length) return null;
  const handles: SpaceHandle[] = [];
  const taken: P3[] = [];
  const to = [0, 0, 0];
  for (const one of held) {
    if (taken.some((p) => apart(p, one.p) < SAME_DOT)) continue;
    plain(one.p[0], one.p[1], one.p[2], to);
    handles.push({ at: [to[0], to[1], to[2]], pull: [one.q[0] - to[0], one.q[1] - to[1], one.q[2] - to[2]] });
    taken.push(one.p);
  }
  for (const one of kept) {
    if (taken.some((p) => apart(p, one.p) < SAME_DOT)) continue;
    handles.push({ at: one.at, pull: one.pull });
    taken.push(one.p);
  }
  const pins = [...(Object.keys(TOOTH_DOTS) as ToothDot[]).filter((key) => key !== "middle").map((key) => TOOTH_DOTS[key]), ...NECK_PINS];
  for (const share of pins) {
    const p = dotPoint(share, width, length, depth);
    if (taken.some((other) => apart(other, p) < SAME_DOT)) continue;
    plain(p[0], p[1], p[2], to);
    // A pin that has come to stand on a handle would ask the same spot to go two ways: the handle has it.
    if (handles.some((handle) => apart(handle.at, to) < 0.2)) continue;
    handles.push({ at: [to[0], to[1], to[2]] });
  }
  return bendSpace(handles);
}

/**
 * Build 312: an edit with the dots at `shares` locked (and no others). A dot newly locked is held where `before`
 * (the tooth's edit as it stood) has it; one already locked stays held where it was; one no longer locked keeps what
 * its lock had made of the tooth.
 */
export function withLocks(edit: ToothEdit, before: ToothEdit, shares: ReadonlyArray<readonly number[]>, width: number, length: number, palatal: number): ToothEdit {
  const was = before.held ?? [];
  if (!shares.length && !was.length) return edit;
  const at = shaper(width, length, before, palatal);
  const plain = shaper(width, length, { ...before, held: undefined, kept: undefined }, palatal);
  const to = [0, 0, 0];
  const held = shares.map((share) => {
    const p = dotPoint(share, width, length, palatal);
    const known = was.find((one) => apart(one.p, p) < SAME_DOT);
    if (known) return known;
    at(p[0], p[1], p[2], to);
    return { p, q: [to[0], to[1], to[2]] as P3 };
  });
  // Let go: the spot and its pull as they stand now, kept.
  const freed = was.filter((one) => !held.some((other) => apart(other.p, one.p) < SAME_DOT)).map((one) => {
    plain(one.p[0], one.p[1], one.p[2], to);
    return { p: one.p, at: [to[0], to[1], to[2]] as P3, pull: [one.q[0] - to[0], one.q[1] - to[1], one.q[2] - to[2]] as P3 };
  });
  // A kept lock gives way to a new lock on the same dot, and to a newer keeping of it.
  const kept = [...(before.kept ?? []).filter((one) => ![...held, ...freed].some((other) => apart(other.p, one.p) < SAME_DOT)), ...freed];
  return { ...edit, held: held.length ? held : undefined, kept: kept.length ? kept : undefined };
}

/** A tooth's rest soup with its own changes made (scene coordinates). */
export function editTooth(rest: ArrayLike<number>, frame: ToothFrame, width: number, length: number, edit: ToothEdit, palatal = palatalDepth(rest, frame)): Float32Array {
  const o = new THREE.Vector3(...frame.origin), m = new THREE.Vector3(...frame.mesial).normalize(), f = new THREE.Vector3(...frame.out).normalize(), u = new THREE.Vector3(...frame.up).normalize();
  const pose = editPose(frame, length, palatal, edit);
  const shape = shaper(width, length, edit, palatal);
  const out = new Float32Array(rest.length);
  const p = new THREE.Vector3(), to = [0, 0, 0];
  for (let i = 0; i + 2 < rest.length; i += 3) {
    p.set(rest[i] - o.x, rest[i + 1] - o.y, rest[i + 2] - o.z);
    shape(p.dot(m), p.dot(f), p.dot(u), to);
    p.copy(o).addScaledVector(m, to[0]).addScaledVector(f, to[1]).addScaledVector(u, to[2]).applyMatrix4(pose);
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
