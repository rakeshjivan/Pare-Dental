/**
 * Build 111: Wax-up Studio's palatal (lingual) margin line, drawn as in CEREC's margin tool: between one click
 * and the next the line runs over the scan itself - the shortest way across the patient's surface, not a curve
 * pressed onto it - and while the pointer moves the next stretch is shown before it is clicked.
 *
 * The scan near the tooth is welded into a patch of vertices and edges; a path between two points is the
 * shortest along the patch's edges (Dijkstra), eased with a few passes that keep it on the surface.
 */
import { NearestSurface, soupWithin } from "@/lib/nearestSurface";
import { sameTripleIds } from "@/lib/dentalMesh";

export type Vec3 = [number, number, number];

/** How far round a line the scan is taken into the patch, mm. */
const PATCH_REACH = 12;
/** Pare Dental (smooth margin): smoothing passes over a whole margin, and over the stretch shown under the pointer. */
export const MARGIN_SMOOTH_PASSES = 24;
const PREVIEW_SMOOTH_PASSES = 8;
/** How freely a placed point moves with the smoothing (1: as the line between): 0 - the line goes through every point placed. */
const ANCHOR_HOLD = 0;

export class ScanPatch {
  readonly xyz: Float64Array;
  private readonly start: Int32Array;
  private readonly next: Int32Array;
  private readonly cost: Float64Array;
  readonly surface: NearestSurface;
  private readonly index: Map<number, number[]>;
  readonly box: number[];
  /** For checks: why the last inside() came out as it did. */
  why = "";
  /** The patch's triangles (vertex indices, 3 a triangle), in the order of its surface's soup. */
  readonly tri: Int32Array;
  /** Build 113: how much each vertex lies in a crease (the gum meeting the tooth), 0 none to 1 deep - the magnetic line's pull. */
  readonly crease: Float32Array;
  constructor(scan: ArrayLike<number>, box: number[]) {
    this.box = box;
    const soup = soupWithin(scan, box);
    this.surface = new NearestSurface(soup, 3);
    // Pare Dental (lag-free margin): corners welded at 0.1 micron in a typed table (was a string per corner).
    const corners = Math.floor(soup.length / 3);
    const welded = sameTripleIds(corners, (i, k) => Math.round(soup[i * 3 + k] * 1e4));
    const pts = new Float64Array(welded.count * 3);
    for (let c = corners - 1; c >= 0; c -= 1) { const v = welded.ids[c]; pts[v * 3] = soup[c * 3]; pts[v * 3 + 1] = soup[c * 3 + 1]; pts[v * 3 + 2] = soup[c * 3 + 2]; }
    const tri = welded.ids;
    this.xyz = pts;
    this.tri = tri;
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
    for (let r = 0; r < 14 && best < 0; r += 1) {
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
  /**
   * Pare Dental (lag-free margin): the shortest ways from one vertex to every other in the patch, kept - so the stretch
   * from the last point placed to the pointer, worked out again on every move, is only a walk back along this tree.
   */
  private treeFrom = -1;
  private treeMagnetic = true;
  private treePrev: Int32Array | null = null;
  private treeOf(s: number, magnetic: boolean): Int32Array {
    if (this.treePrev && this.treeFrom === s && this.treeMagnetic === magnetic) return this.treePrev;
    const count = this.xyz.length / 3;
    const dist = new Float64Array(count).fill(Infinity);
    const prev = new Int32Array(count).fill(-1);
    const heap = new MinHeap();
    dist[s] = 0; heap.push(s, 0);
    while (heap.size) {
      const [v, dv] = heap.pop();
      if (dv > dist[v]) continue;
      for (let k = this.start[v]; k < this.start[v + 1]; k += 1) {
        // Build 113 (as exocad's magnetic margin): a step along a crease costs as little as a fifth.
        const u = this.next[k], d = dv + this.cost[k] * (magnetic ? 1 - 0.8 * this.crease[u] : 1);
        if (d < dist[u]) { dist[u] = d; prev[u] = v; heap.push(u, d); }
      }
    }
    this.treeFrom = s; this.treeMagnetic = magnetic; this.treePrev = prev;
    return prev;
  }
  /** One way from s to e (A*, aimed at e): for a stretch between two placed points, not worth a whole tree. */
  private searchTo(s: number, e: number, magnetic: boolean): Int32Array {
    const count = this.xyz.length / 3;
    const dist = new Float64Array(count).fill(Infinity);
    const prev = new Int32Array(count).fill(-1);
    const heap = new MinHeap();
    dist[s] = 0; heap.push(s, 0);
    const ex = this.xyz[e * 3], ey = this.xyz[e * 3 + 1], ez = this.xyz[e * 3 + 2];
    const scale = magnetic ? 0.2 : 1;
    while (heap.size) {
      const [v, f] = heap.pop();
      if (v === e) break;
      const dv = dist[v];
      if (f - Math.hypot(this.xyz[v * 3] - ex, this.xyz[v * 3 + 1] - ey, this.xyz[v * 3 + 2] - ez) * scale > dv + 1e-9) continue;
      for (let k = this.start[v]; k < this.start[v + 1]; k += 1) {
        const u = this.next[k], d = dv + this.cost[k] * (magnetic ? 1 - 0.8 * this.crease[u] : 1);
        if (d < dist[u]) { dist[u] = d; prev[u] = v; heap.push(u, d + Math.hypot(this.xyz[u * 3] - ex, this.xyz[u * 3 + 1] - ey, this.xyz[u * 3 + 2] - ez) * scale); }
      }
    }
    return prev;
  }
  /** The way over the patch's edges from a to b, unsmoothed (a and b themselves at the ends); `kept`: from the tree kept from a. */
  private rawPath(a: Vec3, b: Vec3, magnetic: boolean, kept = false): Vec3[] {
    const s = this.nearestVertex(a), e = this.nearestVertex(b);
    if (s < 0 || e < 0 || s === e) return [a, b];
    const prev = kept ? this.treeOf(s, magnetic) : this.searchTo(s, e, magnetic);
    if (prev[e] < 0) return [a, b];
    const verts: number[] = [];
    for (let v = e; v >= 0 && v !== s; v = prev[v]) verts.push(v);
    verts.reverse();
    return [a, ...verts.slice(0, -1).map((v) => [this.xyz[v * 3], this.xyz[v * 3 + 1], this.xyz[v * 3 + 2]] as Vec3), b];
  }
  /**
   * Pare Dental (smooth margin): a line smoothed as one curve and kept on the scan - Taubin passes (a step in, a step back
   * out, so it does not shrink), each point put back on the surface after each pass. `anchors` (the points the dentist
   * placed) are held more firmly, so the line runs smoothly through them rather than turning a corner at each; an open
   * line's two ends stay where they are.
   */
  smoothOnSurface(line: Vec3[], closed: boolean, anchors: Vec3[] = [], passes = MARGIN_SMOOTH_PASSES): Vec3[] {
    let pts = resample(withoutHairpins(line, closed, anchors), 0.15);
    if (closed && pts.length > 2) { const a = pts[0], b = pts[pts.length - 1]; if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 0.05) pts = pts.slice(0, -1); }
    const n = pts.length;
    if (n < 3) return pts;
    const hold = new Float64Array(n).fill(1);
    for (const a of anchors) {
      let best = -1, bestD = Infinity;
      for (let i = 0; i < n; i += 1) { const d = (pts[i][0] - a[0]) ** 2 + (pts[i][1] - a[1]) ** 2 + (pts[i][2] - a[2]) ** 2; if (d < bestD) { bestD = d; best = i; } }
      if (best >= 0) { hold[best] = ANCHOR_HOLD; pts[best] = [a[0], a[1], a[2]]; }
    }
    if (!closed) { hold[0] = 0; hold[n - 1] = 0; }
    const xyz = new Float64Array(n * 3), nxt = new Float64Array(n * 3), q = [0, 0, 0];
    pts.forEach((p, i) => { xyz[i * 3] = p[0]; xyz[i * 3 + 1] = p[1]; xyz[i * 3 + 2] = p[2]; });
    for (let pass = 0; pass < passes; pass += 1) {
      for (const factor of [0.5, -0.53]) {
        for (let i = 0; i < n; i += 1) {
          const w = hold[i] * factor;
          const a = closed ? (i - 1 + n) % n : Math.max(0, i - 1), b = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
          for (let k = 0; k < 3; k += 1) nxt[i * 3 + k] = xyz[i * 3 + k] + w * ((xyz[a * 3 + k] + xyz[b * 3 + k]) / 2 - xyz[i * 3 + k]);
        }
        xyz.set(nxt);
      }
      for (let i = 0; i < n; i += 1) {
        if (hold[i] === 0) continue;
        if (this.surface.nearest(xyz[i * 3], xyz[i * 3 + 1], xyz[i * 3 + 2], q) !== Infinity) { xyz[i * 3] = q[0]; xyz[i * 3 + 1] = q[1]; xyz[i * 3 + 2] = q[2]; }
      }
    }
    const out: Vec3[] = [];
    for (let i = 0; i < n; i += 1) out.push([xyz[i * 3], xyz[i * 3 + 1], xyz[i * 3 + 2]]);
    if (closed) out.push(out[0]);
    return out;
  }
  /** The shortest way over the surface from a to b (both on it), as points from a to b, smoothed and on the surface. */
  path(a: Vec3, b: Vec3, magnetic = true): Vec3[] {
    return this.smoothOnSurface(this.rawPath(a, b, magnetic, true), false, [], PREVIEW_SMOOTH_PASSES);
  }
  /** The whole line through the clicked points (closed: back to the first point too), smoothed as one curve. */
  line(points: Vec3[], closed = false, magnetic = true): Vec3[] {
    if (points.length < 2) return points.slice();
    const out: Vec3[] = [];
    const stops = closed && points.length >= 3 ? [...points, points[0]] : points;
    for (let i = 0; i + 1 < stops.length; i += 1) {
      const part = this.rawPath(stops[i], stops[i + 1], magnetic);
      out.push(...(i ? part.slice(1) : part));
    }
    return this.smoothOnSurface(out, closed && points.length >= 3, points);
  }
  /**
   * Build 113: the patch's triangles inside a closed margin (1), as a flood from the triangle nearest `seed`
   * that never crosses the line; null if it leaks round (the line not closed on the scan).
   */
  inside(loop: Vec3[], up: ArrayLike<number>, within?: (x: number, y: number, z: number) => boolean): Uint8Array | null {
    const triCount = this.tri.length / 3;
    const wall = new Uint8Array(triCount);
    const q = [0, 0, 0];
    // Every triangle the line runs through (sampled finely), and every triangle round the scan's corners it passes
    // (the line runs along the scan's edges, so a wall of single triangles would leave gaps along it).
    const byVertex: number[][] = Array.from({ length: this.xyz.length / 3 }, () => []);
    for (let t = 0; t < triCount; t += 1) for (let j = 0; j < 3; j += 1) byVertex[this.tri[t * 3 + j]].push(t);
    for (const p of resample(loop, 0.03)) {
      if (this.surface.nearest(p[0], p[1], p[2], q) < 0.15 && this.surface.lastTriangle >= 0) wall[this.surface.lastTriangle] = 1;
      const v = this.nearestVertex(p);
      if (v >= 0 && Math.hypot(this.xyz[v * 3] - p[0], this.xyz[v * 3 + 1] - p[1], this.xyz[v * 3 + 2] - p[2]) < 0.25) for (const t of byVertex[v]) wall[t] = 1;
    }
    const x = this.xyz;
    const centre = (t: number, k: number) => (x[this.tri[t * 3] * 3 + k] + x[this.tri[t * 3 + 1] * 3 + k] + x[this.tri[t * 3 + 2] * 3 + k]) / 3;
    const allowed = new Uint8Array(triCount);
    for (let t = 0; t < triCount; t += 1) allowed[t] = wall[t] ? 0 : !within || within(centre(t, 0), centre(t, 1), centre(t, 2)) ? 1 : 0;
    // Triangles beside each other across an edge.
    const byEdge = new Map<number, number[]>();
    const count = x.length / 3;
    for (let t = 0; t < triCount; t += 1) for (let j = 0; j < 3; j += 1) {
      const a = this.tri[t * 3 + j], b = this.tri[t * 3 + (j + 1) % 3];
      const k = a < b ? a * count + b : b * count + a;
      const list = byEdge.get(k);
      if (list) list.push(t); else byEdge.set(k, [t]);
    }
    // Build 113: the patch split at the line into pieces; the crown is the piece standing furthest towards the incisal edge
    // (the gum round it lies apical of the margin) - no seed to land on the line.
    const piece = new Int32Array(triCount).fill(-1);
    const pieces: Array<{ size: number; up: number }> = [];
    for (let s0 = 0; s0 < triCount; s0 += 1) {
      if (!allowed[s0] || piece[s0] >= 0) continue;
      const id = pieces.length;
      let size = 0, height = 0;
      const stack = [s0];
      piece[s0] = id;
      while (stack.length) {
        const t = stack.pop()!;
        size += 1; height += centre(t, 0) * up[0] + centre(t, 1) * up[1] + centre(t, 2) * up[2];
        for (let j = 0; j < 3; j += 1) {
          const a = this.tri[t * 3 + j], b = this.tri[t * 3 + (j + 1) % 3];
          for (const u of byEdge.get(a < b ? a * count + b : b * count + a) ?? []) {
            if (!allowed[u] || piece[u] >= 0) continue;
            piece[u] = id; stack.push(u);
          }
        }
      }
      pieces.push({ size, up: height / Math.max(1, size) });
    }
    let best = -1;
    for (let i = 0; i < pieces.length; i += 1) if (pieces[i].size >= 40 && (best < 0 || pieces[i].up > pieces[best].up)) best = i;
    if (best < 0) { this.why = `no piece (${pieces.length} pieces)`; return null; }
    const inside = new Uint8Array(triCount);
    let filled = 0;
    for (let t = 0; t < triCount; t += 1) if (piece[t] === best || wall[t]) { inside[t] = 1; if (piece[t] === best) filled += 1; }
    const big = pieces.filter((p) => p.size >= 40).length;
    this.why = `${filled} of ${triCount} inside, ${big} pieces${big < 2 ? " (the line does not close)" : ""}`;
    return big < 2 ? null : inside;
  }
}

const CELL = 0.6;
const key3 = (ix: number, iy: number, iz: number) => (((ix & 1023) * 1024 + (iy & 1023)) * 1024 + (iz & 1023));
const cellKey = (x: number, y: number, z: number) => key3(Math.floor(x / CELL), Math.floor(y / CELL), Math.floor(z / CELL));

/**
 * Pare Dental (smooth margin): the line without its hairpins - where the way over the edges runs a step past a placed
 * point and comes back (the nearest vertex to a click is often just beyond it), the point that turns back is dropped -
 * only within 0.4 mm of a placed point, so a stretch the dentist did draw out and back is kept.
 */
export function withoutHairpins(line: Vec3[], closed: boolean, anchors: Vec3[]): Vec3[] {
  const nearClick = (p: Vec3) => anchors.some((a) => (a[0] - p[0]) ** 2 + (a[1] - p[1]) ** 2 + (a[2] - p[2]) ** 2 < 0.16);
  const isClick = (p: Vec3) => anchors.some((a) => a[0] === p[0] && a[1] === p[1] && a[2] === p[2]);
  let pts = line.slice();
  for (let round = 0; round < 8; round += 1) {
    const keep: Vec3[] = [];
    let dropped = false;
    const n = pts.length;
    for (let i = 0; i < n; i += 1) {
      const ends = !closed && (i === 0 || i === n - 1);
      const a = keep.length ? keep[keep.length - 1] : pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
      if (!ends && n > 4 && nearClick(b) && !isClick(b)) {
        const u0 = b[0] - a[0], u1 = b[1] - a[1], u2 = b[2] - a[2], v0 = c[0] - b[0], v1 = c[1] - b[1], v2 = c[2] - b[2];
        const lu = Math.hypot(u0, u1, u2), lv = Math.hypot(v0, v1, v2);
        // Turned back by more than 110 degrees (or on top of the last point): not part of the line.
        if (lu < 1e-4 || (lv > 1e-4 && (u0 * v0 + u1 * v1 + u2 * v2) / (lu * lv) < -0.34)) { dropped = true; continue; }
      }
      keep.push(b);
    }
    pts = keep;
    if (!dropped) break;
  }
  return pts;
}

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
/** Build 117: a boundary line's wax eases down over this much before the line, mm - a feathered finish to smooth, not a step. */
export const BOUNDARY_BAND = 1.2;
export function pastMargin(line: MarginLine, c: ArrayLike<number>, nc: ArrayLike<number>, band = MARGIN_BAND): number {
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
  return smooth01((past + band) / band) * (1 - smooth01(beyondEnd / MARGIN_END)) * side;
}

/**
 * Build 113: a closed margin made ready to erase a tooth by: the patch it was drawn on, the triangles inside it,
 * and the line itself. A wax vertex whose nearest point on the patient's surface is outside the margin is erased;
 * inside, within MARGIN_BAND of the line, it eases down onto the tooth so the wax meets it at the margin.
 */
export type ClosedMargin = { surface: NearestSurface; inside: Uint8Array; line: Vec3[]; gum?: Vec3[]; /** Build 116: the gum alone (no tooth), to push wax under. */ gumSurface?: NearestSurface; /** Build 116: each triangle of `surface` that is gum (not a tooth); without it, everything outside is taken as gum. */ onGum?: Uint8Array };
/**
 * Build 116: the wax's cervical taper - how thick (mm, above the patient's tooth) the wax may be at a distance d
 * (mm) from the gum margin, on the tooth. Measured on a professional anterior wax-up: about 0.06 mm within 0.25 mm
 * of the margin, 0.13 at 0.5, 0.20 at 1.0, 0.27 at 1.5 (medians) - so the wax finishes as a feather edge on the
 * tooth and a silicone index cut at the gum line seats and transfers it without cervical bulk.
 */
export const TAPER_SLOPE = 0.3;
export const taperLimit = (d: number) => Math.max(0, d) * TAPER_SLOPE + 0.4 * Math.max(0, d - 1.5) ** 2;
/** A soft cap: thickness t unchanged below half the limit, easing to the limit above it (no corner). */
export function softCap(t: number, lim: number) {
  if (lim <= 1e-4) return 0;
  const x = t / lim;
  return x <= 0.5 ? t : lim * (0.5 + 0.5 * Math.tanh((x - 0.5) / 0.5));
}
/**
 * Where a point on the patient's surface stands against a closed margin: whether it is on the tooth (inside), and
 * how far it is from the gum part of the margin (not the contacts with the teeth beside it), mm.
 */
/** Build 116: how far from the gum margin is looked, mm - past it the taper no longer limits the wax. */
export const GUM_LOOK = 4;
const GUM_CELL = 1;
const gumGrids = new WeakMap<Vec3[], Map<string, Vec3[]>>();
/** The distance from a point to the nearest of `points`, looked for only within GUM_LOOK (GUM_LOOK if none is). */
function gumDistance(points: Vec3[], c: ArrayLike<number>, nearest?: number[]): number {
  let grid = gumGrids.get(points);
  if (!grid) {
    grid = new Map();
    for (const p of points) {
      const k = `${Math.floor(p[0] / GUM_CELL)},${Math.floor(p[1] / GUM_CELL)},${Math.floor(p[2] / GUM_CELL)}`;
      const list = grid.get(k);
      if (list) list.push(p); else grid.set(k, [p]);
    }
    gumGrids.set(points, grid);
  }
  const cx = Math.floor(c[0] / GUM_CELL), cy = Math.floor(c[1] / GUM_CELL), cz = Math.floor(c[2] / GUM_CELL);
  const reach = Math.ceil(GUM_LOOK / GUM_CELL);
  let best = GUM_LOOK * GUM_LOOK;
  // Ring by ring outwards: once a ring lies further than the best found, nothing nearer is left.
  for (let r = 0; r <= reach; r += 1) {
    if (r > 0 && ((r - 1) * GUM_CELL) ** 2 > best) break;
    for (let x = cx - r; x <= cx + r; x += 1) for (let y = cy - r; y <= cy + r; y += 1) for (let z = cz - r; z <= cz + r; z += 1) {
      if (Math.max(Math.abs(x - cx), Math.abs(y - cy), Math.abs(z - cz)) !== r) continue;
      const list = grid.get(`${x},${y},${z}`);
      if (!list) continue;
      for (const p of list) { const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2; if (d < best) { best = d; if (nearest) { nearest[0] = p[0]; nearest[1] = p[1]; nearest[2] = p[2]; nearest[3] = 1; } } }
    }
  }
  return Math.sqrt(best);
}
/** Build 116: the nearest point of a closed margin's gum line to a point (within GUM_LOOK), or null. */
export function gumLinePoint(m: ClosedMargin, c: ArrayLike<number>): Vec3 | null {
  const at = [0, 0, 0, 0];
  gumDistance(m.gum ?? m.line, c, at);
  return at[3] ? [at[0], at[1], at[2]] : null;
}
export function closedMarginAt(m: ClosedMargin, c: ArrayLike<number>): { inside: boolean; gum: number; overGum: boolean } | null {
  const q = [0, 0, 0];
  if (m.surface.nearest(c[0], c[1], c[2], q) === Infinity || m.surface.lastTriangle < 0) return null;
  const t = m.surface.lastTriangle;
  const inside = m.inside[t] === 1;
  return { inside, gum: gumDistance(m.gum ?? m.line, c), overGum: !inside && (!m.onGum || m.onGum[t] === 1) };
}
export function closedMarginWeight(m: ClosedMargin, c: ArrayLike<number>): number {
  const q = [0, 0, 0];
  if (m.surface.nearest(c[0], c[1], c[2], q) === Infinity || m.surface.lastTriangle < 0) return 0;
  const inside = m.inside[m.surface.lastTriangle] === 1;
  if (!inside) return 1;
  let best = Infinity;
  for (const p of m.line) { const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2; if (d < best) best = d; }
  return 1 - smooth01(Math.sqrt(best) / MARGIN_BAND);
}

/**
 * Build 114: a tooth's margin from the tooth finder - the scan's triangles labelled with its number are the tooth,
 * the edge between them and the rest (gum, palate, the teeth beside it) is its margin, all the way round.
 * `scan` is a world soup, `labels` each of its triangles' FDI number; only what lies in `box` is used.
 */
export function marginFromLabels(scan: ArrayLike<number>, labels: ArrayLike<number>, fdi: number, box: number[]): ClosedMargin | null {
  const picked: number[] = [];
  const inBox = (x: number, y: number, z: number) => x >= box[0] && y >= box[1] && z >= box[2] && x <= box[3] && y <= box[4] && z <= box[5];
  for (let t = 0; t < labels.length; t += 1) {
    const o = t * 9;
    if (inBox(scan[o], scan[o + 1], scan[o + 2]) || inBox(scan[o + 3], scan[o + 4], scan[o + 5]) || inBox(scan[o + 6], scan[o + 7], scan[o + 8])) picked.push(t);
  }
  const soup = new Float32Array(picked.length * 9);
  const inside = new Uint8Array(picked.length);
  let count = 0;
  picked.forEach((t, i) => { for (let k = 0; k < 9; k += 1) soup[i * 9 + k] = scan[t * 9 + k]; if (labels[t] === fdi) { inside[i] = 1; count += 1; } });
  if (count < 40) return null;
  // The margin itself: the edges where a tooth triangle meets one that is not (welded corners), as points along them.
  const key = (i: number, k: number) => `${Math.round(soup[i * 9 + k * 3] * 1e4)},${Math.round(soup[i * 9 + k * 3 + 1] * 1e4)},${Math.round(soup[i * 9 + k * 3 + 2] * 1e4)}`;
  const edges = new Map<string, { a: number; b: number; inside: number; outside: number; gum: number }>();
  for (let i = 0; i < picked.length; i += 1) for (let k = 0; k < 3; k += 1) {
    const ka = key(i, k), kb = key(i, (k + 1) % 3);
    const e = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    let entry = edges.get(e);
    if (!entry) { entry = { a: i * 9 + k * 3, b: i * 9 + ((k + 1) % 3) * 3, inside: 0, outside: 0, gum: 0 }; edges.set(e, entry); }
    if (inside[i]) entry.inside += 1; else { entry.outside += 1; if (!labels[picked[i]]) entry.gum += 1; }
  }
  const line: Vec3[] = [], gum: Vec3[] = [];
  for (const e of edges.values()) if (e.inside && e.outside) {
    const mid: Vec3 = [(soup[e.a] + soup[e.b]) / 2, (soup[e.a + 1] + soup[e.b + 1]) / 2, (soup[e.a + 2] + soup[e.b + 2]) / 2];
    line.push(mid);
    if (e.gum) gum.push(mid); // the gum margin, not where the tooth touches the one beside it
  }
  if (!line.length) return null;
  // The gum alone: what is not a tooth there (labelled 0).
  const gumTris: number[] = [];
  picked.forEach((t, i) => { if (!labels[t]) gumTris.push(i); });
  const gumSoup = new Float32Array(gumTris.length * 9);
  gumTris.forEach((i, k) => { for (let j = 0; j < 9; j += 1) gumSoup[k * 9 + j] = soup[i * 9 + j]; });
  const onGum = new Uint8Array(picked.length);
  picked.forEach((t, i) => { if (!labels[t]) onGum[i] = 1; });
  return { surface: new NearestSurface(soup, 3), inside, line, gum: gum.length ? gum : line, onGum, ...(gumTris.length >= 40 ? { gumSurface: new NearestSurface(gumSoup, 3) } : {}) };
}
