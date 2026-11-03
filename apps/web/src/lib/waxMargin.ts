/**
 * Build 111: Wax-up Studio's palatal (lingual) margin line, drawn as in CEREC's margin tool: between one click
 * and the next the line runs over the scan itself - the shortest way across the patient's surface, not a curve
 * pressed onto it - and while the pointer moves the next stretch is shown before it is clicked.
 *
 * The scan near the tooth is welded into a patch of vertices and edges; a path between two points is the
 * shortest along the patch's edges (Dijkstra), eased with a few passes that keep it on the surface.
 */
import { NearestSurface, soupWithin } from "@/lib/nearestSurface";

export type Vec3 = [number, number, number];

/** How far round a line the scan is taken into the patch, mm. */
const PATCH_REACH = 9;

export class ScanPatch {
  readonly xyz: Float64Array;
  private readonly start: Int32Array;
  private readonly next: Int32Array;
  private readonly cost: Float64Array;
  readonly surface: NearestSurface;
  private readonly index: Map<number, number[]>;
  readonly box: number[];
  /** The patch's triangles (vertex indices, 3 a triangle), in the order of its surface's soup. */
  readonly tri: Int32Array;
  /** Build 113: how much each vertex lies in a crease (the gum meeting the tooth), 0 none to 1 deep - the magnetic line's pull. */
  readonly crease: Float32Array;
  constructor(scan: ArrayLike<number>, box: number[]) {
    this.box = box;
    const soup = soupWithin(scan, box);
    this.surface = new NearestSurface(soup, 3);
    const weld = new Map<string, number>();
    const pts: number[] = [];
    const tri: number[] = [];
    for (let c = 0; c * 3 + 2 < soup.length; c += 1) {
      const x = soup[c * 3], y = soup[c * 3 + 1], z = soup[c * 3 + 2];
      const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
      let v = weld.get(key);
      if (v === undefined) { v = pts.length / 3; weld.set(key, v); pts.push(x, y, z); }
      tri.push(v);
    }
    this.xyz = Float64Array.from(pts);
    this.tri = Int32Array.from(tri);
    const count = pts.length / 3;
    const edges: Array<[number, number]> = [];
    const seen = new Set<number>();
    const add = (a: number, b: number) => { if (a === b) return; const k = a < b ? a * count + b : b * count + a; if (seen.has(k)) return; seen.add(k); edges.push([a, b]); };
    for (let i = 0; i + 2 < tri.length; i += 3) { add(tri[i], tri[i + 1]); add(tri[i + 1], tri[i + 2]); add(tri[i + 2], tri[i]); }
    const degree = new Int32Array(count + 1);
    for (const [a, b] of edges) { degree[a] += 1; degree[b] += 1; }
    this.start = new Int32Array(count + 1);
    for (let v = 0; v < count; v += 1) this.start[v + 1] = this.start[v] + degree[v];
    const fill = this.start.slice(0, count);
    this.next = new Int32Array(edges.length * 2);
    this.cost = new Float64Array(edges.length * 2);
    for (const [a, b] of edges) {
      const l = Math.hypot(pts[a * 3] - pts[b * 3], pts[a * 3 + 1] - pts[b * 3 + 1], pts[a * 3 + 2] - pts[b * 3 + 2]);
      this.next[fill[a]] = b; this.cost[fill[a]] = l; fill[a] += 1;
      this.next[fill[b]] = a; this.cost[fill[b]] = l; fill[b] += 1;
    }
    // Build 113: each vertex's crease - how far its neighbours stand out along its normal (a valley: the gingival
    // margin, the cingulum's edge), over the length of its edges.
    const normal = new Float64Array(count * 3);
    for (let i = 0; i + 2 < tri.length; i += 3) {
      const a = tri[i] * 3, b = tri[i + 1] * 3, c = tri[i + 2] * 3;
      const ux = pts[b] - pts[a], uy = pts[b + 1] - pts[a + 1], uz = pts[b + 2] - pts[a + 2];
      const vx = pts[c] - pts[a], vy = pts[c + 1] - pts[a + 1], vz = pts[c + 2] - pts[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const k of [a, b, c]) { normal[k] += nx; normal[k + 1] += ny; normal[k + 2] += nz; }
    }
    const raw = new Float32Array(count);
    for (let v = 0; v < count; v += 1) {
      const l = Math.hypot(normal[v * 3], normal[v * 3 + 1], normal[v * 3 + 2]) || 1;
      let mx = 0, my = 0, mz = 0, edge = 0;
      const n = this.start[v + 1] - this.start[v];
      if (!n) continue;
      for (let k = this.start[v]; k < this.start[v + 1]; k += 1) { const u = this.next[k]; mx += pts[u * 3]; my += pts[u * 3 + 1]; mz += pts[u * 3 + 2]; edge += this.cost[k]; }
      mx = mx / n - pts[v * 3]; my = my / n - pts[v * 3 + 1]; mz = mz / n - pts[v * 3 + 2];
      raw[v] = ((mx * normal[v * 3] + my * normal[v * 3 + 1] + mz * normal[v * 3 + 2]) / l) / Math.max(1e-6, edge / n);
    }
    // Teeth are mostly convex: if most of the patch reads as a valley, its triangles are wound inwards.
    let mean = 0;
    for (let v = 0; v < count; v += 1) mean += raw[v];
    if (mean > 0) for (let v = 0; v < count; v += 1) raw[v] = -raw[v];
    // Eased over the neighbours (a scan's facets are noisy), then scaled: the top few per cent count as deep.
    const eased = Float32Array.from(raw);
    for (let pass = 0; pass < 2; pass += 1) {
      const from = Float32Array.from(eased);
      for (let v = 0; v < count; v += 1) { let sum = from[v], n = 1; for (let k = this.start[v]; k < this.start[v + 1]; k += 1) { sum += from[this.next[k]]; n += 1; } eased[v] = sum / n; }
    }
    const sorted = Array.from(eased).filter((x) => x > 0).sort((a, b) => a - b);
    const deep = sorted.length ? sorted[Math.floor(sorted.length * 0.9)] || 1 : 1;
    this.crease = new Float32Array(count);
    for (let v = 0; v < count; v += 1) this.crease[v] = Math.max(0, Math.min(1, eased[v] / deep));
    // A coarse grid of vertices for the nearest-vertex look-up.
    this.index = new Map();
    for (let v = 0; v < count; v += 1) {
      const k = cellKey(pts[v * 3], pts[v * 3 + 1], pts[v * 3 + 2]);
      const list = this.index.get(k);
      if (list) list.push(v); else this.index.set(k, [v]);
    }
  }
  /** Whether a point lies well inside the patch (a margin from its edge). */
  holds(p: ArrayLike<number>, margin = 3) {
    return p[0] > this.box[0] + margin && p[1] > this.box[1] + margin && p[2] > this.box[2] + margin && p[0] < this.box[3] - margin && p[1] < this.box[4] - margin && p[2] < this.box[5] - margin;
  }
  nearestVertex(p: ArrayLike<number>): number {
    let best = -1, bestD = Infinity;
    const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL), cz = Math.floor(p[2] / CELL);
    for (let r = 0; r < 6 && best < 0; r += 1) {
      for (let ox = -r; ox <= r; ox += 1) for (let oy = -r; oy <= r; oy += 1) for (let oz = -r; oz <= r; oz += 1) {
        if (Math.max(Math.abs(ox), Math.abs(oy), Math.abs(oz)) !== r) continue;
        const list = this.index.get(key3(cx + ox, cy + oy, cz + oz));
        if (!list) continue;
        for (const v of list) {
          const d = (this.xyz[v * 3] - p[0]) ** 2 + (this.xyz[v * 3 + 1] - p[1]) ** 2 + (this.xyz[v * 3 + 2] - p[2]) ** 2;
          if (d < bestD) { bestD = d; best = v; }
        }
      }
    }
    return best;
  }
  /** The shortest way over the surface from a to b (both on it), as points from a to b. */
  path(a: Vec3, b: Vec3, magnetic = true): Vec3[] {
    const s = this.nearestVertex(a), e = this.nearestVertex(b);
    if (s < 0 || e < 0) return [a, b];
    if (s === e) return [a, b];
    const count = this.xyz.length / 3;
    const dist = new Float64Array(count).fill(Infinity);
    const prev = new Int32Array(count).fill(-1);
    const heap = new MinHeap();
    dist[s] = 0; heap.push(s, 0);
    const ex = this.xyz[e * 3], ey = this.xyz[e * 3 + 1], ez = this.xyz[e * 3 + 2];
    const h = (v: number) => Math.hypot(this.xyz[v * 3] - ex, this.xyz[v * 3 + 1] - ey, this.xyz[v * 3 + 2] - ez) * (magnetic ? 0.2 : 1);
    while (heap.size) {
      const [v] = heap.pop();
      if (v === e) break;
      const dv = dist[v];
      for (let k = this.start[v]; k < this.start[v + 1]; k += 1) {
        // Build 113 (as exocad's magnetic margin): a step along a crease costs as little as a fifth.
        const u = this.next[k], d = dv + this.cost[k] * (magnetic ? 1 - 0.8 * this.crease[u] : 1);
        if (d < dist[u]) { dist[u] = d; prev[u] = v; heap.push(u, d + h(u)); }
      }
    }
    if (prev[e] < 0) return [a, b];
    const verts: number[] = [];
    for (let v = e; v >= 0; v = prev[v]) verts.push(v);
    verts.reverse();
    // Ends at the clicked points themselves; the path between eased (the edges zig-zag) and kept on the surface.
    let line: Vec3[] = [a, ...verts.slice(1, -1).map((v) => [this.xyz[v * 3], this.xyz[v * 3 + 1], this.xyz[v * 3 + 2]] as Vec3), b];
    line = resample(line, 0.15);
    const q = [0, 0, 0];
    for (let pass = 0; pass < 6; pass += 1) {
      line = line.map((p, i) => (i === 0 || i === line.length - 1 ? p : [0, 1, 2].map((k) => 0.25 * line[i - 1][k] + 0.5 * p[k] + 0.25 * line[i + 1][k]) as Vec3));
      line = line.map((p, i) => (i === 0 || i === line.length - 1 || this.surface.nearest(p[0], p[1], p[2], q) === Infinity ? p : [q[0], q[1], q[2]] as Vec3));
    }
    return line;
  }
  /** The whole line through the clicked points, stretch by stretch (closed: back to the first point too). */
  line(points: Vec3[], closed = false, magnetic = true): Vec3[] {
    if (points.length < 2) return points.slice();
    const out: Vec3[] = [];
    const stops = closed && points.length >= 3 ? [...points, points[0]] : points;
    for (let i = 0; i + 1 < stops.length; i += 1) {
      const part = this.path(stops[i], stops[i + 1], magnetic);
      out.push(...(i ? part.slice(1) : part));
    }
    return out;
  }
  /**
   * Build 113: the patch's triangles inside a closed margin (1), as a flood from the triangle nearest `seed`
   * that never crosses the line; null if it leaks round (the line not closed on the scan).
   */
  inside(loop: Vec3[], seed: ArrayLike<number>): Uint8Array | null {
    const triCount = this.tri.length / 3;
    const wall = new Uint8Array(triCount);
    const q = [0, 0, 0];
    // Every triangle the line runs through (sampled finely), and those it passes within a hair of.
    for (const p of resample(loop, 0.03)) {
      if (this.surface.nearest(p[0], p[1], p[2], q) < 0.15 && this.surface.lastTriangle >= 0) wall[this.surface.lastTriangle] = 1;
    }
    if (this.surface.nearest(seed[0], seed[1], seed[2], q) === Infinity || this.surface.lastTriangle < 0) return null;
    const start = this.surface.lastTriangle;
    if (wall[start]) return null;
    // Triangles beside each other across an edge.
    const byEdge = new Map<number, number[]>();
    const count = this.xyz.length / 3;
    for (let t = 0; t < triCount; t += 1) for (let j = 0; j < 3; j += 1) {
      const a = this.tri[t * 3 + j], b = this.tri[t * 3 + (j + 1) % 3];
      const k = a < b ? a * count + b : b * count + a;
      const list = byEdge.get(k);
      if (list) list.push(t); else byEdge.set(k, [t]);
    }
    const inside = new Uint8Array(triCount);
    const stack = [start];
    inside[start] = 1;
    let filled = 1;
    while (stack.length) {
      const t = stack.pop()!;
      for (let j = 0; j < 3; j += 1) {
        const a = this.tri[t * 3 + j], b = this.tri[t * 3 + (j + 1) % 3];
        for (const u of byEdge.get(a < b ? a * count + b : b * count + a) ?? []) {
          if (inside[u] || wall[u]) continue;
          inside[u] = 1; filled += 1; stack.push(u);
        }
      }
    }
    // The wall counts as inside (the margin itself is the tooth's).
    for (let t = 0; t < triCount; t += 1) if (wall[t]) inside[t] = 1;
    return filled > triCount * 0.6 ? null : inside;
  }
}

