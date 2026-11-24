/**
 * Smile Guide (build 128) - the pipeline core, kept entirely separate from the editor so it cannot affect
 * Model Builder. Pure functions over triangle soups and an FDI label per triangle; the screen (and, later,
 * the studio tool) drives them.
 *
 * The flow: a labelled scan is split into the patient's own teeth and the gum they sit in (splitByLabel);
 * each tooth is lifted as its own body with an anatomic frame (toothFrame); a tooth is repositioned rigidly
 * about that frame (moveMatrix / applyMove); the gum's emptied sockets are healed and each moved tooth's
 * cervical neck is drawn out to meet the gum (reconcile, reusing lib/meshHoleFill and lib/waxNeck); the
 * result is assembled with a provenance mask that marks every triangle captured (the patient's own surface,
 * moved) or synthesised (rebuilt - a healed socket or a drawn-out neck). The mask is what the honesty view
 * and the export gate read: a moved-tooth setup is honest about tooth position, not a gingival or root
 * prediction.
 *
 * Decisions (25 Nov 2026): clinician-seeded labels (no ML); static-plus-heal gum; waxNeck draw-out emergence.
 */
import * as THREE from "three";
import { soup as meshSoup, weld, soupBounds, type Mesh } from "@/lib/dentalMesh";
import { closeSmallMeshHoles } from "@/lib/meshHoleFill";
import type { MeshData, Vec3 as MeshVec3 } from "@/lib/editorMeshCore";
import { extendNeck } from "@/lib/waxNeck";

export type Vec3 = [number, number, number];

/** A triangle of the assembled result is one of these. */
export const CAPTURED = 0; // the patient's own scanned surface (a crown, or untouched gum), moved rigidly
export const SYNTHESISED = 1; // rebuilt where the scan held nothing: a healed socket or a drawn-out neck

/** A tooth's own axes: where it is, its long axis (up, towards the incisal/occlusal) and its labial direction (out). */
export type ToothFrame = { origin: Vec3; up: Vec3; out: Vec3 };

/** A rigid repositioning of one tooth, about its own frame. Angles in degrees; translate in mm on the world axes. */
export type ToothMove = {
  translate?: Vec3;
  /** derotation about the long axis */ rotateUpDeg?: number;
  /** mesio-distal tip, about the labial axis */ rotateOutDeg?: number;
  /** facio-lingual torque, about the mesial axis */ rotateMesialDeg?: number;
};
export const NO_MOVE: ToothMove = {};

const EPS = 1e-9;
function norm(v: Vec3): Vec3 {
  const n = Math.hypot(v[0], v[1], v[2]);
  return n < EPS ? [0, 0, 1] : [v[0] / n, v[1] / n, v[2] / n];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Partition a scan's triangle soup by the FDI label on each triangle. Label 0 (or absent) is gum/non-tooth. */
export function splitByLabel(scan: ArrayLike<number>, labels: ArrayLike<number>): { gum: Float32Array; teeth: Map<number, Float32Array> } {
  const gum: number[] = [];
  const buckets = new Map<number, number[]>();
  const triangles = Math.floor(scan.length / 9);
  for (let t = 0; t < triangles; t += 1) {
    const fdi = labels[t] | 0;
    const target = fdi === 0 ? gum : buckets.get(fdi) ?? (buckets.set(fdi, []), buckets.get(fdi)!);
    const base = t * 9;
    for (let k = 0; k < 9; k += 1) target.push(scan[base + k]);
  }
  const teeth = new Map<number, Float32Array>();
  for (const [fdi, arr] of buckets) teeth.set(fdi, Float32Array.from(arr));
  return { gum: Float32Array.from(gum), teeth };
}

/** The centroid of a triangle soup (average of its corners). */
export function centroidOf(scan: ArrayLike<number>): Vec3 {
  let x = 0, y = 0, z = 0;
  const n = Math.floor(scan.length / 3);
  if (n === 0) return [0, 0, 0];
  for (let i = 0; i < n; i += 1) { x += scan[i * 3]; y += scan[i * 3 + 1]; z += scan[i * 3 + 2]; }
  return [x / n, y / n, z / n];
}

/** The area-weighted average face normal of a triangle soup - for a crown, roughly its occlusal/long axis. */
export function averageNormal(scan: ArrayLike<number>): Vec3 {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i + 8 < scan.length; i += 9) {
    const ux = scan[i + 3] - scan[i], uy = scan[i + 4] - scan[i + 1], uz = scan[i + 5] - scan[i + 2];
    const wx = scan[i + 6] - scan[i], wy = scan[i + 7] - scan[i + 1], wz = scan[i + 8] - scan[i + 2];
    x += uy * wz - uz * wy; y += uz * wx - ux * wz; z += ux * wy - uy * wx;
  }
  return norm([x, y, z]);
}

