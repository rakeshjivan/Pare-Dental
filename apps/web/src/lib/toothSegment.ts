/**
 * Build 94: the teeth on a scan with their FDI numbers - cleaning, numbering and landmarks from labels.
 * Build 277 (Rakesh): the tooth finder network that made the labels is removed (its training data is for
 * non-commercial use only); what is left works on labels from any source.
 *
 * 1. The scan, in its arch frame (teeth up, front at -y), reduced to the network's 16,000 triangles;
 *    each triangle its centre and normal, centred and scaled into the unit sphere.
 * 2. The network labels each triangle gum or a tooth (1-8 on either side).
 * 3. Cleaning: islands of a label too small to be a tooth go to the label around them; two pieces
 *    sharing a long border are one tooth the network split. Each piece left is a tooth.
 * 4. Numbering by where the teeth stand, not only by what the network says: out from the midline on
 *    each side, the numbers rise (gaps allowed, for missing teeth), chosen to agree with the network
 *    most. The quadrant from the side of the midline - so a numbering slip, or a tooth the network
 *    gave the other side's label, is put right.
 * 5. Each triangle of the full scan takes the label of the nearest reduced triangle.
 * 6. Build 101: the border between the teeth and the gum settled again on the full scan, into the
 *    margin's groove (lib/gumLine), so the gum line is clean rather than stepped.
 */
import * as THREE from "three";
import { weld, type Mesh } from "@/lib/dentalMesh";

/** The network's points: its input is always this many. */
export const NET_POINTS = 16000;
/** A piece of one label smaller than this is not a tooth, mm². */
export const TOOTH_MIN_AREA = 6;
/** A piece is part of its neighbour when their shared border is at least this share of its outline... */
export const SPLIT_BORDER_SHARE = 0.25;
/** ...and the smaller is less than this share of a typical tooth's area. */
export const SPLIT_PIECE_SHARE = 0.4;
/** A crown this many times a front tooth's is a molar's (6-8); and how much counts against numbering it lower. */
export const MOLAR_SIZE = 1.7;
export const SIZE_WEIGHT = 10;

