/**
 * Build 124 (Rakesh): the finished model smoothed along the scan's trimmed edge, as CAD Studio's smooth tool does by
 * hand - the surface's corners within `radius` mm of the trim line moved towards their neighbours' average (Taubin
 * passes, so nothing shrinks), most at the line and not at all at `radius`: the base there, and the scan's last edge
 * strip. Never one of the scan's own kept points - every bit of the gum and the teeth stays exactly as scanned.
 */
import type { ManifoldRuntime, ManifoldSolid } from "@/lib/dentalMesh";

const cellKey = (ix: number, iy: number, iz: number) => ((ix & 1023) * 1024 + (iy & 1023)) * 1024 + (iz & 1023);

/** A spatial hash of points, for "how near is the nearest" questions. */
class PointGrid {
  // Build 267: number keys (each cell's indices packed, wrapping every 1024 cells - a far point sharing a key is only
  // measured and left out), not strings: Make spent over a second building and looking up the strings.
  private cells = new Map<number, number[]>();
  constructor(private points: ArrayLike<number>, private size: number) {
    for (let i = 0; i + 2 < points.length; i += 3) {
      const key = this.key(points[i], points[i + 1], points[i + 2]);
      const list = this.cells.get(key);
      if (list) list.push(i); else this.cells.set(key, [i]);
    }
  }
  private key(x: number, y: number, z: number) {
    return cellKey(Math.floor(x / this.size), Math.floor(y / this.size), Math.floor(z / this.size));
  }
  /** The distance to the nearest point, if within `size`; otherwise Infinity. */
  nearest(x: number, y: number, z: number) {
    const cx = Math.floor(x / this.size), cy = Math.floor(y / this.size), cz = Math.floor(z / this.size);
    let best = Infinity;
    for (let i = -1; i <= 1; i += 1) for (let j = -1; j <= 1; j += 1) for (let k = -1; k <= 1; k += 1) {
      const list = this.cells.get(cellKey(cx + i, cy + j, cz + k));
      if (!list) continue;
      for (const p of list) {
        const d = Math.hypot(this.points[p] - x, this.points[p + 1] - y, this.points[p + 2] - z);
        if (d < best) best = d;
      }
    }
    return best <= this.size ? best : Infinity;
  }
}

export const SEAM_SMOOTH = { radius: 4, passes: 40, keepTol: 0.02, step: 0.15, minEdge: 0.05, unfold: 12 };

/**
 * `solid` smoothed along the trim line `edges` (each loop a list of x, y, z), every corner that is one of the scan's
 * own kept points `keep` (x, y, z - its gum beyond the edge strip and its teeth) left exactly where it is. The solid it gives back is new (the caller frees `solid`), or `solid` itself if
 * nothing was near the line or the smoothed one would not be sound.
 */
export function smoothSeam(runtime: ManifoldRuntime, solid: ManifoldSolid, edges: number[][], keep: ArrayLike<number>, options: { radius: number; passes: number; keepTol: number; step: number; minEdge?: number; unfold?: number } = SEAM_SMOOTH): ManifoldSolid {
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
  // Build 267 (Rakesh): the pits along the seam are tiny folds - a triangle or two turned back on the surface (from the
  // join of scan and base), which the passes above cannot open. Each corner of one, of those free to move, goes to its
  // neighbours' average, over again until none is left (or `unfold` rounds).
  for (let round = 0; round < (options.unfold ?? 0); round += 1) {
    const folded = foldedCorners(pos, stride, tris, weight);
    if (!folded.length) break;
    for (const v of folded) {
      const list = lists[index.get(v)!];
      if (!list?.length) continue;
      for (let axis = 0; axis < 3; axis += 1) {
        let sum = 0;
        for (const j of list) sum += pos[j * stride + axis];
        pos[v * stride + axis] = sum / list.length;
      }
    }
  }
  // Build 267 (Rakesh): the tiny pits along the seam - clusters of sliver triangles a few hundredths of a millimetre
  // across, left where scan and base were joined, that show as dark dots - gone: their short edges merged (corners free
  // to move only, so none of the gum or teeth kept), the smoothed solid kept as it is if that would not be sound.
  const movable = new Uint8Array(count);
  moving.forEach((v) => { movable[v] = 1; });
  const tidied = collapseSlivers(pos, stride, tris, movable, options.minEdge ?? 0);
  const vertProperties = Float32Array.from(pos);
  for (const attempt of tidied ? [tidied, null] : [null]) {
    const triVerts = attempt ? attempt.tris : Uint32Array.from(tris);
    const merges = attempt ? remapMerges(mesh.mergeFromVert, mesh.mergeToVert, attempt.find) : { from: mesh.mergeFromVert, to: mesh.mergeToVert };
    let made: ManifoldSolid | null = null;
    try {
      made = new runtime.Manifold(new runtime.Mesh({ numProp: stride, vertProperties, triVerts, mergeFromVert: merges.from, mergeToVert: merges.to }));
      (globalThis as { __seamInfo?: unknown[] }).__seamInfo?.push({ moving: moving.length, collapsed: attempt?.collapsed ?? 0, status: made.status(), tris: made.numTri() });
      if (made.status() === "NoError" && made.numTri() > 0) return made;
    } catch (error) {
      (globalThis as { __seamInfo?: unknown[] }).__seamInfo?.push({ moving: moving.length, error: String(error) });
    }
    made?.delete();
  }
  return solid;
}

/**
 * Build 267: the corners free to move (`weight` above 0) of every triangle turned back on the surface - facing more than
 * 120 degrees away from a triangle beside it - that has one.
 */
