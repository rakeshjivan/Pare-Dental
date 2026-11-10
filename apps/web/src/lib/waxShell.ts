/**
 * Build 283 (Rakesh, from a lab's wax-up of his own case): a wax tooth as a lab makes it. The ideal (library) tooth
 * gives the shape; the patient's tooth only says where the wax starts and what it must cover. Measured on the lab's
 * model the wax is 0 mm at the gingival margin all round - labial, interproximal, palatal - thin over the body
 * (about 0.5 mm) and thickest where the edges were lengthened; the gum is not touched and the patient's tooth is
 * enclosed.
 *
 * So the wax-up model is the scan itself with each front tooth's crown moved out onto the library tooth:
 *
 * 1. segmentFront: each tooth's crown on the scan, flooded from a point on it and stopped by the crease where
 *    tooth meets gum (a valley costs much more to cross) and by the planes through its marked contacts.
 * 2. shellScan: every corner of a crown moved along the ray from the crown's middle onto the library tooth's
 *    surface in that direction, by a share that rises from 0 at the gingival margin to 1 a little way in -
 *    never inwards (the wax only adds) unless the dentist chose to reduce that tooth; long edges split so the
 *    lengthened edge is smooth. The gum and every other tooth are left exactly as scanned, so the model is as
 *    closed as the scan was, with no union, no press and no seams.
 */

export type Vec3 = [number, number, number];

/** A plane a tooth's crown stays on the inner side of (`normal` points into the tooth). */
export type Wall = { point: Vec3; normal: Vec3 };

export type ShellToothSpec = { fdi: number; seed: Vec3; walls: Wall[] };

/** How much dearer an edge in a sharp valley (the gingival margin) is to cross: (1 + this x (1 - cos)) times its length. */
export const SHELL_VALLEY = 60;
/** Over how far from the gingival margin the wax rises from nothing to the library tooth, mm. */
export const SHELL_BAND = 2.5;
/** Edges longer than this after moving are split, mm. */
export const SHELL_EDGE = 0.4;
/** Cube-map cells a side for a library tooth's surface seen from the crown's middle. */
const MAP = 160;
/** How softly the wax gives way where the library tooth dips inside the patient's (no crease where they cross), mm. */
const SOFT = 0.5;

const sub = (a: ArrayLike<number>, b: ArrayLike<number>): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: ArrayLike<number>, b: ArrayLike<number>): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: ArrayLike<number>) => Math.hypot(a[0], a[1], a[2]);
const smooth01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

class Heap {
  private items: number[] = [];
  private keys: number[] = [];
  get size() { return this.items.length; }
  push(item: number, key: number) {
    const items = this.items, keys = this.keys;
    let i = items.length;
    items.push(item); keys.push(key);
    while (i > 0) { const p = (i - 1) >> 1; if (keys[p] <= key) break; items[i] = items[p]; keys[i] = keys[p]; i = p; }
    items[i] = item; keys[i] = key;
  }
  pop(): [number, number] {
    const items = this.items, keys = this.keys;
    const top: [number, number] = [items[0], keys[0]];
    const item = items.pop()!, key = keys.pop()!;
    if (items.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, mk = key;
        if (l < items.length && keys[l] < mk) { m = l; mk = keys[l]; }
        if (r < items.length && keys[r] < mk) { m = r; mk = keys[r]; }
        if (m === i) break;
        items[i] = items[m]; keys[i] = keys[m]; i = m;
      }
      items[i] = item; keys[i] = key;
    }
    return top;
  }
}

/** The scan's front teeth found: which triangles are which tooth's crown, and what the move needs of them. */
export type FrontSegmentation = {
  /** The scan's triangles taken in (indices into the scan soup), and each one's label: 0 not a front crown, else its FDI. */
  tris: Int32Array;
  labels: Int16Array;
  /** The welded corners of those triangles: positions, and each triangle's three. */
  xyz: Float64Array;
  corner: Int32Array;
  /** Each corner's tooth (FDI, 0 none) and its distance from its tooth's gingival margin over the crown, mm. */
  owner: Int16Array;
  margin: Float64Array;
  /** Each tooth's crown middle and walls. */
  teeth: Map<number, { centre: Vec3; walls: Wall[]; corners: number }>;
};

/**
 * Each front tooth's crown on the scan (a world soup). `up` points incisally; corners further than `gumBelow` mm
 * cervical of `edgeLevel` (along `up`) are certainly gum and flood from there; each tooth floods from its seed.
 */