const CELL = 0.6;
const key3 = (ix: number, iy: number, iz: number) => (((ix & 1023) * 1024 + (iy & 1023)) * 1024 + (iz & 1023));
const cellKey = (x: number, y: number, z: number) => key3(Math.floor(x / CELL), Math.floor(y / CELL), Math.floor(z / CELL));

/** A patch box round some points (PATCH_REACH mm beyond them). */
export function patchBox(points: ArrayLike<number>[]): number[] {
  const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const p of points) for (let k = 0; k < 3; k += 1) { box[k] = Math.min(box[k], p[k] - PATCH_REACH); box[k + 3] = Math.max(box[k + 3], p[k] + PATCH_REACH); }
  return box;
}

/** Points along a polyline about every `step` mm (its ends kept). */
export function resample(line: Vec3[], step: number): Vec3[] {
  if (line.length < 2) return line.slice();
  const out: Vec3[] = [line[0]];
  let carry = 0;
  for (let i = 0; i + 1 < line.length; i += 1) {
    const a = line[i], b = line[i + 1];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    let t = step - carry;
    while (t < l) { out.push([a[0] + (b[0] - a[0]) * (t / l), a[1] + (b[1] - a[1]) * (t / l), a[2] + (b[2] - a[2]) * (t / l)]); t += step; }
    carry = l - (t - step);
  }
  out.push(line[line.length - 1]);
  return out;
}