/** Points in a regular grid of cubes, for nearest-neighbour searches. */
class CubeGrid {
  readonly min: [number, number, number];
  readonly size: number;
  readonly dims: [number, number, number];
  readonly start: Int32Array;
  readonly order: Int32Array;
  constructor(readonly p: Float32Array, perCell = 4) {
    const n = p.length / 3;
    const lo: [number, number, number] = [Infinity, Infinity, Infinity], hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i += 1) for (let k = 0; k < 3; k += 1) { lo[k] = Math.min(lo[k], p[i * 3 + k]); hi[k] = Math.max(hi[k], p[i * 3 + k]); }
    const ext = [0, 1, 2].map((k) => Math.max(1e-6, hi[k] - lo[k]));
    // Scans are surfaces: points spread over an area, so size the cubes by the two largest extents.
    const sorted = [...ext].sort((a, b) => b - a);
    this.size = Math.max(1e-6, Math.sqrt((sorted[0] * sorted[1] * perCell) / Math.max(1, n)));
    this.min = lo;
    this.dims = [0, 1, 2].map((k) => Math.max(1, Math.ceil(ext[k] / this.size) + 1)) as [number, number, number];
    const cells = this.dims[0] * this.dims[1] * this.dims[2];
    const cellOf = new Int32Array(n);
    this.start = new Int32Array(cells + 1);
    for (let i = 0; i < n; i += 1) { cellOf[i] = this.cell(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]); this.start[cellOf[i] + 1] += 1; }
    for (let c = 0; c < cells; c += 1) this.start[c + 1] += this.start[c];
    const fill = this.start.slice(0, cells);
    this.order = new Int32Array(n);
    for (let i = 0; i < n; i += 1) this.order[fill[cellOf[i]]++] = i;
  }
  private axis(v: number, k: number) { return Math.max(0, Math.min(this.dims[k] - 1, Math.floor((v - this.min[k]) / this.size))); }
  private cell(x: number, y: number, z: number) { return (this.axis(x, 0) * this.dims[1] + this.axis(y, 1)) * this.dims[2] + this.axis(z, 2); }
  /** The k nearest points to (x, y, z), nearest first, into idx/dist (length k). */
  nearest(x: number, y: number, z: number, k: number, idx: Int32Array, dist: Float32Array, at = 0) {
    const n = this.p.length / 3;
    k = Math.min(k, n);
    const cx = this.axis(x, 0), cy = this.axis(y, 1), cz = this.axis(z, 2);
    let found = 0;
    // Distances kept squared while searching; a sorted list of the best k.
    for (let i = 0; i < k; i += 1) { dist[at + i] = Infinity; idx[at + i] = -1; }
    const maxRing = Math.max(this.dims[0], this.dims[1], this.dims[2]);
    for (let r = 0; r <= maxRing; r += 1) {
      for (let ix = cx - r; ix <= cx + r; ix += 1) {
        if (ix < 0 || ix >= this.dims[0]) continue;
        for (let iy = cy - r; iy <= cy + r; iy += 1) {
          if (iy < 0 || iy >= this.dims[1]) continue;
          for (let iz = cz - r; iz <= cz + r; iz += 1) {
            if (iz < 0 || iz >= this.dims[2]) continue;
            // Only the shell of the ring is new.
            if (Math.max(Math.abs(ix - cx), Math.abs(iy - cy), Math.abs(iz - cz)) !== r) continue;
            const c = (ix * this.dims[1] + iy) * this.dims[2] + iz;
            for (let s = this.start[c], e = this.start[c + 1]; s < e; s += 1) {
              const j = this.order[s];
              const dx = this.p[j * 3] - x, dy = this.p[j * 3 + 1] - y, dz = this.p[j * 3 + 2] - z;
              const d = dx * dx + dy * dy + dz * dz;
              if (d >= dist[at + k - 1]) continue;
              let q = k - 1;
              while (q > 0 && dist[at + q - 1] > d) { dist[at + q] = dist[at + q - 1]; idx[at + q] = idx[at + q - 1]; q -= 1; }
              dist[at + q] = d; idx[at + q] = j;
              if (found < k) found += 1;
            }
          }
        }
      }
      // Everything within r cubes of the query's cube has been seen: done when the kth is closer.
      if (found >= k && dist[at + k - 1] <= (r * this.size) ** 2) break;
    }
    for (let i = 0; i < k; i += 1) dist[at + i] = Math.sqrt(dist[at + i]);
  }
}


// ---------------------------------------------------------------------------------------------
// Cleaning and numbering

/** Triangle neighbours across shared edges, and each shared edge's length. */
function triangleNeighbours(tri: Float32Array, count: number) {
  const m: Mesh = weld(tri, 1e-5);
  // weld keeps triangles in order unless it drops a degenerate one; map by position to be safe.
  const edges = new Map<string, number>();
  const nb: Array<Array<[number, number]>> = Array.from({ length: count }, () => []);
  const faceOf: number[] = [];
  // Weld drops folded triangles; recover each welded face's source by matching its centre.
  const n = m.f.length / 3;
  if (n === count) for (let t = 0; t < n; t += 1) faceOf.push(t);
  else {
    const key = (x: number, y: number, z: number) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    const src = new Map<string, number>();
    for (let t = 0; t < count; t += 1) src.set(key((tri[t * 9] + tri[t * 9 + 3] + tri[t * 9 + 6]) / 3, (tri[t * 9 + 1] + tri[t * 9 + 4] + tri[t * 9 + 7]) / 3, (tri[t * 9 + 2] + tri[t * 9 + 5] + tri[t * 9 + 8]) / 3), t);
    for (let t = 0; t < n; t += 1) {
      const c = [0, 1, 2].map((k) => (m.v[m.f[t * 3] * 3 + k] + m.v[m.f[t * 3 + 1] * 3 + k] + m.v[m.f[t * 3 + 2] * 3 + k]) / 3);
      faceOf.push(src.get(key(c[0], c[1], c[2])) ?? -1);
    }
  }
  for (let t = 0; t < n; t += 1) {
    const ft = faceOf[t];
    if (ft < 0) continue;
    for (let k = 0; k < 3; k += 1) {
      const a = m.f[t * 3 + k], b = m.f[t * 3 + ((k + 1) % 3)];
      const e = a < b ? `${a},${b}` : `${b},${a}`;
      const other = edges.get(e);
      if (other === undefined) { edges.set(e, ft); continue; }
      const len = Math.hypot(m.v[a * 3] - m.v[b * 3], m.v[a * 3 + 1] - m.v[b * 3 + 1], m.v[a * 3 + 2] - m.v[b * 3 + 2]);
      nb[ft].push([other, len]); nb[other].push([ft, len]);
    }
  }
  return nb;
}

