/**
 * Build 109: Wax-up Studio's palatal (lingual, on a lower) stops - a line the dentist draws on each of the
 * patient's teeth, on the palatal or lingual side, beyond which the wax-up must not stand.
 *
 * The line is drawn before any wax tooth is placed and belongs to the scan; every wax tooth then follows its
 * own tooth's line wherever it is moved or sculpted. Past the line (towards the cervical) the wax surface is
 * taken down onto the patient's tooth - tucked just under the scan's surface, so the made model shows the
 * patient's own palatal surface there - and over a short band before the line it eases down to it, so the
 * wax meets the tooth at the line with no ledge. Vertices are only moved, never cut away: the tooth stays a
 * closed shell and nothing has to be patched before it is joined to the model.
 */
import type { NearestSurface } from "@/lib/nearestSurface";

export type Vec3 = [number, number, number];

/** How far before (coronal of) the line the wax starts easing down onto the tooth, mm. */
export const STOP_BAND = 1;
/** How far under the patient's surface the wax is tucked past the line, mm (a clean join, no shared faces). */
export const STOP_TUCK = 0.05;
/** How far past each end of the line the stop fades out, mm (the line wraps a little into the proximal surfaces). */
export const STOP_END = 0.8;
/** Wax this far behind the line's surface (through the tooth, on its labial side) is never moved, mm. */
export const STOP_DEPTH = 2.5;
/** The line is sampled about this often along its length, mm. */
const STEP = 0.2;

const sub = (a: ArrayLike<number>, b: ArrayLike<number>): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: ArrayLike<number>, b: ArrayLike<number>): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const smooth01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/**
 * The line through the clicked points (Catmull-Rom, through every point), sampled about every 0.2 mm, each
 * sample put down on the surface. One point gives that point; none, nothing.
 */
export function stopCurve(points: Vec3[], surface: NearestSurface | null): Vec3[] {
  if (points.length < 2) return points.slice();
  const out: Vec3[] = [];
  const at = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const steps = Math.max(1, Math.ceil(Math.hypot(...sub(p2, p1)) / STEP));
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const p: Vec3 = [0, 1, 2].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)) as Vec3;
      out.push(p);
    }
  }
  out.push(points[points.length - 1].slice() as Vec3);
  if (!surface) return out;
  const q = [0, 0, 0];
  return out.map((p) => (surface.nearest(p[0], p[1], p[2], q) < Infinity ? [q[0], q[1], q[2]] as Vec3 : p));
}

/** A line made ready for blending: its samples, and at each the way along it, the surface's outward normal and the way past it (cervical). */
export type StopLine = { p: Vec3[]; t: Vec3[]; n: Vec3[]; b: Vec3[]; /** -1 when the surface's triangles are wound inwards (its normals flipped to point out). */ flip: 1 | -1 };

/**
 * Readies a line (samples on the surface) for blending a tooth to it: `labial` and `incisal` are the wax
 * tooth's own directions - the line's surface faces away from labial (palatal, or lingual), and past the
 * line is away from the incisal edge.
 */
export function prepareStop(curve: Vec3[], surface: NearestSurface, labial: Vec3, incisal: Vec3): StopLine | null {
  if (curve.length < 2) return null;
  const q = [0, 0, 0], nn = [0, 0, 0];
  const raw: Vec3[] = curve.map((p) => {
    if (surface.nearest(p[0], p[1], p[2], q) === Infinity || surface.lastTriangle < 0) return [0, 0, 0];
    surface.triangleNormal(surface.lastTriangle, nn);
    return [nn[0], nn[1], nn[2]];
  });
  // The scan's winding: its palatal surface should face away from labial.
  const facing = raw.reduce((sum, v) => sum + dot(v, labial), 0);
  const flip: 1 | -1 = facing > 0 ? -1 : 1;
  // Normals averaged along the line (a scan's facets are noisy), then the way along it and the way past it.
  const n = raw.map((_, i) => {
    const s: Vec3 = [0, 0, 0];
    for (let k = Math.max(0, i - 3); k <= Math.min(raw.length - 1, i + 3); k += 1) for (let j = 0; j < 3; j += 1) s[j] += raw[k][j] * flip;
    return Math.hypot(...s) > 1e-9 ? unit(s) : unit([-labial[0], -labial[1], -labial[2]]);
  });
  const t = curve.map((_, i) => unit(sub(curve[Math.min(curve.length - 1, i + 1)], curve[Math.max(0, i - 1)])));
  let b = n.map((ni, i) => unit(cross(ni, t[i])));
  // Past the line is away from the incisal edge (one way all along: the cross product turns with the line).
  if (b.reduce((sum, v) => sum + dot(v, incisal), 0) > 0) b = b.map((v) => [-v[0], -v[1], -v[2]] as Vec3);
  return { p: curve, t, n, b, flip };
}