class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() { return this.ids.length; }
  push(id: number, key: number) {
    const ids = this.ids, keys = this.keys;
    let i = ids.length;
    ids.push(id); keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p]; keys[i] = keys[p]; i = p;
    }
    ids[i] = id; keys[i] = key;
  }
  pop(): [number, number] {
    const ids = this.ids, keys = this.keys;
    const top: [number, number] = [ids[0], keys[0]];
    const lastId = ids.pop()!, lastKey = keys.pop()!;
    if (ids.length) {
      let i = 0;
      const n = ids.length;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, mk = lastKey;
        if (l < n && keys[l] < mk) { m = l; mk = keys[l]; }
        if (r < n && keys[r] < mk) { m = r; mk = keys[r]; }
        if (m === i) break;
        ids[i] = ids[m]; keys[i] = keys[m]; i = m;
      }
      ids[i] = lastId; keys[i] = lastKey;
    }
    return top;
  }
}

/**
 * A line made ready to erase a tooth past it: at each sample the way along it, the scan's outward normal and
 * the way past it (away from the incisal edge). `sign` is the scan's winding (1: its normals face out).
 */
export type MarginLine = { p: Vec3[]; t: Vec3[]; n: Vec3[]; b: Vec3[] };
export function prepareMargin(curve: Vec3[], surface: NearestSurface, sign: 1 | -1, incisal: Vec3): MarginLine | null {
  if (curve.length < 2) return null;
  const q = [0, 0, 0], nn = [0, 0, 0];
  const raw: Vec3[] = curve.map((p) => {
    if (surface.nearest(p[0], p[1], p[2], q) === Infinity || surface.lastTriangle < 0) return [0, 0, 0];
    surface.triangleNormal(surface.lastTriangle, nn);
    return [nn[0] * sign, nn[1] * sign, nn[2] * sign];
  });
  const unit = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const n = raw.map((_, i) => {
    const s: Vec3 = [0, 0, 0];
    for (let k = Math.max(0, i - 4); k <= Math.min(raw.length - 1, i + 4); k += 1) for (let j = 0; j < 3; j += 1) s[j] += raw[k][j];
    return unit(s);
  });
  const t = curve.map((_, i) => unit([0, 1, 2].map((k) => curve[Math.min(curve.length - 1, i + 1)][k] - curve[Math.max(0, i - 1)][k]) as Vec3));
  let b = n.map((ni, i) => unit([ni[1] * t[i][2] - ni[2] * t[i][1], ni[2] * t[i][0] - ni[0] * t[i][2], ni[0] * t[i][1] - ni[1] * t[i][0]]));
  if (b.reduce((sum, v) => sum + v[0] * incisal[0] + v[1] * incisal[1] + v[2] * incisal[2], 0) > 0) b = b.map((v) => [-v[0], -v[1], -v[2]] as Vec3);
  return { p: curve, t, n, b };
}

