/**
 * Build 119: the smooth base - made to the lab models Rakesh benchmarked: the scan's gum
 * running down into a broad rounded fillet onto a flat ledge, a clean straight wall from the ledge to
 * the rim, the outline's corners chamfered, and the whole model a shell of even thickness, open
 * underneath. A horseshoe arch (the lower's tongue space, an upper with its palate cut away) gets a flat
 * floor at the ledge's height, so it comes out the same as a full palate.
 *
 * Everything below the teeth is made as a distance field on a voxel grid and turned into a surface
 * (Manifold's level set), so there is no vertical skirt and no streaks:
 *   1. the scan's distance (exact within DISTANCE_BAND of it, from its triangles; a distance transform
 *      further out), inside where an odd number of the scan's surfaces stand above (the scan closed
 *      down to below the floor);
 *   2. beyond the scan's edge a drape: from the edge's height down and out at DRAPE_SLOPE, the heights
 *      smoothed, lifted a little over the ragged edge so it is buried; the scan's own surface eased in
 *      under it over the last EDGE_BAND before its edge;
 *   3. joined to the ledge by a rounded fillet (FILLET), cut to the outline (its top edge rounded a little)
 *      and to the rim;
 *   4. the cavity: the same field, smoothed, WALL inside it, open through the rim.
 * The teeth are not made from the field: the caller adds the scan's own crowns, exact (the field is a
 * little inside them there, INSET, so the scan's surface is what shows).
 */
import type { ManifoldRuntime, ManifoldSolid, Mesh } from "@/lib/dentalMesh";
import { sampler, squaredDistanceTo, type Grid } from "@/lib/meshRound";
import { NearestSurface } from "@/lib/nearestSurface";
import { polygonDistance } from "@/lib/dentalSnapHinge";
import { distanceFromEdge } from "@/lib/dentalBase";
import { boundaryLoops } from "@/lib/dentalMesh";

type Ring = Array<[number, number]>;

export const SMOOTH = {
  /** The grid's step, mm (coarser on a big model, to keep within MAX_VOXELS). */
  step: 0.4,
  /** The ledge's height above the rim, mm, and how far below where the scan is cut it stands (so the fillet is on the base, not the gum). */
  ledge: 5,
  belowCut: 3,
  /** The shell's wall, mm. */
  wall: 2.2,
  /** The fillet's size between the gum and the ledge, mm. Build 122 (Rakesh): a typodont's broad concave sweep, not a crease. */
  fillet: 7,
  /** The drape's fall per mm out from the scan's edge. */
  drapeSlope: 2.2,
  /** How much the drape's heights are smoothed (Gaussian sigma), mm. */
  drapeSmooth: 1.4,
  /** How far the drape stands above the scan's ragged edge, mm. */
  drapeLift: 0.2,
  /** Build 122: negative - near its edge the field stands this far outside the scan, so the scan's ragged edge is buried under it. */
  edgeEase: -0.4,
  /** ...and beside a tooth it is eased this far in under the scan instead, so the tooth's own surface shows, mm. */
  edgeEaseTooth: 0.8,
  /** Over how much of the scan's edge (in from it) the scan gives way to the drape, mm. */
  edgeBand: 3,
  /** The blend between the scan and the drape, mm. */
  drapeBlend: 3.5,
  /**
   * Build 122 (Rakesh): the edge's heights smoothed along the arch (Gaussian sigma, mm) before the drape falls from them,
   * so a scalloped or ragged edge never runs down the drape as folds - from above (the highest edge within edgeReach),
   * never lower than the edge itself, so the edge is always buried.
   */
  edgeSmooth: 3,
  edgeReach: 1,
  /** Build 122: over this much of the scan in from its edge, the drape stays at the edge's height, mm. */
  plateau: 2,
  /**
   * Build 123: ...and on out past the edge this far, mm, before it falls - so its smoothing (drapeSmooth), which rounds
   * the shoulder where it starts to fall, never lowers it at the edge itself, where the wall closing the scan to the
   * floor stands (on a trimmed scan that wall showed below the edge as a ragged, striated band).
   */
  plateauOut: 1.4,
  /** Build 122: the seam's envelope - how much it is smoothed (sigma) and how far it stands out over the body, mm. */
  seamSmooth: 1,
  seamCover: 0.3,
  /** Build 122: within this of a tooth the field never stands out over the scan, mm. */
  toothClear: 1.5,
  /** Build 122: the narrowest the scan-to-drape blend gets beside a tooth (elsewhere no wider than the distance to one), mm. */
  toothBlend: 0.8,
  /** How far inside the scan the field stands round the teeth (the scan's crowns show), and how far out from them, mm. */
  inset: 0.25,
  insetReach: 1,
  /** How far past the outline the field reaches (the wall is cut exactly to the outline), mm. */
  wallSpare: 0.4,
  /** The rounding of the outline's top edge, mm. */
  edgeRound: 1.5,
  /** How much the cavity's field is smoothed (sigma), mm. */
  cavitySmooth: 1,
  /** An edge point raises the drape no higher than the lowest edge within this of it, mm. */
  seedOpen: 1,
  /** Build 123: ...but an edge point is lowered so by no more than this, mm (a tag is taken off before: TAG_RISE). */
  seedRaw: 0,
  /** A boundary loop shorter than this is a hole in the scan, not its edge: it seeds no drape, mm. */
  holeLoop: 40,
  /** Taubin smoothing passes over the level set's surface (takes out the grid's faint ripple on curved parts). */
  passes: 6,
  /** Within this of the scan, its distance is exact (from its triangles), mm. */
  distanceBand: 1.5,
} as const;