/**
 * A tooth's anatomic frame. `up` is its long axis; when `archUp` is given it is used, otherwise it is taken from
 * the tooth's own average surface normal (roughly occlusal), so each tooth rotates about its own axis. `out`
 * (labial) points from the arch centre to the tooth, flattened perpendicular to `up`; with no arch centre it
 * falls back to the tooth's longest horizontal spread.
 */
export function toothFrame(toothSoup: ArrayLike<number>, archUp?: Vec3, archCentre?: Vec3): ToothFrame {
  const origin = centroidOf(toothSoup);
  const up = norm(archUp ?? averageNormal(toothSoup));
  let out: Vec3;
  if (archCentre) {
    const radial: Vec3 = [origin[0] - archCentre[0], origin[1] - archCentre[1], origin[2] - archCentre[2]];
    const along = radial[0] * up[0] + radial[1] * up[1] + radial[2] * up[2];
    out = norm([radial[0] - along * up[0], radial[1] - along * up[1], radial[2] - along * up[2]]);
  } else {
    const b = soupBounds(toothSoup);
    const span: Vec3 = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
    out = Math.abs(span[0]) >= Math.abs(span[1]) ? [1, 0, 0] : [0, 1, 0];
    const along = out[0] * up[0] + out[1] * up[1] + out[2] * up[2];
    out = norm([out[0] - along * up[0], out[1] - along * up[1], out[2] - along * up[2]]);
  }
  return { origin, up, out };
}

/** The 4x4 that applies a tooth move about its frame: rotate in place (about origin), then translate in world. */
export function moveMatrix(frame: ToothFrame, move: ToothMove): THREE.Matrix4 {
  const up = new THREE.Vector3(...norm(frame.up));
  const out = new THREE.Vector3(...norm(frame.out));
  const mesial = new THREE.Vector3(...cross(frame.up, frame.out)).normalize();
  const origin = new THREE.Vector3(...frame.origin);
  const rot = new THREE.Quaternion();
  const d2r = Math.PI / 180;
  if (move.rotateUpDeg) rot.premultiply(new THREE.Quaternion().setFromAxisAngle(up, move.rotateUpDeg * d2r));
  if (move.rotateOutDeg) rot.premultiply(new THREE.Quaternion().setFromAxisAngle(out, move.rotateOutDeg * d2r));
  if (move.rotateMesialDeg) rot.premultiply(new THREE.Quaternion().setFromAxisAngle(mesial, move.rotateMesialDeg * d2r));
  const m = new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z)
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(rot))
    .multiply(new THREE.Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z));
  const tr = move.translate;
  if (tr) m.premultiply(new THREE.Matrix4().makeTranslation(tr[0], tr[1], tr[2]));
  return m;
}