/** How far before (coronal of) the line the wax eases down onto the tooth, mm. */
export const MARGIN_BAND = 0.6;
/** How far past each end of the line it fades out, mm. */
export const MARGIN_END = 0.6;
const smooth01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/**
 * How much a wax vertex is erased by the line (0-1), judged at its nearest point `c` on the patient's surface
 * (normal `nc`, facing out): past the line on the same side of the tooth as the line, easing in over the band.
 */
export function pastMargin(line: MarginLine, c: ArrayLike<number>, nc: ArrayLike<number>): number {
  let best = Infinity, i = -1;
  for (let k = 0; k < line.p.length; k += 1) {
    const s = line.p[k], d = (c[0] - s[0]) ** 2 + (c[1] - s[1]) ** 2 + (c[2] - s[2]) ** 2;
    if (d < best) { best = d; i = k; }
  }
  if (i < 0) return 0;
  const p = line.p[i], d = [c[0] - p[0], c[1] - p[1], c[2] - p[2]];
  const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const past = dot(d, line.b[i]);
  const last = line.p.length - 1;
  const beyondEnd = i === 0 ? -dot(d, line.t[0]) : i === last ? dot(d, line.t[last]) : 0;
  // On the line's side of the tooth (its surface facing the same way), not round on the labial.
  const side = smooth01((dot(nc, line.n[i]) + 0.1) / 0.5);
  return smooth01((past + MARGIN_BAND) / MARGIN_BAND) * (1 - smooth01(beyondEnd / MARGIN_END)) * side;
}

/**
 * Build 113: a closed margin made ready to erase a tooth by: the patch it was drawn on, the triangles inside it,
 * and the line itself. A wax vertex whose nearest point on the patient's surface is outside the margin is erased;
 * inside, within MARGIN_BAND of the line, it eases down onto the tooth so the wax meets it at the margin.
 */
export type ClosedMargin = { patch: ScanPatch; inside: Uint8Array; line: Vec3[] };
export function closedMarginWeight(m: ClosedMargin, c: ArrayLike<number>): number {
  const q = [0, 0, 0];
  if (m.patch.surface.nearest(c[0], c[1], c[2], q) === Infinity || m.patch.surface.lastTriangle < 0) return 0;
  const inside = m.inside[m.patch.surface.lastTriangle] === 1;
  if (!inside) return 1;
  let best = Infinity;
  for (const p of m.line) { const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2; if (d < best) best = d; }
  return 1 - smooth01(Math.sqrt(best) / MARGIN_BAND);
}