/** The most voxels the base's grid may have. */
const MAX_VOXELS = 14_000_000;

const smin = (a: number, b: number, k: number) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);
const smooth01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** The barycentric coordinates of point p (on triangle t of a soup) into out; false for a degenerate triangle. */
function barycentric(soup: Float32Array, t: number, p: ArrayLike<number>, out: Float64Array) {
  const o = t * 9;
  const e0x = soup[o + 3] - soup[o], e0y = soup[o + 4] - soup[o + 1], e0z = soup[o + 5] - soup[o + 2];
  const e1x = soup[o + 6] - soup[o], e1y = soup[o + 7] - soup[o + 1], e1z = soup[o + 8] - soup[o + 2];
  const px = p[0] - soup[o], py = p[1] - soup[o + 1], pz = p[2] - soup[o + 2];
  const d00 = e0x * e0x + e0y * e0y + e0z * e0z, d01 = e0x * e1x + e0y * e1y + e0z * e1z, d11 = e1x * e1x + e1y * e1y + e1z * e1z;
  const d20 = px * e0x + py * e0y + pz * e0z, d21 = px * e1x + py * e1y + pz * e1z;
  const den = d00 * d11 - d01 * d01;
  if (Math.abs(den) < 1e-18) return false;
  const v = (d11 * d20 - d01 * d21) / den, w = (d00 * d21 - d01 * d20) / den;
  out[0] = 1 - v - w; out[1] = v; out[2] = w;
  return true;
}

