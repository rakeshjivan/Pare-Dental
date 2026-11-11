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

/** How far incisal of the gingival margin the scan is still taken as gum (the margin is read to about this), mm. */
const GUM_BAND = 0.5;

/**
 * Where the scan stands proud of one wax tooth, and its deepest point (mm). `scan` and `wax`: soups, scene coordinates.
 * `gum` (build 286): the tooth's gingival margin as a level along the arch's `up` (towards the incisal edges) - the
 * scan gumwards of it is gum, not tooth, and is never proud (a wax tooth's neck stands in the gum).
 */
export function proudOfWax(scan: ArrayLike<number>, wax: ArrayLike<number>, frame: ToothFrame, width: number, length: number, keep = 600, gum?: { up: [number, number, number]; level: number }): Proud {
  const o = new THREE.Vector3(...frame.origin), m = new THREE.Vector3(...frame.mesial).normalize(), f = new THREE.Vector3(...frame.out).normalize(), u = new THREE.Vector3(...frame.up).normalize();
  const local = (x: number, y: number, z: number) => { const dx = x - o.x, dy = y - o.y, dz = z - o.z; return [dx * m.x + dy * m.y + dz * m.z, dx * f.x + dy * f.y + dz * f.z, dx * u.x + dy * u.y + dz * u.z] as const; };
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
    if (gum && x * gum.up[0] + y * gum.up[1] + z * gum.up[2] < gum.level + GUM_BAND) continue;
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

/**
 * Build 281 (Rakesh: the flush cut left a flat slice on the tooth beside it): the wax tooth's surface that faces
 * `dir` (its triangles turned at least `minFacing` towards it) swept `depth` mm along `dir` - a closed solid (a soup,
 * wound outward) whose back face is the wax tooth's own surface. Cut from the scan, it takes away exactly what
 * stands in front of that surface and within its outline, so the patient's tooth ends flush with the wax and
 * nothing beside the tooth is touched. Null when the surface has too little to sweep.
 */
export function sweptSurface(wax: ArrayLike<number>, dir: [number, number, number], depth: number, minFacing = 0.15): Float32Array | null {
  const d = new THREE.Vector3(...dir).normalize();
  const tris: number[][] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i + 8 < wax.length; i += 9) {
    a.set(wax[i], wax[i + 1], wax[i + 2]); b.set(wax[i + 3], wax[i + 4], wax[i + 5]); c.set(wax[i + 6], wax[i + 7], wax[i + 8]);
    n.crossVectors(b.clone().sub(a), c.clone().sub(a));
    const area = n.length();
    if (area < 1e-10) continue;
    if (n.dot(d) / area < minFacing) continue;
    tris.push([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z]);
  }
  if (!tris.length) return null;
  // The patch's outline: its edges used once (corners matched by position).
  const key = (x: number, y: number, z: number) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
  const edges = new Map<string, { count: number; from: number[]; to: number[] }>();
  for (const t of tris) {
    for (let k = 0; k < 3; k += 1) {
      const p = t.slice(k * 3, k * 3 + 3), q = t.slice(((k + 1) % 3) * 3, ((k + 1) % 3) * 3 + 3);
      const kp = key(p[0], p[1], p[2]), kq = key(q[0], q[1], q[2]);
      const id = kp < kq ? `${kp}|${kq}` : `${kq}|${kp}`;
      const was = edges.get(id);
      if (was) was.count += 1; else edges.set(id, { count: 1, from: p, to: q });
    }
  }
  const out: number[] = [];
  const s = (p: number[]) => [p[0] + d.x * depth, p[1] + d.y * depth, p[2] + d.z * depth];
  for (const t of tris) {
    const p = t.slice(0, 3), q = t.slice(3, 6), r = t.slice(6, 9);
    // The back (the wax's own surface), turned to face into the wax; the front, swept, facing out.
    out.push(...p, ...r, ...q);
    out.push(...s(p), ...s(q), ...s(r));
  }
  for (const e of edges.values()) {
    if (e.count !== 1) continue;
    // A side wall along each outline edge, wound to face outward (from -> to runs as the patch's triangle had it).
    const p = e.from, q = e.to, ps = s(p), qs = s(q);
    out.push(...p, ...q, ...qs, ...p, ...qs, ...ps);
  }
  return Float32Array.from(out);
}