/**
 * The wax tooth (a world-space soup, 9 numbers a triangle) blended to its stop line on `surface` (the
 * patient's arch near it), as a new soup; null when nothing of it lies past the line.
 */
export function blendToStop(soup: ArrayLike<number>, line: StopLine, surface: NearestSurface): Float32Array | null {
  // The soup's corners joined into vertices, so a corner shared by triangles moves as one (the shell stays closed).
  const index = new Map<string, number>();
  const corner = new Int32Array(soup.length / 3);
  const xyz: number[] = [];
  for (let c = 0; c < corner.length; c += 1) {
    const x = soup[c * 3], y = soup[c * 3 + 1], z = soup[c * 3 + 2];
    const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    let v = index.get(key);
    if (v === undefined) { v = xyz.length / 3; index.set(key, v); xyz.push(x, y, z); }
    corner[c] = v;
  }
  const count = xyz.length / 3;
  const weight = new Float32Array(count);
  const out = Float64Array.from(xyz);
  const last = line.p.length - 1;
  const q = [0, 0, 0], nt = [0, 0, 0];
  let moved = 0;
  for (let v = 0; v < count; v += 1) {
    const p = [xyz[v * 3], xyz[v * 3 + 1], xyz[v * 3 + 2]];
    let best = Infinity, i = -1;
    for (let k = 0; k <= last; k += 1) {
      const s = line.p[k], d2 = (p[0] - s[0]) ** 2 + (p[1] - s[1]) ** 2 + (p[2] - s[2]) ** 2;
      if (d2 < best) { best = d2; i = k; }
    }
    if (i < 0 || best > 100) continue; // 10 mm from the line: another part of the tooth altogether
    const d = sub(p, line.p[i]);
    const past = dot(d, line.b[i]);
    const depth = dot(d, line.n[i]);
    const beyondEnd = i === 0 ? -dot(d, line.t[0]) : i === last ? dot(d, line.t[last]) : 0;
    const w = smooth01((past + STOP_BAND) / STOP_BAND) * (1 - smooth01(beyondEnd / STOP_END)) * (1 - smooth01((-depth - STOP_DEPTH) / 1));
    if (w <= 1e-3) continue;
    if (surface.nearest(p[0], p[1], p[2], q) === Infinity || surface.lastTriangle < 0) continue;
    surface.triangleNormal(surface.lastTriangle, nt);
    const nx = nt[0] * line.flip, ny = nt[1] * line.flip, nz = nt[2] * line.flip;
    const outside = (p[0] - q[0]) * nx + (p[1] - q[1]) * ny + (p[2] - q[2]) * nz;
    if (outside < -STOP_TUCK) continue; // already under the patient's surface
    const tx = q[0] - nx * STOP_TUCK, ty = q[1] - ny * STOP_TUCK, tz = q[2] - nz * STOP_TUCK;
    out[v * 3] = p[0] + w * (tx - p[0]); out[v * 3 + 1] = p[1] + w * (ty - p[1]); out[v * 3 + 2] = p[2] + w * (tz - p[2]);
    weight[v] = w;
    moved += 1;
  }
  if (!moved) return null;
  // The band eased once more (a light smoothing of what was moved part way), so the wax meets the tooth without a crease.
  const neighbours: number[][] = Array.from({ length: count }, () => []);
  for (let c = 0; c + 2 < corner.length; c += 3) {
    const a = corner[c], b = corner[c + 1], e = corner[c + 2];
    if (!weight[a] && !weight[b] && !weight[e]) continue;
    neighbours[a].push(b, e); neighbours[b].push(a, e); neighbours[e].push(a, b);
  }
  for (let pass = 0; pass < 2; pass += 1) {
    const next = Float64Array.from(out);
    for (let v = 0; v < count; v += 1) {
      const w = weight[v];
      if (w <= 0 || w >= 0.999 || !neighbours[v].length) continue;
      const k = 0.5 * 4 * w * (1 - w);
      let sx = 0, sy = 0, sz = 0;
      for (const u of neighbours[v]) { sx += out[u * 3]; sy += out[u * 3 + 1]; sz += out[u * 3 + 2]; }
      const m = neighbours[v].length;
      next[v * 3] += k * (sx / m - out[v * 3]); next[v * 3 + 1] += k * (sy / m - out[v * 3 + 1]); next[v * 3 + 2] += k * (sz / m - out[v * 3 + 2]);
    }
    out.set(next);
  }
  const result = new Float32Array(soup.length);
  for (let c = 0; c < corner.length; c += 1) { const v = corner[c]; result[c * 3] = out[v * 3]; result[c * 3 + 1] = out[v * 3 + 1]; result[c * 3 + 2] = out[v * 3 + 2]; }
  return result;
}

/** A line's points rounded, for keys (0.01 mm). */
export const stopKey = (points: Vec3[]) => points.map((p) => p.map((v) => Math.round(v * 100)).join(",")).join(";");