/** For every cell of an nx by ny grid, the index of the nearest set cell of `seed` (-1 when none) - an exact feature transform. */
export function nearestSeed2D(seed: Uint8Array, nx: number, ny: number): Int32Array {
  // Along x: the nearest seed in the row.
  const rowAt = new Int32Array(nx * ny).fill(-1);
  for (let y = 0; y < ny; y += 1) {
    let last = -1;
    for (let x = 0; x < nx; x += 1) { if (seed[y * nx + x]) last = x; rowAt[y * nx + x] = last; }
    last = -1;
    for (let x = nx - 1; x >= 0; x -= 1) {
      if (seed[y * nx + x]) last = x;
      const k = y * nx + x, l = rowAt[k];
      if (last >= 0 && (l < 0 || last - x < x - l)) rowAt[k] = last;
    }
  }
  // Along y: the lower envelope of the parabolas (y - q)^2 + dx(q)^2 (Felzenszwalb and Huttenlocher), keeping which q.
  const out = new Int32Array(nx * ny).fill(-1);
  const f = new Float64Array(ny), v = new Int32Array(ny), z = new Float64Array(ny + 1);
  for (let x = 0; x < nx; x += 1) {
    let n = 0;
    for (let q = 0; q < ny; q += 1) { const l = rowAt[q * nx + x]; f[q] = l < 0 ? Infinity : (x - l) * (x - l); }
    let k = -1;
    for (let q = 0; q < ny; q += 1) {
      if (f[q] === Infinity) continue;
      if (k < 0) { k = 0; v[0] = q; z[0] = -Infinity; z[1] = Infinity; n += 1; continue; }
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (k > 0 && s <= z[k]) { k -= 1; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      if (k === 0 && s <= z[0]) { v[0] = q; z[1] = Infinity; continue; }
      k += 1; v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    if (!n) continue;
    let j = 0;
    for (let q = 0; q < ny; q += 1) {
      while (z[j + 1] < q) j += 1;
      const row = v[j];
      out[q * nx + x] = row * nx + rowAt[row * nx + x];
    }
  }
  return out;
}

/** A separable Gaussian blur of a field (2-D when nz is 1), sigma in cells. */
export function blur(field: Float32Array, nx: number, ny: number, nz: number, sigma: number): Float32Array {
  if (sigma <= 0.3) return Float32Array.from(field);
  const r = Math.ceil(sigma * 2.5), w = new Float64Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i += 1) { w[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += w[i + r]; }
  for (let i = 0; i < w.length; i += 1) w[i] /= sum;
  let a = Float32Array.from(field), b = new Float32Array(field.length);
  const pass = (n: number, stride: number, lines: number[]) => {
    for (const start of lines) {
      for (let i = 0; i < n; i += 1) {
        let s = 0;
        for (let k = -r; k <= r; k += 1) { const j = Math.max(0, Math.min(n - 1, i + k)); s += w[k + r] * a[start + j * stride]; }
        b[start + i * stride] = s;
      }
    }
    const t = a; a = b; b = t;
  };
  const xs: number[] = [], ys: number[] = [], zs: number[] = [];
  for (let z = 0; z < nz; z += 1) for (let y = 0; y < ny; y += 1) xs.push((z * ny + y) * nx);
  for (let z = 0; z < nz; z += 1) for (let x = 0; x < nx; x += 1) ys.push(z * ny * nx + x);
  for (let y = 0; y < ny; y += 1) for (let x = 0; x < nx; x += 1) zs.push(y * nx + x);
  pass(nx, 1, xs);
  pass(ny, nx, ys);
  if (nz > 1) pass(nz, nx * ny, zs);
  return a;
}

export type SmoothBaseInput = {
  /** The scan (open), in the arch's frame: teeth up, the occlusal plane at z = 0, faces outward. */
  scan: Mesh;
  /** The scan's corners on the teeth (the crowns the caller adds exactly). */
  teeth: Uint8Array;
  /** The base's outline (the rim), and the rim's height. */
  outline: Ring;
  floor: number;
  /** Open underneath (a shell) or solid. */
  open: boolean;
  step?: number;
  /** The ledge's height above the rim, mm (SMOOTH.ledge unless given - lower on an aligner model). */
  ledge?: number;
  /** Build 122: the fillet onto the ledge and the rounding of the wall's top edge, mm (SMOOTH's unless given - tighter on an orthodontic base). */
  fillet?: number;
  edgeRound?: number;
};

export type SmoothBaseFields = { grid: Grid; outer: Float32Array; cavity: Float32Array | null; timing: Record<string, number> };

/** The base's fields (positive inside): the model's outside below the teeth, and the cavity. */
export function smoothBaseFields(input: SmoothBaseInput): SmoothBaseFields {
  const { scan, teeth, outline, floor } = input;
  const timing: Record<string, number> = {};
  let clock = Date.now();
  const lap = (name: string) => { const now = Date.now(); timing[name] = now - clock; clock = now; };
  const S = SMOOTH;
  // The grid: over the outline, from below the rim (the cavity opens through it) to above the scan.
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, top = -Infinity;
  outline.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
  for (let i = 2; i < scan.v.length; i += 3) top = Math.max(top, scan.v[i]);
  const z0 = floor - S.wall - 1, z1 = top + 1.5;
  x0 -= 2; y0 -= 2; x1 += 2; y1 += 2;
  let h = input.step ?? S.step;
  h = Math.max(h, Math.cbrt(((x1 - x0) * (y1 - y0) * (z1 - z0)) / MAX_VOXELS));
  const nx = Math.ceil((x1 - x0) / h), ny = Math.ceil((y1 - y0) / h), nz = Math.ceil((z1 - z0) / h);
  const grid: Grid = { nx, ny, nz, h, origin: [x0, y0, z0] };
  const cx = (i: number) => x0 + (i + 0.5) * h, cy = (j: number) => y0 + (j + 0.5) * h, cz = (k: number) => z0 + (k + 0.5) * h;
  const n2 = nx * ny;
  const { v, f } = scan;
  // --- The scan's triangles: the highest surface over each column, every crossing (for which side is inside), and the voxels it passes through.
  const H = new Float32Array(n2).fill(-Infinity);
  const counts = new Int32Array(n2 + 1);
  const forColumns = (visit: (column: number, z: number) => void) => {
    for (let t = 0; t + 2 < f.length; t += 3) {
      const a = f[t] * 3, b = f[t + 1] * 3, c = f[t + 2] * 3;
      const ax = v[a], ay = v[a + 1], az = v[a + 2], bx = v[b], by = v[b + 1], bz = v[b + 2], qx = v[c], qy = v[c + 1], qz = v[c + 2];
      const det = (bx - ax) * (qy - ay) - (qx - ax) * (by - ay);
      if (Math.abs(det) < 1e-12) continue;
      const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, qx) - x0) / h - 0.5)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, qx) - x0) / h - 0.5));
      const j0 = Math.max(0, Math.ceil((Math.min(ay, by, qy) - y0) / h - 0.5)), j1 = Math.min(ny - 1, Math.floor((Math.max(ay, by, qy) - y0) / h - 0.5));
      for (let j = j0; j <= j1; j += 1) {
        const py = cy(j) + 1.3e-7;
        for (let i = i0; i <= i1; i += 1) {
          const px = cx(i) + 0.7e-7;
          const u = ((bx - px) * (qy - py) - (qx - px) * (by - py)) / det;
          const w = ((qx - px) * (ay - py) - (ax - px) * (qy - py)) / det;
          const s = 1 - u - w;
          if (u < 0 || w < 0 || s < 0) continue;
          visit(j * nx + i, u * az + w * bz + s * qz);
        }
      }
    }
  };
  forColumns((column, z) => { counts[column + 1] += 1; if (z > H[column]) H[column] = z; });
  // The corners too, so no column a small triangle covers is missed.
  for (let i = 0; i < v.length; i += 3) {
    const gi = Math.floor((v[i] - x0) / h), gj = Math.floor((v[i + 1] - y0) / h);
    if (gi >= 0 && gj >= 0 && gi < nx && gj < ny && v[i + 2] > H[gj * nx + gi]) H[gj * nx + gi] = v[i + 2];
  }
  for (let c = 0; c < n2; c += 1) counts[c + 1] += counts[c];
  const crossings = new Float32Array(counts[n2]);
  const fill = counts.slice(0, n2);
  forColumns((column, z) => { crossings[fill[column]++] = z; });
  for (let c = 0; c < n2; c += 1) if (counts[c + 1] - counts[c] > 1) crossings.subarray(counts[c], counts[c + 1]).sort();
  lap("columns");
  // --- 2-D: where the scan is (closed over small gaps), how far in from its edge, its height everywhere (the drape beyond it).
  const covered0 = new Uint8Array(n2);
  for (let c = 0; c < n2; c += 1) covered0[c] = Number.isFinite(H[c]) ? 1 : 0;
  const grow = (mask: Uint8Array, r: number) => { const d = squaredDistanceTo(mask, nx, ny, 1); return Uint8Array.from(d, (q) => (q <= r * r ? 1 : 0)); };
  const shrink = (mask: Uint8Array, r: number) => { const inv = Uint8Array.from(mask, (q) => 1 - q); return Uint8Array.from(grow(inv, r), (q) => 1 - q); };
  const covered = grow(shrink(shrink(grow(covered0, 2), 2), 1), 1);
  const hasH = Uint8Array.from(H, (z) => (Number.isFinite(z) ? 1 : 0));
  const toH = nearestSeed2D(hasH, nx, ny);
  const Hn = new Float32Array(n2);
  for (let c = 0; c < n2; c += 1) Hn[c] = toH[c] >= 0 ? H[toH[c]] : floor;
  const toCovered = nearestSeed2D(covered, nx, ny);
  const inFromEdge = new Float32Array(n2);
  {
    const d = squaredDistanceTo(Uint8Array.from(covered, (q) => 1 - q), nx, ny, 1);
    for (let c = 0; c < n2; c += 1) inFromEdge[c] = Math.sqrt(d[c]) * h;
  }
  const ledge = floor + (input.ledge ?? S.ledge);
  // Build 122: an orthodontic base's crisper join and top edge (lib/dentalModel passes them).
  const fillet = input.fillet ?? S.fillet, edgeRound = input.edgeRound ?? S.edgeRound;
  // The drape falls from the scan's own edge (its boundary, at the edge's height) - never from a steep face of
  // the scan (from the top of a tooth's labial face it would wrap the face in a cone).
  const alongEdge = distanceFromEdge(scan, S.edgeBand + 1);
  const seedZ = new Float32Array(n2).fill(-Infinity);
  // Only the scan's own edge seeds the drape - not the rim of a hole in it (a gap in the scan beside a molar): a cone
  // from a hole's rim, high on a tooth, would fill the hole up over the tooth.
  const outerEdge = new Uint8Array(alongEdge.length);
  for (const loop of boundaryLoops(scan)) {
    let length = 0;
    for (let k = 0; k < loop.length; k += 1) { const a = loop[k] * 3, b = loop[(k + 1) % loop.length] * 3; length += Math.hypot(v[a] - v[b], v[a + 1] - v[b + 1], v[a + 2] - v[b + 2]); }
    if (length >= S.holeLoop) for (const i of loop) outerEdge[i] = 1;
  }
  for (let i = 0; i < alongEdge.length; i += 1) {
    if (alongEdge[i] !== 0 || !outerEdge[i]) continue;
    const gi = Math.floor((v[i * 3] - x0) / h), gj = Math.floor((v[i * 3 + 1] - y0) / h);
    if (gi >= 0 && gj >= 0 && gi < nx && gj < ny) seedZ[gj * nx + gi] = Math.max(seedZ[gj * nx + gi], v[i * 3 + 2]);
  }
  // A narrow flap of tissue standing up at the edge (a retromolar tag) would raise a cone round it: each edge
  // point is taken no higher than the lowest edge within SEED_OPEN of it, so only broad edges raise the drape.
  // Build 123: the edge's own heights, kept - a trimmed scan's jagged edge must still be buried (see below).
  const rawSeedZ = Float32Array.from(seedZ);
  {
    const r = Math.ceil(S.seedOpen / h), low = new Float32Array(n2).fill(Infinity);
    const cells: number[] = [];
    for (let c = 0; c < n2; c += 1) if (Number.isFinite(seedZ[c])) cells.push(c);
    for (const c of cells) {
      const ci = c % nx, cj = Math.floor(c / nx);
      let m = seedZ[c];
      for (let dj = -r; dj <= r; dj += 1) for (let di = -r; di <= r; di += 1) {
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= nx || j >= ny || di * di + dj * dj > r * r) continue;
        const z = seedZ[j * nx + i];
        if (Number.isFinite(z) && z < m) m = z;
      }
      low[c] = m;
    }
    for (const c of cells) seedZ[c] = low[c];
  }
  // Build 122: the edge's heights smoothed along the arch from above - an upper envelope (each edge point the highest
  // edge within edgeReach of it), carried everywhere from the nearest edge point, blurred, read back at the edge and
  // never below the edge itself - so the drape starts at or over the scan's edge all round (it is buried, no line) and
  // the edge's scallops and dips never run down the drape as folds.
  {
    const isSeed = Uint8Array.from(seedZ, (z) => (Number.isFinite(z) ? 1 : 0));
    const r = Math.ceil(S.edgeReach / h), high = new Float32Array(n2).fill(-Infinity);
    const cells: number[] = [];
    for (let c = 0; c < n2; c += 1) if (isSeed[c]) cells.push(c);
    for (const c of cells) {
      const ci = c % nx, cj = Math.floor(c / nx);
      let m = seedZ[c];
      for (let dj = -r; dj <= r; dj += 1) for (let di = -r; di <= r; di += 1) {
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= nx || j >= ny || di * di + dj * dj > r * r) continue;
        const z = seedZ[j * nx + i];
        if (Number.isFinite(z) && z > m) m = z;
      }
      high[c] = m;
    }
    const toSeed = nearestSeed2D(isSeed, nx, ny);
    const carried = new Float32Array(n2);
    for (let c = 0; c < n2; c += 1) carried[c] = toSeed[c] >= 0 ? high[toSeed[c]] : ledge;
    const smoothed = blur(carried, nx, ny, 1, S.edgeSmooth / h);
    // Build 123: never below the edge's own height there either, but by more than seedRaw (a tag standing higher over the edge is gone by then)
    // nearby - a jagged trim line's points, lowered to the dips between them above, would leave the wall under each
    // point standing out below the drape as a ragged, striated band.
    for (const c of cells) seedZ[c] = Math.max(smoothed[c], seedZ[c], Math.min(rawSeedZ[c], seedZ[c] + S.seedRaw));
  }
  // The highest of the cones falling at DRAPE_SLOPE from every point of the edge (a chamfer dilation: continuous,
  // never a step where one edge point's reach gives way to the next's).
  const dilate = (seedAt: (c: number) => number, slope: number) => {
    const out = new Float32Array(n2);
    for (let c = 0; c < n2; c += 1) out[c] = Number.isFinite(seedZ[c]) ? seedAt(c) : ledge - 3;
    const fall = slope * h, fallD = fall * Math.SQRT2;
    for (let pass = 0; pass < 2; pass += 1) {
      for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) {
        const c = j * nx + i;
        let z = out[c];
        if (i > 0) z = Math.max(z, out[c - 1] - fall);
        if (j > 0) { z = Math.max(z, out[c - nx] - fall); if (i > 0) z = Math.max(z, out[c - nx - 1] - fallD); if (i < nx - 1) z = Math.max(z, out[c - nx + 1] - fallD); }
        out[c] = z;
      }
      for (let j = ny - 1; j >= 0; j -= 1) for (let i = nx - 1; i >= 0; i -= 1) {
        const c = j * nx + i;
        let z = out[c];
        if (i < nx - 1) z = Math.max(z, out[c + 1] - fall);
        if (j < ny - 1) { z = Math.max(z, out[c + nx] - fall); if (i < nx - 1) z = Math.max(z, out[c + nx + 1] - fallD); if (i > 0) z = Math.max(z, out[c + nx - 1] - fallD); }
        out[c] = z;
      }
    }
    return out;
  };
  const drape = dilate((c) => seedZ[c], S.drapeSlope);
  for (let c = 0; c < n2; c += 1) drape[c] = Math.max(drape[c], ledge - 3);
  // Build 122: over the scan's last `plateau` mm the drape stays at the edge's own height rather than falling in under
  // the scan - the smoothing below then rounds only its fall outward, never lowers it at the edge, so the wall that
  // closes the scan down to the floor stays buried under it.
  {
    const isSeed = Uint8Array.from(seedZ, (z) => (Number.isFinite(z) ? 1 : 0));
    const toSeed = nearestSeed2D(isSeed, nx, ny);
    const outside = squaredDistanceTo(covered, nx, ny, 1), reach = (S.plateauOut / h) ** 2;
    for (let c = 0; c < n2; c += 1) {
      if (toSeed[c] < 0) continue;
      if (covered[c] ? inFromEdge[c] < S.plateau : outside[c] <= reach) drape[c] = Math.max(drape[c], seedZ[toSeed[c]]);
    }
  }
  const smoothDrape = blur(drape, nx, ny, 1, S.drapeSmooth / h);
  const drapeNorm = new Float32Array(n2);
  for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) {
    const c = j * nx + i;
    const gx = (smoothDrape[j * nx + Math.min(nx - 1, i + 1)] - smoothDrape[j * nx + Math.max(0, i - 1)]) / (2 * h);
    const gy = (smoothDrape[Math.min(ny - 1, j + 1) * nx + i] - smoothDrape[Math.max(0, j - 1) * nx + i]) / (2 * h);
    drapeNorm[c] = 1 / Math.sqrt(1 + gx * gx + gy * gy);
  }
  // Away from the scan, its edge's nearness by column - smoothed, so it never steps from one column to the next.
  const edgeField = blur(Float32Array.from(inFromEdge, (d, col) => (covered[col] ? 1 - smooth01(d / S.edgeBand) : 1)), nx, ny, 1, 0.75 / h);
  const edgeAt = (col: number) => edgeField[col];
  // The outline's distance (negative inside).
  const ring = outline.map(([x, y]) => [x, y] as [number, number]);
  const rim = new Float32Array(n2);
  for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) rim[j * nx + i] = polygonDistance(ring, cx(i), cy(j));
  lap("2d");
  // --- 3-D: the scan's distance, exact near it.
  const n3 = n2 * nz;
  const mark = new Uint8Array(n3);
  // Build 122: the teeth's own voxels too - how far each voxel is from a tooth, for the blend's width near them.
  const markTooth = new Uint8Array(n3);
  const soup = new Float32Array(f.length * 3);
  for (let t = 0; t < f.length; t += 1) { soup[t * 3] = v[f[t] * 3]; soup[t * 3 + 1] = v[f[t] * 3 + 1]; soup[t * 3 + 2] = v[f[t] * 3 + 2]; }
  for (let t = 0; t + 8 < soup.length; t += 9) {
    const onTooth = teeth[f[t / 3]] && teeth[f[t / 3 + 1]] && teeth[f[t / 3 + 2]];
    // Points over the triangle at under half a voxel apart.
    const e = Math.max(Math.hypot(soup[t + 3] - soup[t], soup[t + 4] - soup[t + 1], soup[t + 5] - soup[t + 2]), Math.hypot(soup[t + 6] - soup[t], soup[t + 7] - soup[t + 1], soup[t + 8] - soup[t + 2]));
    const n = Math.max(1, Math.ceil(e / (h * 0.5)));
    for (let a = 0; a <= n; a += 1) for (let b = 0; a + b <= n; b += 1) {
      const u = a / n, w = b / n, s = 1 - u - w;
      const px = s * soup[t] + u * soup[t + 3] + w * soup[t + 6], py = s * soup[t + 1] + u * soup[t + 4] + w * soup[t + 7], pz = s * soup[t + 2] + u * soup[t + 5] + w * soup[t + 8];
      const gi = Math.floor((px - x0) / h), gj = Math.floor((py - y0) / h), gk = Math.floor((pz - z0) / h);
      if (gi >= 0 && gj >= 0 && gk >= 0 && gi < nx && gj < ny && gk < nz) { mark[(gk * ny + gj) * nx + gi] = 1; if (onTooth) markTooth[(gk * ny + gj) * nx + gi] = 1; }
    }
  }
  const toSurface = squaredDistanceTo(mark, nx, ny, nz);
  const toTooth = squaredDistanceTo(markTooth, nx, ny, nz);
  lap("edt");
  const near = new NearestSurface(soup, S.distanceBand + h);
  const q = new Float64Array(3), bary = new Float64Array(3);
  // Each corner's nearness to the scan's own edge (1 at it, 0 from EDGE_BAND in), measured over the surface.
  const edgeW = Float32Array.from(alongEdge, (d) => 1 - smooth01(d / S.edgeBand));
  const band = (S.distanceBand / h) ** 2;
  const outer = new Float32Array(n3);
  const base = input.open ? new Float32Array(n3) : null;
  // Build 122: the body before it is cut, and how much of the seam's smoothing each voxel takes (see below).
  const bodies = new Float32Array(n3), seamW = new Float32Array(n3);
  for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) {
    const c = j * nx + i;
    const list = crossings.subarray(counts[c], counts[c + 1]);
    let above = list.length, p = 0;
    const easeAt = (_col: number, e: number) => S.inset * (1 - e);
    const edgeHere = edgeAt(c), easeHere = easeAt(c, edgeHere);
    for (let k = 0; k < nz; k += 1) {
      const z = cz(k);
      while (p < list.length && list[p] < z) { p += 1; above -= 1; }
      const index = (k * ny + j) * nx + i;
      let d = Math.sqrt(toSurface[index]) * h, edge = edgeHere, ease = easeHere, onTooth = 0;
      const inside = above % 2 === 1;
      if (toSurface[index] <= band) {
        const exact = near.nearest(cx(i), cy(j), z, q);
        if (exact !== Infinity) {
          d = exact;
          // Near the scan, how much it is eased in is the nearest surface point's - not this column's, which
          // would step from column to column down a steep wall and streak it.
          const gi = Math.floor((q[0] - x0) / h), gj = Math.floor((q[1] - y0) / h);
          const t = near.lastTriangle;
          if (t >= 0) {
            // How near the scan's edge the nearest point is: along the surface, from its triangle's corners - smooth, never a step.
            const a = f[t * 3], b = f[t * 3 + 1], c3 = f[t * 3 + 2];
            const w = barycentric(soup, t, q, bary);
            if (w) {
              edge = bary[0] * edgeW[a] + bary[1] * edgeW[b] + bary[2] * edgeW[c3];
              // Build 122: how much the nearest scan point is tooth - there the field never stands out over it.
              onTooth = bary[0] * (teeth[a] ? 1 : 0) + bary[1] * (teeth[b] ? 1 : 0) + bary[2] * (teeth[c3] ? 1 : 0);
            }
          }
          if (gi >= 0 && gj >= 0 && gi < nx && gj < ny) ease = easeAt(gj * nx + gi, edge);
        }
      }
      const scanSd = (inside ? -d : d) + ease;
      const drapeSd = (z - smoothDrape[c]) * drapeNorm[c] - S.drapeLift * edgeHere;
      // Over the scan's last EDGE_BAND it is eased in under the drape, so its ragged edge is buried.
      // (Near a tooth the blend is never wider than the distance to it, so its rounding never reaches the tooth; nor
      // does the field stand out over the scan there.)
      const dTooth = Math.sqrt(toTooth[index]) * h;
      const blendHere = Math.max(S.toothBlend, Math.min(S.drapeBlend, dTooth));
      const standOut = smooth01(dTooth / S.toothClear) * (1 - onTooth);
      // Over the scan's last edgeBand: out on the gum the field stands a little out over it (its ragged edge buried);
      // beside a tooth it is eased in under it, as before build 122, so the scan's own tooth surface always shows.
      const easeEdge = edge * (S.edgeEaseTooth + (S.edgeEase - S.edgeEaseTooth) * standOut);
      bodies[index] = smin(smin(scanSd + easeEdge, drapeSd, blendHere), z - ledge, fillet);
      seamW[index] = edge * standOut;
    }
  }
  // Build 122 (Rakesh): over the seam - the scan's last edgeBand, never beside a tooth - a smoothed envelope of the body
  // (blurred seamSmooth, stood seamCover out) is laid over it, so the scan's lumpy edge is covered, not traced: one
  // even line where the gum meets the drape.
  const smoothed = blur(bodies, nx, ny, nz, S.seamSmooth / h);
  for (let k = 0; k < nz; k += 1) {
    const z = cz(k);
    for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) {
      const c = j * nx + i, index = (k * ny + j) * nx + i;
      const raw = bodies[index], w = seamW[index];
      const body = w > 0 ? raw + (Math.min(raw, smoothed[index] - S.seamCover) - raw) * w : raw;
      // The field reaches a little past the outline; the caller cuts the wall exactly (a prism), so it is flat.
      const cut = smax(body, rim[c] - S.wallSpare, edgeRound);
      if (base) base[index] = cut;
      outer[index] = -Math.max(cut, floor - z);
    }
  }
  lap("field");
  let cavity: Float32Array | null = null;
  if (base) {
    cavity = blur(base, nx, ny, nz, S.cavitySmooth / h);
    for (let i = 0; i < n3; i += 1) cavity[i] = -(cavity[i] + S.wall);
  }
  lap("cavity");
  return { grid, outer, cavity, timing };
}

