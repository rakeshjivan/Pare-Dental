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
  path(a: Vec3, b: Vec3): Vec3[] {
    const s = this.nearestVertex(a), e = this.nearestVertex(b);
    if (s < 0 || e < 0) return [a, b];
    if (s === e) return [a, b];
    const count = this.xyz.length / 3;
    const dist = new Float64Array(count).fill(Infinity);
    const prev = new Int32Array(count).fill(-1);
    const heap = new MinHeap();
    dist[s] = 0; heap.push(s, 0);
    const ex = this.xyz[e * 3], ey = this.xyz[e * 3 + 1], ez = this.xyz[e * 3 + 2];
    const h = (v: number) => Math.hypot(this.xyz[v * 3] - ex, this.xyz[v * 3 + 1] - ey, this.xyz[v * 3 + 2] - ez);
    while (heap.size) {
      const [v] = heap.pop();
      if (v === e) break;
      const dv = dist[v];
      for (let k = this.start[v]; k < this.start[v + 1]; k += 1) {
        const u = this.next[k], d = dv + this.cost[k];
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
  /** The whole line through the clicked points, stretch by stretch. */
  line(points: Vec3[]): Vec3[] {
    if (points.length < 2) return points.slice();
    const out: Vec3[] = [];
    for (let i = 0; i + 1 < points.length; i += 1) {
      const part = this.path(points[i], points[i + 1]);
      out.push(...(i ? part.slice(1) : part));
    }
    return out;
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
