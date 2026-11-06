/**
 * Build 124 (Rakesh): the finished model smoothed along the scan's trimmed edge, as CAD Studio's smooth tool does by
 * hand - the surface's corners within `radius` mm of the trim line moved towards their neighbours' average (Taubin
 * passes, so nothing shrinks), most at the line and not at all at `radius`: the base there, and the scan's last edge
 * strip. Never one of the scan's own kept points - every bit of the gum and the teeth stays exactly as scanned.
 */
import type { ManifoldRuntime, ManifoldSolid } from "@/lib/dentalMesh";

/** A spatial hash of points, for "how near is the nearest" questions. */
class PointGrid {
  private cells = new Map<string, number[]>();
  constructor(private points: ArrayLike<number>, private size: number) {
    for (let i = 0; i + 2 < points.length; i += 3) {
      const key = this.key(points[i], points[i + 1], points[i + 2]);
      const list = this.cells.get(key);
      if (list) list.push(i); else this.cells.set(key, [i]);
    }
  }
  private key(x: number, y: number, z: number) {
    return `${Math.floor(x / this.size)},${Math.floor(y / this.size)},${Math.floor(z / this.size)}`;
  }
  /** The distance to the nearest point, if within `size`; otherwise Infinity. */
  nearest(x: number, y: number, z: number) {
    const cx = Math.floor(x / this.size), cy = Math.floor(y / this.size), cz = Math.floor(z / this.size);
    let best = Infinity;
    for (let i = -1; i <= 1; i += 1) for (let j = -1; j <= 1; j += 1) for (let k = -1; k <= 1; k += 1) {
      const list = this.cells.get(`${cx + i},${cy + j},${cz + k}`);
      if (!list) continue;
      for (const p of list) {
        const d = Math.hypot(this.points[p] - x, this.points[p + 1] - y, this.points[p + 2] - z);
        if (d < best) best = d;
      }
    }
    return best <= this.size ? best : Infinity;
  }
}

export const SEAM_SMOOTH = { radius: 4, passes: 40, keepTol: 0.02, step: 0.15 };

/**
 * `solid` smoothed along the trim line `edges` (each loop a list of x, y, z), every corner that is one of the scan's
 * own kept points `keep` (x, y, z - its gum beyond the edge strip and its teeth) left exactly where it is. The solid it gives back is new (the caller frees `solid`), or `solid` itself if
 * nothing was near the line or the smoothed one would not be sound.
 */
export function smoothSeam(runtime: ManifoldRuntime, solid: ManifoldSolid, edges: number[][], keep: ArrayLike<number>, options = SEAM_SMOOTH): ManifoldSolid {
  const { radius, passes, keepTol, step } = options;
  if (!edges.length || passes <= 0 || radius <= 0) return solid;
  // The trim line, sampled every `step` mm.
  const line: number[] = [];
  for (const loop of edges) {
    const n = loop.length / 3;
    for (let k = 0; k < n; k += 1) {
      const a = k * 3, b = ((k + 1) % n) * 3;
      const len = Math.hypot(loop[b] - loop[a], loop[b + 1] - loop[a + 1], loop[b + 2] - loop[a + 2]);
      const parts = Math.max(1, Math.ceil(len / step));
      for (let s = 0; s < parts; s += 1) {
        const t = s / parts;
        line.push(loop[a] + (loop[b] - loop[a]) * t, loop[a + 1] + (loop[b + 1] - loop[a + 1]) * t, loop[a + 2] + (loop[b + 2] - loop[a + 2]) * t);
      }
    }
  }
  const toLine = new PointGrid(line, radius);
  const kept = new PointGrid(keep, keepTol);
  const mesh = solid.getMesh();
  const stride = mesh.numProp, props = mesh.vertProperties, tris = mesh.triVerts;
  const count = props.length / stride;
  const weight = new Float64Array(count);
  const moving: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = props[i * stride], y = props[i * stride + 1], z = props[i * stride + 2];
    const d = toLine.nearest(x, y, z);
    if (!Number.isFinite(d) || Number.isFinite(kept.nearest(x, y, z))) continue;
    const u = d / radius;
    weight[i] = 1 - u * u * (3 - 2 * u);
    if (weight[i] > 0) moving.push(i);
  }
  if (!moving.length) return solid;
  const index = new Map<number, number>();
  moving.forEach((v, k) => index.set(v, k));
  const neighbours: Array<Set<number>> = moving.map(() => new Set());
  for (let t = 0; t + 2 < tris.length; t += 3) for (let e = 0; e < 3; e += 1) {
    const a = tris[t + e], b = tris[t + ((e + 1) % 3)];
    const ka = index.get(a), kb = index.get(b);
    if (ka !== undefined) neighbours[ka].add(b);
    if (kb !== undefined) neighbours[kb].add(a);
  }
  const lists = neighbours.map((set) => [...set]);
  const pos = Float64Array.from(props);
  const next = new Float64Array(moving.length * 3);
  for (let pass = 0; pass < passes; pass += 1) {
    for (const factor of [0.5, -0.53]) {
      moving.forEach((v, k) => {
        const list = lists[k];
        for (let axis = 0; axis < 3; axis += 1) {
          let sum = 0;
          for (const j of list) sum += pos[j * stride + axis];
          const here = pos[v * stride + axis];
          next[k * 3 + axis] = list.length ? here + factor * weight[v] * (sum / list.length - here) : here;
        }
      });
      moving.forEach((v, k) => { for (let axis = 0; axis < 3; axis += 1) pos[v * stride + axis] = next[k * 3 + axis]; });
    }
  }
  const smoothed = new runtime.Mesh({ numProp: stride, vertProperties: Float32Array.from(pos), triVerts: Uint32Array.from(tris), mergeFromVert: mesh.mergeFromVert, mergeToVert: mesh.mergeToVert });
  let made: ManifoldSolid | null = null;
  try {
    made = new runtime.Manifold(smoothed);
    if (made.status() === "NoError" && made.numTri() > 0) return made;
  } catch {
    // fall through: the solid as it was
  }
  made?.delete();
  return solid;
}