export function segmentFront(scan: ArrayLike<number>, specs: ShellToothSpec[], up: Vec3, edgeLevel: number, gumBelow = 11.5, reach = 14): FrontSegmentation | null {
  if (!specs.length) return null;
  const u = (() => { const l = len(up) || 1; return [up[0] / l, up[1] / l, up[2] / l] as Vec3; })();
  // The scan near the front teeth: a box round the seeds.
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const s of specs) for (let k = 0; k < 3; k += 1) { lo[k] = Math.min(lo[k], s.seed[k] - reach); hi[k] = Math.max(hi[k], s.seed[k] + reach); }
  const inBox = (x: number, y: number, z: number) => x >= lo[0] && y >= lo[1] && z >= lo[2] && x <= hi[0] && y <= hi[1] && z <= hi[2];
  const triList: number[] = [];
  for (let t = 0; t * 9 + 8 < scan.length; t += 1) {
    const o = t * 9;
    if (inBox(scan[o], scan[o + 1], scan[o + 2]) || inBox(scan[o + 3], scan[o + 4], scan[o + 5]) || inBox(scan[o + 6], scan[o + 7], scan[o + 8])) triList.push(t);
  }
  const tris = Int32Array.from(triList);
  const weld = new Map<string, number>();
  const xyzList: number[] = [];
  const corner = new Int32Array(tris.length * 3);
  for (let i = 0; i < tris.length; i += 1) for (let k = 0; k < 3; k += 1) {
    const o = tris[i] * 9 + k * 3;
    const key = `${Math.round(scan[o] * 1e4)},${Math.round(scan[o + 1] * 1e4)},${Math.round(scan[o + 2] * 1e4)}`;
    let v = weld.get(key);
    if (v === undefined) { v = xyzList.length / 3; weld.set(key, v); xyzList.push(scan[o], scan[o + 1], scan[o + 2]); }
    corner[i * 3 + k] = v;
  }
  const xyz = Float64Array.from(xyzList);
  const n = xyz.length / 3;
  const P = (v: number): Vec3 => [xyz[v * 3], xyz[v * 3 + 1], xyz[v * 3 + 2]];
  // Face normals, and each edge's two faces: a valley (concave) edge is dear to cross.
  const normal = new Float64Array(tris.length * 3);
  for (let i = 0; i < tris.length; i += 1) {
    const a = P(corner[i * 3]), b = P(corner[i * 3 + 1]), c = P(corner[i * 3 + 2]);
    const m = cross(sub(b, a), sub(c, a)); const l = len(m) || 1;
    normal[i * 3] = m[0] / l; normal[i * 3 + 1] = m[1] / l; normal[i * 3 + 2] = m[2] / l;
  }
  const edgeFaces = new Map<number, number[]>();
  const ekey = (a: number, b: number) => (a < b ? a * n + b : b * n + a);
  for (let i = 0; i < tris.length; i += 1) for (let k = 0; k < 3; k += 1) {
    const a = corner[i * 3 + k], b = corner[i * 3 + ((k + 1) % 3)];
    const key = ekey(a, b);
    const list = edgeFaces.get(key);
    if (list) list.push(i); else edgeFaces.set(key, [i]);
  }
  // How much of a valley each corner sits in: the sharpest concave fold among its edges. A crossing costs by its
  // corners, not its own edge - the margin seldom runs along the scan's edges, so a crease shows at its corners.
  const valleyAt = new Float64Array(n);
  for (const [key, faces] of edgeFaces) {
    if (faces.length !== 2) continue;
    const a = Math.floor(key / n), b = key % n;
    const [f, g] = faces;
    const nf = [normal[f * 3], normal[f * 3 + 1], normal[f * 3 + 2]], ng = [normal[g * 3], normal[g * 3 + 1], normal[g * 3 + 2]];
    const gc = [0, 1, 2].map((k) => (xyz[corner[g * 3] * 3 + k] + xyz[corner[g * 3 + 1] * 3 + k] + xyz[corner[g * 3 + 2] * 3 + k]) / 3);
    if (dot(sub(gc, P(a)), nf) <= 0) continue;
    const valley = Math.max(0, 1 - dot(nf, ng));
    if (valley > valleyAt[a]) valleyAt[a] = valley;
    if (valley > valleyAt[b]) valleyAt[b] = valley;
  }
  const nbStart = new Int32Array(n + 1);
  for (const key of edgeFaces.keys()) { const a = Math.floor(key / n), b = key % n; nbStart[a + 1] += 1; nbStart[b + 1] += 1; }
  for (let v = 0; v < n; v += 1) nbStart[v + 1] += nbStart[v];
  const nb = new Int32Array(nbStart[n]), nbCost = new Float64Array(nbStart[n]), nbLen = new Float64Array(nbStart[n]);
  const fill = nbStart.slice(0, n);
  for (const key of edgeFaces.keys()) {
    const a = Math.floor(key / n), b = key % n;
    const l = len(sub(P(a), P(b)));
    const cost = l * (1 + SHELL_VALLEY * Math.max(valleyAt[a], valleyAt[b]));
    nb[fill[a]] = b; nbCost[fill[a]] = cost; nbLen[fill[a]] = l; fill[a] += 1;
    nb[fill[b]] = a; nbCost[fill[b]] = cost; nbLen[fill[b]] = l; fill[b] += 1;
  }
  // The competing floods: gum (0) from far cervical, each tooth from its seed, held inside its walls.
  const dist = new Float64Array(n).fill(Infinity);
  const label = new Int16Array(n).fill(-1);
  const heap = new Heap();
  const level = (v: number) => xyz[v * 3] * u[0] + xyz[v * 3 + 1] * u[1] + xyz[v * 3 + 2] * u[2] - edgeLevel;
  for (let v = 0; v < n; v += 1) if (level(v) < -gumBelow) { dist[v] = 0; label[v] = 0; heap.push(v, 0); }
  const spec = new Map(specs.map((s) => [s.fdi, s]));
  const insideWalls = (fdi: number, p: Vec3, slack = 0.3) => (spec.get(fdi)?.walls ?? []).every((w) => dot(sub(p, w.point), w.normal) >= -slack);
  for (const s of specs) {
    // The seed: the nearest few corners.
    let best = -1, bestD = Infinity;
    for (let v = 0; v < n; v += 1) { const d = len(sub(P(v), s.seed)); if (d < bestD) { bestD = d; best = v; } }
    if (best < 0 || bestD > 3) continue;
    dist[best] = 0; label[best] = s.fdi; heap.push(best, 0);
  }
  const done = new Uint8Array(n);
  while (heap.size) {
    const [v, d] = heap.pop();
    if (done[v] || d > dist[v]) continue;
    done[v] = 1;
    const lab = label[v];
    for (let e = nbStart[v]; e < nbStart[v + 1]; e += 1) {
      const w = nb[e];
      if (done[w]) continue;
      const nd = d + nbCost[e];
      if (nd >= dist[w]) continue;
      if (lab > 0 && !insideWalls(lab, P(w))) continue;
      dist[w] = nd; label[w] = lab; heap.push(w, nd);
    }
  }
  // A triangle is a tooth's when two or more of its corners are.
  const labels = new Int16Array(tris.length);
  for (let i = 0; i < tris.length; i += 1) {
    const a = label[corner[i * 3]], b = label[corner[i * 3 + 1]], c = label[corner[i * 3 + 2]];
    labels[i] = a > 0 && (a === b || a === c) ? a : b > 0 && b === c ? b : 0;
  }
  // Each corner's tooth: the first tooth whose triangle it is in; margin corners touch a gum triangle.
  const owner = new Int16Array(n);
  const onGum = new Uint8Array(n);
  for (let i = 0; i < tris.length; i += 1) for (let k = 0; k < 3; k += 1) {
    const v = corner[i * 3 + k];
    if (labels[i] > 0) { if (!owner[v]) owner[v] = labels[i]; } else onGum[v] = 1;
  }
  // Distance over the crown from its gum margin (not from the tooth beside it).
  const margin = new Float64Array(n).fill(Infinity);
  const h2 = new Heap();
  for (let v = 0; v < n; v += 1) if (owner[v] && onGum[v]) { margin[v] = 0; h2.push(v, 0); }
  const done2 = new Uint8Array(n);
  while (h2.size) {
    const [v, d] = h2.pop();
    if (done2[v] || d > margin[v]) continue;
    done2[v] = 1;
    for (let e = nbStart[v]; e < nbStart[v + 1]; e += 1) {
      const w = nb[e];
      if (!owner[w] || done2[w]) continue;
      const nd = d + nbLen[e];
      if (nd < margin[w]) { margin[w] = nd; h2.push(w, nd); }
    }
  }
  const teeth = new Map<number, { centre: Vec3; walls: Wall[]; corners: number }>();
  for (const s of specs) {
    let x = 0, y = 0, z = 0, count = 0;
    for (let v = 0; v < n; v += 1) if (owner[v] === s.fdi) { x += xyz[v * 3]; y += xyz[v * 3 + 1]; z += xyz[v * 3 + 2]; count += 1; }
    if (count >= 30) teeth.set(s.fdi, { centre: [x / count, y / count, z / count], walls: s.walls, corners: count });
  }
  return { tris, labels, xyz, corner, owner, margin, teeth };
}