function foldedCorners(pos: Float64Array, stride: number, tris: ArrayLike<number>, weight: Float64Array): number[] {
  const normal = (t: number, out: number[]) => {
    const a = tris[t] * stride, b = tris[t + 1] * stride, c = tris[t + 2] * stride;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, len = Math.hypot(nx, ny, nz) || 1;
    out[0] = nx / len; out[1] = ny / len; out[2] = nz / len;
  };
  // Each edge of a triangle with a corner free to move, to the triangles on it.
  const byEdge = new Map<number, number[]>();
  for (let t = 0; t + 2 < tris.length; t += 3) {
    if (!(weight[tris[t]] > 0 || weight[tris[t + 1]] > 0 || weight[tris[t + 2]] > 0)) continue;
    for (let e = 0; e < 3; e += 1) {
      const a = tris[t + e], b = tris[t + ((e + 1) % 3)];
      const key = Math.min(a, b) * 4294967296 + Math.max(a, b);
      const list = byEdge.get(key);
      if (list) list.push(t); else byEdge.set(key, [t]);
    }
  }
  const n1 = [0, 0, 0], n2 = [0, 0, 0], out = new Set<number>();
  for (const list of byEdge.values()) {
    if (list.length !== 2) continue;
    normal(list[0], n1); normal(list[1], n2);
    if (n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2] >= -0.5) continue;
    for (const t of list) for (let k = 0; k < 3; k += 1) if (weight[tris[t + k]] > 0) out.add(tris[t + k]);
  }
  return [...out];
}

/**
 * Build 267: `tris` with every edge shorter than `minEdge` between two `movable` corners merged into one corner at its
 * middle (in `pos`), the shortest first, each only where the surface stays a surface (the edge's two ends share exactly
 * the two corners across it). Null if there was none to merge.
 */
function collapseSlivers(pos: Float64Array, stride: number, tris: ArrayLike<number>, movable: Uint8Array, minEdge: number): { tris: Uint32Array; find: (v: number) => number; collapsed: number } | null {
  if (minEdge <= 0) return null;
  const length = (a: number, b: number) => Math.hypot(pos[a * stride] - pos[b * stride], pos[a * stride + 1] - pos[b * stride + 1], pos[a * stride + 2] - pos[b * stride + 2]);
  const candidates: Array<[number, number, number]> = [];
  const around = new Map<number, Set<number>>();
  const link = (a: number, b: number) => { let set = around.get(a); if (!set) around.set(a, (set = new Set())); set.add(b); };
  for (let t = 0; t + 2 < tris.length; t += 3) {
    const c = [tris[t], tris[t + 1], tris[t + 2]];
    if (!movable[c[0]] && !movable[c[1]] && !movable[c[2]]) continue;
    for (let e = 0; e < 3; e += 1) {
      const a = c[e], b = c[(e + 1) % 3];
      link(a, b); link(b, a);
      if (a < b && movable[a] && movable[b]) { const l = length(a, b); if (l < minEdge) candidates.push([l, a, b]); }
    }
  }
  if (!candidates.length) return null;
  // Every neighbour of a movable corner needs its own ring too, for the check and the merge.
  for (let t = 0; t + 2 < tris.length; t += 3) {
    const c = [tris[t], tris[t + 1], tris[t + 2]];
    if (!c.some((v) => around.has(v))) continue;
    for (let e = 0; e < 3; e += 1) { const a = c[e], b = c[(e + 1) % 3]; if (around.has(a) || around.has(b)) { link(a, b); link(b, a); } }
  }
  candidates.sort((p, q) => p[0] - q[0]);
  const parent = new Map<number, number>();
  const find = (v: number): number => { let r = v; while (parent.has(r)) r = parent.get(r)!; return r; };
  let collapsed = 0;
  for (const [, a0, b0] of candidates) {
    const a = find(a0), b = find(b0);
    if (a === b || !movable[a] || !movable[b] || length(a, b) >= minEdge) continue;
    const ra = around.get(a), rb = around.get(b);
    if (!ra || !rb || !ra.has(b)) continue;
    let common = 0;
    for (const n of ra) if (rb.has(n)) common += 1;
    if (common !== 2) continue;
    for (let k = 0; k < 3; k += 1) pos[a * stride + k] = (pos[a * stride + k] + pos[b * stride + k]) / 2;
    for (const n of rb) {
      if (n === a) continue;
      const rn = around.get(n);
      if (rn) { rn.delete(b); rn.add(a); }
      ra.add(n);
    }
    ra.delete(b);
    around.delete(b);
    parent.set(b, a);
    collapsed += 1;
  }
  if (!collapsed) return null;
  const out: number[] = [];
  for (let t = 0; t + 2 < tris.length; t += 3) {
    const a = find(tris[t]), b = find(tris[t + 1]), c = find(tris[t + 2]);
    if (a !== b && b !== c && a !== c) out.push(a, b, c);
  }
  return { tris: Uint32Array.from(out), find, collapsed };
}

/** Manifold's list of corners that are one (property copies), carried through the merges above. */
function remapMerges(from: Uint32Array | undefined, to: Uint32Array | undefined, find: (v: number) => number): { from: Uint32Array | undefined; to: Uint32Array | undefined } {
  if (!from || !to || !from.length) return { from, to };
  const f: number[] = [], t: number[] = [];
  for (let i = 0; i < from.length; i += 1) { const a = find(from[i]), b = find(to[i]); if (a !== b) { f.push(a); t.push(b); } }
  return { from: Uint32Array.from(f), to: Uint32Array.from(t) };
}