/** The base as solids: the model's outside below the teeth, and the cavity (to take out), or null for a solid base. */
export function smoothBase(runtime: ManifoldRuntime, input: SmoothBaseInput): { outer: ManifoldSolid; cavity: ManifoldSolid | null; step: number; timing: Record<string, number> } {
  const { grid, outer, cavity, timing } = smoothBaseFields(input);
  let clock = Date.now();
  const { nx, ny, nz, h, origin } = grid;
  const bounds = { min: [origin[0], origin[1], origin[2]] as [number, number, number], max: [origin[0] + nx * h, origin[1] + ny * h, origin[2] + nz * h] as [number, number, number] };
  const outside = smoothSolid(runtime, runtime.Manifold.levelSet(sampler(outer, grid, -1), bounds, h, 0), SMOOTH.passes);
  // The cavity runs out through the rim: below the grid it is open.
  const hollow = cavity ? smoothSolid(runtime, runtime.Manifold.levelSet(sampler(cavity, grid, -1), bounds, h, 0), SMOOTH.passes) : null;
  timing.levelSet = Date.now() - clock;
  return { outer: outside, cavity: hollow, step: h, timing };
}

/**
 * Tags of tissue standing up at the scan's edge (a retromolar or frenum tag the scan caught): the scan's faces
 * on its edge that stand more than TAG_RISE above the lowest of the edge within SMOOTH.seedOpen
 * of them, never on the teeth. A technician trims these off a cast; on a smooth base they would stand as a fin
 * with a wall under it. Returns the scan without them (the same mesh when there are none).
 */
