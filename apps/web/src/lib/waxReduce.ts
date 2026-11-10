/**
 * Build 279 (Rakesh): not every wax-up is only additive - where a tooth is tipped forwards (or the design is
 * shorter), the patient's tooth can stand proud of the wax and has to be reduced in the mouth. This finds
 * where, per wax tooth, and by how much; and gives the model maker a cutter for a tooth the dentist chose to
 * reduce (the scan cut back flush with the wax on the wax-up model only - the pre-op model keeps it).
 *
 * Measured in the wax tooth's own frame (origin at its incisal middle on the labial face; mesial, out, up):
 * a scan point within the tooth's span is proud when it stands labial of the wax's labial face at that place,
 * or beyond the wax's incisal edge there.
 */
import * as THREE from "three";
import type { ToothFrame } from "@/lib/dentalWaxup";

type Vec3 = [number, number, number];
const CELL = 0.4;

export type Proud = { depth: number; points: Vec3[] };

/** Where the scan stands proud of one wax tooth, and its deepest point (mm). `scan` and `wax`: soups, scene coordinates. */
export function proudOfWax(scan: ArrayLike<number>, wax: ArrayLike<number>, frame: ToothFrame, width: number, length: number, keep = 600): Proud {
  const o = new THREE.Vector3(...frame.origin), m = new THREE.Vector3(...frame.mesial).normalize(), f = new THREE.Vector3(...frame.out).normalize(), u = new THREE.Vector3(...frame.up).normalize();
  const local = (x: number, y: number, z: number) => { const d = new THREE.Vector3(x - o.x, y - o.y, z - o.z); return [d.dot(m), d.dot(f), d.dot(u)] as const; };
  // The wax's labial face and incisal edge as maps over the tooth: the most labial (b) per (a, h) cell, the highest (h) per a column.
  const face = new Map<string, number>();
  const edge = new Map<number, number>();
  let lo = Infinity, hi = -Infinity, bottom = Infinity;
  for (let i = 0; i + 2 < wax.length; i += 3) {
    const [a, b, h] = local(wax[i], wax[i + 1], wax[i + 2]);
    const ka = Math.round(a / CELL), kh = Math.round(h / CELL);
    const key = `${ka},${kh}`;
    face.set(key, Math.max(face.get(key) ?? -Infinity, b));
    edge.set(ka, Math.max(edge.get(ka) ?? -Infinity, h));
    lo = Math.min(lo, a); hi = Math.max(hi, a); bottom = Math.min(bottom, h);
  }
  if (!Number.isFinite(lo)) return { depth: 0, points: [] };
  const span = Math.max(width, hi - lo) / 2;
  const faceAt = (a: number, h: number) => {
    const ka = Math.round(a / CELL), kh = Math.round(h / CELL);
    let best = -Infinity;
    for (let da = -1; da <= 1; da += 1) for (let dh = -1; dh <= 1; dh += 1) best = Math.max(best, face.get(`${ka + da},${kh + dh}`) ?? -Infinity);
    return best;
  };
  const found: Array<{ p: Vec3; d: number }> = [];
  let depth = 0;
  // Only the scan near the tooth (a box round the wax, 4 mm past it) is looked at closely.
  const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < wax.length; i += 3) for (let k = 0; k < 3; k += 1) { box[k] = Math.min(box[k], wax[i + k]); box[k + 3] = Math.max(box[k + 3], wax[i + k]); }
  for (let i = 0; i + 2 < scan.length; i += 3) {
    const x = scan[i], y = scan[i + 1], z = scan[i + 2];
    if (x < box[0] - 4 || x > box[3] + 4 || y < box[1] - 4 || y > box[4] + 4 || z < box[2] - 4 || z > box[5] + 4) continue;
    const [a, b, h] = local(x, y, z);
    // Within the tooth's span, from its cervical end to just beyond its edge, and not far behind it.
    if (Math.abs(a - (lo + hi) / 2) > span * 0.9 || h < Math.max(bottom, -length) || h > 3 || b < -6) continue;
    let d = 0;
    const top = edge.get(Math.round(a / CELL));
    if (top !== undefined && h > top + 0.05) d = h - top;
    else {
      const wb = faceAt(a, h);
      if (Number.isFinite(wb) && b > wb + 0.05) d = b - wb;
    }
    if (d > 0) { found.push({ p: [x, y, z], d }); depth = Math.max(depth, d); }
  }
  found.sort((p, q) => q.d - p.d);
  const step = Math.max(1, Math.ceil(found.length / keep));
  return { depth, points: found.filter((_, k) => k % step === 0).map((entry) => entry.p) };
}

/**
 * A closed box round a wax tooth (a soup), reaching `margin` mm past it - what the model maker's cut works
 * within (it then cuts only what stands in front of the plane through the tooth, inside the tooth's reach).
 */
export function cutterBox(cover: ArrayLike<number>, margin = 4): Float32Array {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < cover.length; i += 3) for (let k = 0; k < 3; k += 1) { min[k] = Math.min(min[k], cover[i + k]); max[k] = Math.max(max[k], cover[i + k]); }
  const [x0, y0, z0] = min.map((v) => v - margin), [x1, y1, z1] = max.map((v) => v + margin);
  const c = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  // Outward-facing triangles of the six faces.
  const faces = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [2, 3, 7], [2, 7, 6], [1, 2, 6], [1, 6, 5], [3, 0, 4], [3, 4, 7]];
  return Float32Array.from(faces.flatMap((tri) => tri.flatMap((k) => c[k])));
}