/** The network's class to a tooth number 1-8 (0 gum): classes 1-8 one side, 9-16 the other. */
export const classNumber = (c: number) => (c >= 1 && c <= 16 ? ((c - 1) % 8) + 1 : 0);

/** Pieces of `label` (connected triangles of one value). */
function pieces(label: Int32Array, nb: Array<Array<[number, number]>>) {
  const piece = new Int32Array(label.length).fill(-1);
  const list: number[][] = [];
  for (let s = 0; s < label.length; s += 1) {
    if (piece[s] >= 0) continue;
    const id = list.length, faces = [s];
    piece[s] = id;
    for (let q = 0; q < faces.length; q += 1) for (const [o] of nb[faces[q]]) if (piece[o] < 0 && label[o] === label[s]) { piece[o] = id; faces.push(o); }
    list.push(faces);
  }
  return { piece, list };
}

/**
 * Turns the network's per-triangle probabilities into teeth: `region[t]` for each triangle, 0 for gum
 * or 1..n, one per tooth. Islands smaller than TOOTH_MIN_AREA join what surrounds them; pieces sharing
 * a long border are merged.
 */
export function cleanRegions(prob: Float32Array, classes: number, count: number, areas: Float32Array, nb: Array<Array<[number, number]>>) {
  // Tooth or gum first (teeth: any tooth class), keeping the network's numbers as evidence.
  const label = new Int32Array(count);
  const number = new Int32Array(count);
  for (let t = 0; t < count; t += 1) {
    let best = 0;
    for (let c = 1; c < classes; c += 1) if (prob[t * classes + c] > prob[t * classes + best]) best = c;
    label[t] = best >= 17 ? 0 : best;
    number[t] = classNumber(label[t]);
  }
  // Small islands of any label join their neighbours' commonest label (by shared border).
  for (let pass = 0; pass < 6; pass += 1) {
    const { list } = pieces(label, nb);
    let changed = false;
    for (const faces of list) {
      let area = 0;
      for (const f of faces) area += areas[f];
      if (area >= TOOTH_MIN_AREA) continue;
      const border = new Map<number, number>();
      const own = label[faces[0]];
      for (const f of faces) for (const [o, len] of nb[f]) if (label[o] !== own) border.set(label[o], (border.get(label[o]) ?? 0) + len);
      let to = own, most = 0;
      for (const [l, len] of border) if (len > most) { most = len; to = l; }
      if (to !== own) { for (const f of faces) label[f] = to; changed = true; }
    }
    if (!changed) break;
  }
  // Teeth regions: pieces of each tooth label; then merge those split by the network.
  const { piece, list } = pieces(label, nb);
  const parent = list.map((_, i) => i);
  const find = (a: number): number => (parent[a] === a ? a : (parent[a] = find(parent[a])));
  const outline = new Float64Array(list.length);
  const shared = new Map<string, number>();
  list.forEach((faces, i) => {
    if (label[faces[0]] === 0) return;
    for (const f of faces) for (const [o, len] of nb[f]) {
      if (piece[o] === i) continue;
      outline[i] += len;
      const j = piece[o];
      if (label[list[j][0]] === 0) continue;
      const key = i < j ? `${i},${j}` : `${j},${i}`;
      shared.set(key, (shared.get(key) ?? 0) + len / 2);
    }
  });
  // A piece much smaller than a tooth beside a tooth it shares a long border with is part of that
  // tooth, split off by the network (neighbouring teeth share a long border too, but are both whole).
  const areaOf = list.map((faces) => faces.reduce((s, f) => s + areas[f], 0));
  const teethAreas = list.map((faces, i) => (label[faces[0]] ? areaOf[i] : 0)).filter((a) => a >= TOOTH_MIN_AREA).sort((a, b) => a - b);
  const typical = teethAreas.length ? teethAreas[Math.floor(teethAreas.length / 2)] : 0;
  for (const [key, len] of [...shared].sort((a, b) => b[1] - a[1])) {
    const [i, j] = key.split(",").map(Number);
    const small = areaOf[i] < areaOf[j] ? i : j;
    if (areaOf[small] < SPLIT_PIECE_SHARE * typical && len >= SPLIT_BORDER_SHARE * outline[small]) parent[find(small)] = find(small === i ? j : i);
  }
  const region = new Int32Array(count);
  const ids = new Map<number, number>();
  for (let t = 0; t < count; t += 1) {
    if (label[t] === 0) continue;
    const root = find(piece[t]);
    let id = ids.get(root);
    if (id === undefined) ids.set(root, (id = ids.size + 1));
    region[t] = id;
  }
  return { region, regions: ids.size, number };
}