/** Apply a 4x4 to a triangle soup, returning a new soup. */
export function applyMatrix(scan: ArrayLike<number>, m: THREE.Matrix4): Float32Array {
  const out = new Float32Array(scan.length);
  const e = m.elements;
  for (let i = 0; i + 2 < scan.length; i += 3) {
    const x = scan[i], y = scan[i + 1], z = scan[i + 2];
    out[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
    out[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    out[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
  }
  return out;
}

/** Move one tooth about its frame. */
export function applyMove(toothSoup: ArrayLike<number>, frame: ToothFrame, move: ToothMove): Float32Array {
  return applyMatrix(toothSoup, moveMatrix(frame, move));
}

/** True when a move is anything other than the identity. */
export function isMoved(move: ToothMove): boolean {
  const t = move.translate;
  return Boolean((t && (t[0] || t[1] || t[2])) || move.rotateUpDeg || move.rotateOutDeg || move.rotateMesialDeg);
}

function soupToMeshData(scan: ArrayLike<number>): MeshData {
  const m = weld(scan, 1e-4);
  const vertices: MeshVec3[] = [];
  for (let i = 0; i + 2 < m.v.length; i += 3) vertices.push([m.v[i], m.v[i + 1], m.v[i + 2]]);
  const faces: [number, number, number][] = [];
  for (let i = 0; i + 2 < m.f.length; i += 3) faces.push([m.f[i], m.f[i + 1], m.f[i + 2]]);
  return { name: "smile", vertices, faces };
}

function meshDataToSoup(mesh: MeshData): Float32Array {
  const m: Mesh = { v: mesh.vertices.flat(), f: mesh.faces.flat() };
  return meshSoup(m);
}

/** Close the sockets left in the gum bed when teeth are lifted. Returns the healed soup; the added fill is synthesised. */
export function healGum(gumSoup: ArrayLike<number>): { soup: Float32Array; filledTriangles: number } {
  if (gumSoup.length === 0) return { soup: new Float32Array(0), filledTriangles: 0 };
  const before = Math.floor(gumSoup.length / 9);
  const healed = closeSmallMeshHoles(soupToMeshData(gumSoup));
  const soup = meshDataToSoup(healed.mesh);
  const after = Math.floor(soup.length / 9);
  return { soup, filledTriangles: Math.max(0, after - before) };
}

/**
 * The assembled result of a Smile Guide setup: every captured and synthesised triangle in one soup, with a
 * per-triangle provenance mask. `teeth` carries each tooth's frame and whether it was moved.
 */
export type SmileResult = {
  soup: Float32Array;
  provenance: Uint8Array;
  teeth: Map<number, { frame: ToothFrame; moved: boolean; triangles: number }>;
};

function append(into: number[], prov: number[], scan: ArrayLike<number>, tag: number) {
  const triangles = Math.floor(scan.length / 9);
  for (let i = 0; i < scan.length; i += 1) into.push(scan[i]);
  for (let t = 0; t < triangles; t += 1) prov.push(tag);
}

/**
 * Run the whole pipeline. `labels` is one FDI per scan triangle (0 = gum). `moves` maps FDI to a repositioning.
 * `archUp`/`archCentre` orient each tooth's frame. Gum is static-plus-heal; emergence is a waxNeck draw-out on
 * every moved tooth (the crown stays captured, the drawn-out neck is synthesised).
 */
export function buildSmile(
  scan: ArrayLike<number>,
  labels: ArrayLike<number>,
  moves: ReadonlyMap<number, ToothMove>,
  opts: { archUp?: Vec3; archCentre?: Vec3; emergence?: boolean } = {},
): SmileResult {
  const { gum, teeth } = splitByLabel(scan, labels);
  const archUp = opts.archUp; // undefined -> each tooth takes its own average-normal long axis
  const archCentre = opts.archCentre ?? centroidOf(scan);
  const emergence = opts.emergence ?? true;

  const outSoup: number[] = [];
  const outProv: number[] = [];
  const teethOut = new Map<number, { frame: ToothFrame; moved: boolean; triangles: number }>();

  // Gum bed, sockets healed.
  const healed = healGum(gum);
  // The fill lands at the end of the welded soup; mark the tail synthesised, the rest captured.
  const gumTriangles = Math.floor(healed.soup.length / 9);
  const capturedGum = gumTriangles - healed.filledTriangles;
  for (let t = 0; t < gumTriangles; t += 1) {
    const base = t * 9;
    for (let k = 0; k < 9; k += 1) outSoup.push(healed.soup[base + k]);
    outProv.push(t < capturedGum ? CAPTURED : SYNTHESISED);
  }

  // Each tooth: lift, move, and (if moved) draw out its emergence.
  for (const [fdi, toothSoup] of teeth) {
    const frame = toothFrame(toothSoup, archUp, archCentre);
    const move = moves.get(fdi) ?? NO_MOVE;
    const moved = isMoved(move);
    const placed = moved ? applyMove(toothSoup, frame, move) : Float32Array.from(toothSoup);
    const crownTriangles = Math.floor(placed.length / 9);
    append(outSoup, outProv, placed, CAPTURED);
    let triangles = crownTriangles;
    if (moved && emergence) {
      const movedFrame = toothFrame(placed, archUp, archCentre);
      const extended = extendNeck(placed, { origin: movedFrame.origin, up: movedFrame.up, out: movedFrame.out });
      const extendedTriangles = Math.floor(extended.length / 9);
      if (extendedTriangles > crownTriangles) {
        // extendNeck keeps the crown's corners and adds the neck; append only the added neck triangles as synthesised.
        for (let t = crownTriangles; t < extendedTriangles; t += 1) {
          const base = t * 9;
          const tri: number[] = [];
          for (let k = 0; k < 9; k += 1) tri.push(extended[base + k]);
          append(outSoup, outProv, tri, SYNTHESISED);
        }
        triangles = extendedTriangles;
      }
    }
    teethOut.set(fdi, { frame, moved, triangles });
  }

  return { soup: Float32Array.from(outSoup), provenance: Uint8Array.from(outProv), teeth: teethOut };
}

/** How much of the result is the patient's own captured surface, as a share 0..1 (the honesty headline number). */
export function capturedShare(result: SmileResult): number {
  if (result.provenance.length === 0) return 1;
  let captured = 0;
  for (let i = 0; i < result.provenance.length; i += 1) if (result.provenance[i] === CAPTURED) captured += 1;
  return captured / result.provenance.length;
}

/** Whether any tooth has been moved - a printable of this result must be labelled an appearance goal. */
export function hasMovedTeeth(result: SmileResult): boolean {
  for (const t of result.teeth.values()) if (t.moved) return true;
  return false;
}