export const TAG_RISE = 1.5;
/** Peeled this many times: each pass takes the faces on the edge's corners that stand above the edge nearby. */
export const TAG_PASSES = 6;
export function withoutTags(scan: Mesh, teeth: Uint8Array): Mesh {
  let m: Mesh = scan;
  const cell = 0.5, r = Math.ceil(SMOOTH.seedOpen / cell);
  for (let pass = 0; pass < TAG_PASSES; pass += 1) {
    const { v, f } = m;
    const along = distanceFromEdge(m, 0.01);
    const lowest = new Map<number, number>();
    for (let i = 0; i < along.length; i += 1) {
      if (along[i] !== 0) continue;
      const k = Math.floor(v[i * 3] / cell) * 100003 + Math.floor(v[i * 3 + 1] / cell);
      lowest.set(k, Math.min(lowest.get(k) ?? Infinity, v[i * 3 + 2]));
    }
    const tag = new Uint8Array(along.length);
    let any = false;
    for (let i = 0; i < along.length; i += 1) {
      if (along[i] !== 0 || teeth[i]) continue;
      const ci = Math.floor(v[i * 3] / cell), cj = Math.floor(v[i * 3 + 1] / cell);
      let low = Infinity;
      for (let di = -r; di <= r; di += 1) for (let dj = -r; dj <= r; dj += 1) {
        if (di * di + dj * dj > r * r) continue;
        const z = lowest.get((ci + di) * 100003 + (cj + dj));
        if (z !== undefined && z < low) low = z;
      }
      if (v[i * 3 + 2] > low + TAG_RISE) { tag[i] = 1; any = true; }
    }
    if (!any) break;
    const kept: number[] = [];
    // A face touching the teeth is never taken, even beside a tag.
    for (let t = 0; t + 2 < f.length; t += 3) if (!(tag[f[t]] || tag[f[t + 1]] || tag[f[t + 2]]) || teeth[f[t]] || teeth[f[t + 1]] || teeth[f[t + 2]]) kept.push(f[t], f[t + 1], f[t + 2]);
    if (kept.length === f.length) break;
    m = { v, f: kept };
  }
  return m;
}