/** A tooth found on a scan. */
export type FoundTooth = {
  /** FDI number (11-48). */
  fdi: number;
  /** Its centre, highest point (incisal edge or cusp tip), in the scan's arch frame. */
  centre: [number, number, number];
  top: [number, number, number];
  /** Its crown's area, mm², and how sure the network was of it (mean probability of its classes). */
  area: number;
  confidence: number;
  /** Its number agreed with the network's (false: put right by its place in the arch). */
  agreed: boolean;
};

/**
 * Numbers the teeth by their place: angle about the middle of the teeth from the front, the midline
 * between the network's two central incisors, then out from it on each side rising numbers that agree
 * with the network's most (gaps allowed).
 */
export function numberTeeth(teeth: Array<{ centre: [number, number, number]; votes: Float64Array; area: number }>, arch: "upper" | "lower"): Array<{ fdi: number; agreed: boolean }> {
  if (!teeth.length) return [];
  const cx = teeth.reduce((s, t) => s + t.centre[0], 0) / teeth.length;
  // The middle of the arch's curve: behind the front teeth, at the teeth's mean depth.
  const cy = teeth.reduce((s, t) => s + t.centre[1], 0) / teeth.length;
  const angle = teeth.map((t) => Math.atan2(t.centre[0] - cx, -(t.centre[1] - cy)));
  // The midline: between the two teeth the network most calls centrals, if they stand side by side; else the front.
  const centralness = teeth.map((t) => t.votes[1] / Math.max(1e-9, t.votes.reduce((a, b) => a + b, 0)));
  const order = teeth.map((_, i) => i).sort((a, b) => angle[a] - angle[b]);
  let mid = 0;
  let bestPair = -1;
  for (let k = 0; k + 1 < order.length; k += 1) {
    const s = centralness[order[k]] + centralness[order[k + 1]];
    if (s > bestPair) { bestPair = s; mid = (angle[order[k]] + angle[order[k + 1]]) / 2; }
  }
  if (bestPair < 0.6) {
    // No clear pair of centrals: the frontmost point of the arch.
    let front = 0;
    teeth.forEach((t, i) => { if (t.centre[1] < teeth[front].centre[1]) front = i; });
    mid = angle[front];
  }
  // The size of a front tooth: the median crown of those the network numbers 1-3.
  const fronts = teeth.filter((t) => t.votes[1] + t.votes[2] + t.votes[3] > 0.5 * t.votes.reduce((a, b) => a + b, 0)).map((t) => t.area).sort((a, b) => a - b);
  const front = fronts.length ? fronts[Math.floor(fronts.length / 2)] : Infinity;
  const out: Array<{ fdi: number; agreed: boolean }> = teeth.map(() => ({ fdi: 0, agreed: false }));
  for (const sign of [1, -1]) {
    // At most eight teeth a side: the nearest the midline.
    const side = order.filter((i) => sign * (angle[i] - mid) > 0).sort((a, b) => sign * (angle[a] - angle[b])).slice(0, 8);
    const k = side.length;
    if (!k) continue;
    // score[i][n]: the share of tooth i's area the network numbered n+1.
    const share = side.map((i) => {
      const v = teeth[i].votes, s = v.reduce((a, b) => a + b, 0) || 1;
      // Size counts too: a crown the size of a molar is not a premolar or a front tooth - where
      // premolars were taken out the network tends to number the molars one short. (A small crown
      // may still be a molar: partly scanned, or erupting.)
      const big = teeth[i].area > MOLAR_SIZE * front;
      return Array.from({ length: 8 }, (_, n) => v[n + 1] / s - (big && n + 1 < 6 ? SIZE_WEIGHT : 0));
    });
    // best[i][n]: best total with tooth i numbered n+1 and numbers rising before it.
    const best = Array.from({ length: k }, () => new Float64Array(8).fill(-Infinity));
    const from = Array.from({ length: k }, () => new Int32Array(8).fill(-1));
    for (let n = 0; n < 8; n += 1) best[0][n] = share[0][n];
    for (let i = 1; i < k; i += 1) for (let n = i; n < 8; n += 1) for (let p = 0; p < n; p += 1) {
      const v = best[i - 1][p] + share[i][n];
      if (v > best[i][n]) { best[i][n] = v; from[i][n] = p; }
    }
    let n = 0;
    for (let q = 1; q < 8; q += 1) if (best[k - 1][q] > best[k - 1][n]) n = q;
    for (let i = k - 1; i >= 0; i -= 1) {
      const tooth = side[i];
      // The upper turned over: the patient's right at +x (see fdiNumber in dentalWaxup); the lower's right at -x.
      const right = arch === "upper" ? sign > 0 : sign < 0;
      const quadrant = arch === "upper" ? (right ? 1 : 2) : right ? 4 : 3;
      const own = teeth[tooth].votes;
      let netBest = 1;
      for (let q = 2; q <= 8; q += 1) if (own[q] > own[netBest]) netBest = q;
      out[tooth] = { fdi: quadrant * 10 + n + 1, agreed: netBest === n + 1 };
      n = i > 0 ? from[i][n] : n;
    }
  }
  return out;
}