/** A library tooth's surface as seen from a point: the outermost distance in each direction (a cube map). */
export class RadialMap {
  private readonly r: Float32Array;
  constructor(readonly centre: Vec3, soup: ArrayLike<number>) {
    this.r = new Float32Array(6 * MAP * MAP);
    const c = centre;
    for (let t = 0; t + 8 < soup.length; t += 9) {
      const a = [soup[t] - c[0], soup[t + 1] - c[1], soup[t + 2] - c[2]];
      const b = [soup[t + 3] - c[0], soup[t + 4] - c[1], soup[t + 5] - c[2]];
      const d = [soup[t + 6] - c[0], soup[t + 7] - c[1], soup[t + 8] - c[2]];
      // Sampled finely enough that every cell it covers gets a sample (cells are ~1.2 degrees).
      const span = Math.max(len(sub(a, b)), len(sub(b, d)), len(sub(d, a)));
      const near = Math.max(0.5, Math.min(len(a), len(b), len(d)));
      const steps = Math.min(64, Math.max(1, Math.ceil(span / (near * (1.6 / MAP)))));
      for (let i = 0; i <= steps; i += 1) for (let j = 0; i + j <= steps; j += 1) {
        const wa = i / steps, wb = j / steps, wd = 1 - wa - wb;
        const p = [a[0] * wa + b[0] * wb + d[0] * wd, a[1] * wa + b[1] * wb + d[1] * wd, a[2] * wa + b[2] * wb + d[2] * wd];
        const l = len(p);
        if (l < 1e-6) continue;
        const cell = cellOf(p);
        if (l > this.r[cell]) this.r[cell] = l;
      }
    }
    // Small holes (a cell no sample fell in) filled from their neighbours.
    for (let pass = 0; pass < 2; pass += 1) {
      const copy = this.r.slice();
      for (let f = 0; f < 6; f += 1) for (let y = 0; y < MAP; y += 1) for (let x = 0; x < MAP; x += 1) {
        const i = (f * MAP + y) * MAP + x;
        if (copy[i] > 0) continue;
        let sum = 0, count = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= MAP || yy >= MAP) continue;
          const v = copy[(f * MAP + yy) * MAP + xx];
          if (v > 0) { sum += v; count += 1; }
        }
        if (count >= 2) this.r[i] = sum / count;
      }
    }
    // One pass of averaging over each cell and its neighbours, so the samples' steps do not show on the wax.
    const raw = this.r.slice();
    for (let f = 0; f < 6; f += 1) for (let y = 0; y < MAP; y += 1) for (let x = 0; x < MAP; x += 1) {
      const i = (f * MAP + y) * MAP + x;
      if (!(raw[i] > 0)) continue;
      let sum = 0, count = 0;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= MAP || yy >= MAP) continue;
        const v = raw[(f * MAP + yy) * MAP + xx];
        if (v > 0) { sum += v; count += 1; }
      }
      this.r[i] = sum / count;
    }
  }
  /** The library surface's distance from the centre along `dir` (any length), 0 where it has none - read between cells. */
  at(dir: ArrayLike<number>): number {
    const [f, s, t] = faceOf(dir);
    const fx = ((s + 1) / 2) * MAP - 0.5, fy = ((t + 1) / 2) * MAP - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    let sum = 0, weight = 0;
    for (const [x, y, w] of [[x0, y0, (1 - tx) * (1 - ty)], [x0 + 1, y0, tx * (1 - ty)], [x0, y0 + 1, (1 - tx) * ty], [x0 + 1, y0 + 1, tx * ty]] as const) {
      const xx = Math.min(MAP - 1, Math.max(0, x)), yy = Math.min(MAP - 1, Math.max(0, y));
      const v = this.r[(f * MAP + yy) * MAP + xx];
      if (v > 0 && w > 0) { sum += v * w; weight += w; }
    }
    return weight > 0.3 ? sum / weight : 0;
  }
}