/**
 * A level set's surface smoothed (Taubin: a step in and a step back out each pass, so it does not shrink) - the
 * marching grid leaves a faint ripple on gently curved parts (the fillet) that shows in a render. The solid is
 * freed and a new one returned.
 */
export function smoothSolid(runtime: ManifoldRuntime, solid: ManifoldSolid, passes: number): ManifoldSolid {
  if (passes <= 0) return solid;
  const mesh = solid.getMesh();
  const np = mesh.numProp, p = mesh.vertProperties, tv = mesh.triVerts, n = p.length / np;
  // Corners shared along a seam (Manifold's merge lists) move together: work on the merged corners.
  const root = new Int32Array(n).map((_, i) => i);
  if (mesh.mergeFromVert) for (let k = 0; k < mesh.mergeFromVert.length; k += 1) root[mesh.mergeFromVert[k]] = mesh.mergeToVert![k];
  const start = new Int32Array(n + 1);
  for (let t = 0; t < tv.length; t += 1) start[root[tv[t]] + 1] += 2;
  for (let i = 0; i < n; i += 1) start[i + 1] += start[i];
  const fill = start.slice(0, n), nb = new Int32Array(start[n]);
  for (let t = 0; t < tv.length; t += 3) for (let k = 0; k < 3; k += 1) {
    const a = root[tv[t + k]], b = root[tv[t + ((k + 1) % 3)]], c = root[tv[t + ((k + 2) % 3)]];
    nb[fill[a]++] = b; nb[fill[a]++] = c;
  }
  const x = new Float64Array(n * 3), y = new Float64Array(n * 3);
  for (let i = 0; i < n; i += 1) for (let a = 0; a < 3; a += 1) x[i * 3 + a] = p[i * np + a];
  const step = (from: Float64Array, to: Float64Array, f: number) => {
    for (let i = 0; i < n; i += 1) {
      if (root[i] !== i) continue;
      const s0 = start[i], s1 = start[i + 1];
      if (s1 === s0) { to[i * 3] = from[i * 3]; to[i * 3 + 1] = from[i * 3 + 1]; to[i * 3 + 2] = from[i * 3 + 2]; continue; }
      let mx = 0, my = 0, mz = 0;
      for (let k = s0; k < s1; k += 1) { const j = nb[k]; mx += from[j * 3]; my += from[j * 3 + 1]; mz += from[j * 3 + 2]; }
      const c = s1 - s0;
      to[i * 3] = from[i * 3] + f * (mx / c - from[i * 3]);
      to[i * 3 + 1] = from[i * 3 + 1] + f * (my / c - from[i * 3 + 1]);
      to[i * 3 + 2] = from[i * 3 + 2] + f * (mz / c - from[i * 3 + 2]);
    }
  };
  for (let pass = 0; pass < passes; pass += 1) { step(x, y, 0.5); step(y, x, -0.53); }
  const out = new Float32Array(p.length);
  out.set(p);
  for (let i = 0; i < n; i += 1) { const r = root[i]; for (let a = 0; a < 3; a += 1) out[i * np + a] = x[r * 3 + a]; }
  const made = new runtime.Manifold(new runtime.Mesh({ numProp: np, vertProperties: out, triVerts: Uint32Array.from(tv), ...(mesh.mergeFromVert ? { mergeFromVert: mesh.mergeFromVert, mergeToVert: mesh.mergeToVert } : {}) }));
  solid.delete();
  return made;
}