/** What finding the teeth gives: each full-scan triangle's FDI number (0 gum), and the teeth. */
export type ToothMap = { fdi: Uint8Array; teeth: FoundTooth[]; seconds: number };

/**
 * The wax-up's landmarks from the teeth found (arch frame): the midline between the centrals' mesial
 * incisal corners, the canine tips their highest points. Null when a central or canine is missing.
 */
export function landmarksFromTeeth(soup: Float32Array, map: ToothMap, arch: "upper" | "lower") {
  const q = arch === "upper" ? [1, 2] : [4, 3];
  const has = (fdi: number) => map.teeth.find((t) => t.fdi === fdi);
  const c1 = has(q[0] * 10 + 1), c2 = has(q[1] * 10 + 1), k1 = has(q[0] * 10 + 3), k2 = has(q[1] * 10 + 3);
  if (!c1 || !c2 || !k1 || !k2) return null;
  // Each central's incisal corner nearest the other central: of its points within 1 mm of its top.
  const corner = (own: FoundTooth, other: FoundTooth) => {
    let best: [number, number, number] = own.top, bestD = Infinity;
    const n = soup.length / 9;
    for (let t = 0; t < n; t += 1) {
      if (map.fdi[t] !== own.fdi) continue;
      for (let k = 0; k < 3; k += 1) {
        const o = t * 9 + k * 3;
        if (soup[o + 2] < own.top[2] - 1) continue;
        const d = Math.hypot(soup[o] - other.centre[0], soup[o + 1] - other.centre[1]);
        if (d < bestD) { bestD = d; best = [soup[o], soup[o + 1], soup[o + 2]]; }
      }
    }
    return best;
  };
  const a = corner(c1, c2), b = corner(c2, c1);
  const midline: [number, number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const canines: [[number, number, number], [number, number, number]] = k1.top[0] < k2.top[0] ? [k1.top, k2.top] : [k2.top, k1.top];
  return { midline, canines };
}

/** Build 117: two central incisors only count as touching when their crowns come this close, mm. */
export const CENTRALS_TOUCH = 1.5;

/**
 * Build 117: the dental midline - where the two central incisors meet (11 and 21 on an upper, 31 and
 * 41 on a lower): the middle of the closest two corners of their crowns, in the soup's coordinates.
 * Null when either central was not found, or they stand apart (a diastema or a missing tooth).
 */
export function centralsContact(soup: ArrayLike<number>, fdi: ArrayLike<number>, arch: "upper" | "lower"): [number, number, number] | null {
  const [a, b] = arch === "upper" ? [11, 21] : [41, 31];
  const corners = (n: number) => {
    const out: number[] = [];
    for (let t = 0; t < fdi.length; t += 1) if (fdi[t] === n) for (let k = 0; k < 9; k += 1) out.push(soup[t * 9 + k]);
    return Float64Array.from(out);
  };
  const pa = corners(a), pb = corners(b);
  if (pa.length < 9 * 20 || pb.length < 9 * 20) return null;
  const grid = new CubeGrid(Float32Array.from(pb), 2);
  const idx = new Int32Array(1), dist = new Float32Array(1);
  let best = Infinity, at: [number, number, number] | null = null;
  for (let i = 0; i < pa.length; i += 3) {
    grid.nearest(pa[i], pa[i + 1], pa[i + 2], 1, idx, dist);
    if (idx[0] < 0) continue;
    const j = idx[0] * 3;
    const d = Math.hypot(pa[i] - pb[j], pa[i + 1] - pb[j + 1], pa[i + 2] - pb[j + 2]);
    if (d < best) { best = d; at = [(pa[i] + pb[j]) / 2, (pa[i + 1] + pb[j + 1]) / 2, (pa[i + 2] + pb[j + 2]) / 2]; }
  }
  return at && best <= CENTRALS_TOUCH ? at : null;
}

/** A point moved by a matrix, as a tuple. */
export const movePoint = (p: [number, number, number], m: THREE.Matrix4) => new THREE.Vector3(...p).applyMatrix4(m).toArray() as [number, number, number];

/** Teeth found on a scan, in the scan's own coordinates. */
export type ScanTeeth = { fdi: Uint8Array; teeth: FoundTooth[]; landmarks: { midline: [number, number, number]; canines: [[number, number, number], [number, number, number]] } | null; seconds: number };

/** Labels of one soup's triangles carried to another's (the same surface, any triangles): nearest centre. */
export function transferLabels(from: Float32Array, labels: Uint8Array, to: Float32Array): Uint8Array {
  const n = from.length / 9;
  const centres = new Float32Array(n * 3);
  for (let t = 0; t < n; t += 1) for (let k = 0; k < 3; k += 1) centres[t * 3 + k] = (from[t * 9 + k] + from[t * 9 + 3 + k] + from[t * 9 + 6 + k]) / 3;
  const grid = new CubeGrid(centres, 2);
  const m = to.length / 9;
  const out = new Uint8Array(m);
  const idx = new Int32Array(1), dist = new Float32Array(1);
  for (let t = 0; t < m; t += 1) {
    const o = t * 9;
    grid.nearest((to[o] + to[o + 3] + to[o + 6]) / 3, (to[o + 1] + to[o + 4] + to[o + 7]) / 3, (to[o + 2] + to[o + 5] + to[o + 8]) / 3, 1, idx, dist);
    out[t] = idx[0] >= 0 ? labels[idx[0]] : 0;
  }
  return out;
}

/** A colour for each tooth (FDI), steady from scan to scan; gum keeps the scan's colour. */
export function toothColour(fdi: number): [number, number, number] {
  const n = fdi % 10, q = Math.floor(fdi / 10);
  const hue = ((n - 1) * 47 + (q % 2 ? 0 : 23)) % 360;
  const c = new THREE.Color().setHSL(hue / 360, 0.62, q % 2 ? 0.62 : 0.52);
  return [c.r, c.g, c.b];
}