/** A direction's cube face and its place on it (-1 to 1 each way). */
function faceOf(p: ArrayLike<number>): [number, number, number] {
  const ax = Math.abs(p[0]), ay = Math.abs(p[1]), az = Math.abs(p[2]);
  if (ax >= ay && ax >= az) return [p[0] > 0 ? 0 : 1, p[1] / ax, p[2] / ax];
  if (ay >= az) return [p[1] > 0 ? 2 : 3, p[0] / ay, p[2] / ay];
  return [p[2] > 0 ? 4 : 5, p[0] / az, p[1] / az];
}

function cellOf(p: ArrayLike<number>): number {
  const ax = Math.abs(p[0]), ay = Math.abs(p[1]), az = Math.abs(p[2]);
  let f: number, s: number, t: number, m: number;
  if (ax >= ay && ax >= az) { f = p[0] > 0 ? 0 : 1; m = ax; s = p[1]; t = p[2]; }
  else if (ay >= az) { f = p[1] > 0 ? 2 : 3; m = ay; s = p[0]; t = p[2]; }
  else { f = p[2] > 0 ? 4 : 5; m = az; s = p[0]; t = p[1]; }
  const x = Math.min(MAP - 1, Math.max(0, Math.floor(((s / m + 1) / 2) * MAP)));
  const y = Math.min(MAP - 1, Math.max(0, Math.floor(((t / m + 1) / 2) * MAP)));
  return (f * MAP + y) * MAP + x;
}

export type ShellLibraryTooth = { soup: ArrayLike<number>; reduce?: boolean };

/**
 * The scan with each segmented crown moved onto its library tooth (scene soups). Returns the new soup, and per tooth
 * how far the patient's tooth stands proud of the library tooth (mm; reduced teeth are cut back to it).
 */
export function shellScan(scan: ArrayLike<number>, seg: FrontSegmentation, library: Map<number, ShellLibraryTooth>): { soup: Float32Array; proud: Record<number, number> } {
  const { xyz, corner, owner, margin, tris, labels } = seg;
  const maps = new Map<number, { map: RadialMap; centre: Vec3; walls: Wall[]; reduce: boolean }>();
  for (const [fdi, tooth] of seg.teeth) {
    const lib = library.get(fdi);
    if (!lib) continue;
    maps.set(fdi, { map: new RadialMap(tooth.centre, lib.soup), centre: tooth.centre, walls: tooth.walls, reduce: Boolean(lib.reduce) });
  }
  const proud: Record<number, number> = {};
  /** Where a point of tooth `fdi`'s crown goes (patient position p, `m` mm from its margin). */
  const place = (fdi: number, p: Vec3, m: number): Vec3 => {
    const t = maps.get(fdi);
    if (!t) return p;
    const d = sub(p, t.centre);
    const r = len(d);
    if (r < 1e-6) return p;
    const rl = t.map.at(d);
    if (!rl) return p;
    const w = smooth01(m / SHELL_BAND);
    const add = (rl - r) * w;
    if (add < -0.05) proud[fdi] = Math.max(proud[fdi] ?? 0, -add);
    // Only adding (unless the tooth is to be reduced) - eased in, so where the library tooth passes inside the
    // patient's there is no crease: 0 at 0, the full amount less SOFT/2 beyond SOFT.
    const target = t.reduce ? r + add : r + (add <= 0 ? 0 : add >= SOFT ? add - SOFT / 2 : (add * add) / (2 * SOFT));
    let out: Vec3 = [t.centre[0] + (d[0] / r) * target, t.centre[1] + (d[1] / r) * target, t.centre[2] + (d[2] / r) * target];
    // Not past the planes through its contacts (the tooth beside it is there).
    for (const wall of t.walls) {
      const sd = dot(sub(out, wall.point), wall.normal);
      if (sd >= 0) continue;
      const sp = dot(sub(p, wall.point), wall.normal);
      if (sp < 0) { out = p; break; }
      // Back along the ray to the plane.
      const k = sp / (sp - sd);
      out = [p[0] + (out[0] - p[0]) * k, p[1] + (out[1] - p[1]) * k, p[2] + (out[2] - p[2]) * k];
    }
    return out;
  };
  // The crowns as an indexed mesh, their corners moved, long edges split.
  const crownTri: number[] = [];
  for (let i = 0; i < tris.length; i += 1) if (labels[i] > 0 && maps.has(labels[i])) crownTri.push(i);
  const pos: number[] = [], src: number[] = [], dm: number[] = [], own: number[] = [];
  const local = new Map<number, number>();
  const vert = (v: number) => {
    let id = local.get(v);
    if (id === undefined) {
      id = own.length;
      local.set(v, id);
      const p: Vec3 = [xyz[v * 3], xyz[v * 3 + 1], xyz[v * 3 + 2]];
      const m = Number.isFinite(margin[v]) ? margin[v] : 0;
      const q = owner[v] ? place(owner[v], p, m) : p;
      pos.push(...q); src.push(...p); dm.push(m); own.push(owner[v]);
    }
    return id;
  };
  let faces: number[] = [];
  for (const i of crownTri) faces.push(vert(corner[i * 3]), vert(corner[i * 3 + 1]), vert(corner[i * 3 + 2]));
  // Edges a gum triangle shares are never split (they do not move, and the gum is kept as scanned).
  const nV = () => own.length;
  const keyOf = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
  const edgeUse = new Map<string, number>();
  for (let f = 0; f < faces.length; f += 3) for (let k = 0; k < 3; k += 1) { const key = keyOf(faces[f + k], faces[f + ((k + 1) % 3)]); edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1); }
  const mid = new Map<string, number>();
  const midpoint = (a: number, b: number) => {
    const key = keyOf(a, b);
    let id = mid.get(key);
    if (id === undefined) {
      id = nV();
      mid.set(key, id);
      const p: Vec3 = [(src[a * 3] + src[b * 3]) / 2, (src[a * 3 + 1] + src[b * 3 + 1]) / 2, (src[a * 3 + 2] + src[b * 3 + 2]) / 2];
      const m = (dm[a] + dm[b]) / 2, o = own[a] || own[b];
      const q = o ? place(o, p, m) : p;
      pos.push(...q); src.push(...p); dm.push(m); own.push(o);
    }
    return id;
  };
  const elen = (a: number, b: number) => Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]);
  for (let round = 0; round < 5; round += 1) {
    // Edges to split this round: long ones inside the crowns (used by two crown triangles).
    const split = new Set<string>();
    for (let f = 0; f < faces.length; f += 3) for (let k = 0; k < 3; k += 1) {
      const a = faces[f + k], b = faces[f + ((k + 1) % 3)];
      const key = keyOf(a, b);
      if (edgeUse.get(key) === 2 && elen(a, b) > SHELL_EDGE) split.add(key);
    }
    if (!split.size) break;
    const next: number[] = [];
    for (let f = 0; f < faces.length; f += 3) {
      const t = [faces[f], faces[f + 1], faces[f + 2]];
      const s = [0, 1, 2].map((k) => split.has(keyOf(t[k], t[(k + 1) % 3])));
      const count = s.filter(Boolean).length;
      if (!count) { next.push(...t); continue; }
      if (count === 3) {
        const m0 = midpoint(t[0], t[1]), m1 = midpoint(t[1], t[2]), m2 = midpoint(t[2], t[0]);
        next.push(t[0], m0, m2, m0, t[1], m1, m2, m1, t[2], m0, m1, m2);
        continue;
      }
      if (count === 1) {
        const k = s.indexOf(true);
        const a = t[k], b = t[(k + 1) % 3], c = t[(k + 2) % 3];
        const m = midpoint(a, b);
        next.push(a, m, c, m, b, c);
        continue;
      }
      // Two edges split: the one not split is k.
      const k = s.indexOf(false);
      const a = t[k], b = t[(k + 1) % 3], c = t[(k + 2) % 3];
      const mbc = midpoint(b, c), mca = midpoint(c, a);
      next.push(a, b, mbc, a, mbc, mca, mca, mbc, c);
    }
    // (Not spread into the old array: a crown has tens of thousands of corners.)
    faces = next;
    edgeUse.clear();
    for (let f = 0; f < faces.length; f += 3) for (let k = 0; k < 3; k += 1) { const key = keyOf(faces[f + k], faces[f + ((k + 1) % 3)]); edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1); }
  }
  // The scan's other triangles as they are, then the crowns.
  const crown = new Uint8Array(scan.length / 9);
  for (const i of crownTri) crown[tris[i]] = 1;
  let keep = 0;
  for (let t = 0; t < crown.length; t += 1) if (!crown[t]) keep += 1;
  const out = new Float32Array(keep * 9 + faces.length * 3);
  let o = 0;
  for (let t = 0; t < crown.length; t += 1) {
    if (crown[t]) continue;
    for (let k = 0; k < 9; k += 1) out[o + k] = scan[t * 9 + k];
    o += 9;
  }
  for (const v of faces) { out[o] = pos[v * 3]; out[o + 1] = pos[v * 3 + 1]; out[o + 2] = pos[v * 3 + 2]; o += 3; }
  return { soup: out, proud };
}
