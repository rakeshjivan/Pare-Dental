/**
 * Build 110: Wax-up Studio's Keep & erase - the dentist paints the wax to keep on each tooth (labial face,
 * incisal edge, whatever palatal they want built up), and the rest is erased: pushed just under the patient's
 * own surface (tooth or gum), so the made model shows the patient's surface there. At the edge of the kept
 * wax it eases down over a short band, so there is no ledge. An Erase brush does the same where it is brushed,
 * never over kept wax.
 *
 * Nothing is cut away - only vertices are moved - so the tooth stays a closed shell, and the tooth itself is
 * never changed: the erase is worked out again wherever the tooth stands (moved, turned, resized). The paint
 * is kept in the tooth's own frame, so it goes with the tooth.
 */
import type { NearestSurface } from "@/lib/nearestSurface";
import { closedMarginAt, gumLinePoint, pastMargin, softCap, taperLimit, type ClosedMargin, type MarginLine } from "@/lib/waxMargin";

export type Vec3 = [number, number, number];
/** A brush dab in a tooth's frame: along mesial, towards the incisal edge, labial (mm), and its radius (mm). */
export type Dab = [number, number, number, number];
/** One tooth's paint: dabs kept, dabs erased by brush, and whether the rest (everything not kept) is erased. */
export type ToothErase = { keep: Dab[]; erase: Dab[]; rest: boolean };
/** A tooth's frame in the scene: its incisal point on the labial face, and unit directions mesial, incisal, labial. */
export type ToothAxes = { origin: Vec3; mesial: Vec3; up: Vec3; out: Vec3 };

/** The band over which erased wax eases down to the patient's surface from kept wax, mm. */
export const ERASE_BAND = 0.8;
/** How far under the patient's surface erased wax is tucked, mm. */
export const ERASE_TUCK = 0.15;
/** Build 116: how much deeper the wax goes right at a closed margin, mm, and over what distance from it that eases off. */
export const MARGIN_SINK = 0.25;
export const MARGIN_SINK_REACH = 0.5;
const smoothstep01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** The brush's radius by default, mm. */
export const ERASE_BRUSH = 1.5;

const smooth01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** A scene point in a tooth's frame. */
export function toFrame(a: ToothAxes, p: ArrayLike<number>): Vec3 {
  const d = [p[0] - a.origin[0], p[1] - a.origin[1], p[2] - a.origin[2]];
  return [d[0] * a.mesial[0] + d[1] * a.mesial[1] + d[2] * a.mesial[2], d[0] * a.up[0] + d[1] * a.up[1] + d[2] * a.up[2], d[0] * a.out[0] + d[1] * a.out[1] + d[2] * a.out[2]];
}
/** A point in a tooth's frame back in the scene. */
export function fromFrame(a: ToothAxes, f: ArrayLike<number>): Vec3 {
  return [0, 1, 2].map((k) => a.origin[k] + a.mesial[k] * f[0] + a.up[k] * f[1] + a.out[k] * f[2]) as Vec3;
}

/** How far a frame point lies outside the dabs (negative: inside one), mm; Infinity with no dabs. */
function outside(dabs: Dab[], m: number, u: number, o: number) {
  let best = Infinity;
  for (const d of dabs) {
    const s = Math.hypot(m - d[0], u - d[1], o - d[2]) - d[3];
    if (s < best) best = s;
  }
  return best;
}

/** Whether the scan's triangles face outwards near the tooth (+1) or are wound the other way (-1). */
export function surfaceSign(a: ToothAxes, surface: NearestSurface): 1 | -1 {
  const q = [0, 0, 0], n = [0, 0, 0];
  let vote = 0;
  for (const back of [0, 1, 2, 3]) {
    const p = [0, 1, 2].map((k) => a.origin[k] + a.out[k] * 3 - a.up[k] * back * 1.5);
    if (surface.nearest(p[0], p[1], p[2], q) === Infinity || surface.lastTriangle < 0) continue;
    surface.triangleNormal(surface.lastTriangle, n);
    vote += Math.sign((p[0] - q[0]) * n[0] + (p[1] - q[1]) * n[1] + (p[2] - q[2]) * n[2]);
  }
  return vote < 0 ? -1 : 1;
}

/**
 * The wax tooth (a scene soup, 9 numbers a triangle) with its paint applied: the wax not kept, where erased,
 * pushed under the patient's surface. A new soup, or null when nothing of it moved.
 */
export function eraseTooth(soup: ArrayLike<number>, axes: ToothAxes, paint: ToothErase, surface: NearestSurface, sign: 1 | -1, margin: MarginLine | ClosedMargin | null = null): Float32Array | null {
  if (!paint.rest && !paint.erase.length && !margin) return null;
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
  /** Build 116: vertices meant to be hidden under the patient's surface (erased, or tapered under it at the margin). */
  const sunk = new Uint8Array(count);
  const out = Float64Array.from(xyz);
  const q = [0, 0, 0], nt = [0, 0, 0];
  let moved = 0;
  for (let v = 0; v < count; v += 1) {
    const p = [xyz[v * 3], xyz[v * 3 + 1], xyz[v * 3 + 2]];
    const [m, u, o] = toFrame(axes, p);
    const kept = smooth01(outside(paint.keep, m, u, o) / ERASE_BAND);
    if (kept <= 1e-3) continue;
    const brushed = paint.rest ? 1 : paint.erase.length ? 1 - smooth01(outside(paint.erase, m, u, o) / ERASE_BAND) : 0;
    if (brushed * kept <= 1e-3 && !margin) continue;
    if (surface.nearest(p[0], p[1], p[2], q) === Infinity || surface.lastTriangle < 0) continue;
    surface.triangleNormal(surface.lastTriangle, nt);
    const nx = nt[0] * sign, ny = nt[1] * sign, nz = nt[2] * sign;
    const above = (p[0] - q[0]) * nx + (p[1] - q[1]) * ny + (p[2] - q[2]) * nz;
    // Build 111: and past the palatal (lingual) margin line, judged where the vertex meets the patient's surface.
    // Build 116: with a closed margin, wax over the gum (outside it) is erased; on the tooth (inside it) the wax is
    // kept but tapered - no thicker than taperLimit at its distance from the gum margin, so it ends as a feather edge.
    let erased = brushed, capped = 0, tuck = ERASE_TUCK;
    if (margin && "inside" in margin) {
      const found = closedMarginAt(margin, q);
      // Build 116: how far above the gum margin the wax is, measured from the wax point itself along the tooth's
      // long axis - not from its nearest scan point, which on the convex neck lies further up the crown and let wax
      // stand 0.3-0.4 mm proud right at the gum line (a ledge, seen as a collar of facets round the neck).
      const g = found?.inside ? gumLinePoint(margin, p) : null;
      const height = g ? (p[0] - g[0]) * axes.up[0] + (p[1] - g[1]) * axes.up[1] + (p[2] - g[2]) * axes.up[2] : Infinity;
      const at = found ? { inside: found.inside, gum: Math.min(found.gum, Math.max(0, height)) } : null;
      // Build 116: right at the margin the gum meets the tooth in a hollow corner; a wax triangle spanning it from
      // the tooth to under the gum would cross it in the air (a fringe round the neck), so near the margin the wax
      // goes deeper - under the gum outside it and under the tooth inside it.
      const deep = at ? MARGIN_SINK * (1 - smoothstep01(at.gum / MARGIN_SINK_REACH)) : 0;
      if (at && !at.inside) { erased = 1; tuck = ERASE_TUCK + deep; }
      else if (at) {
        const target = (above > 0 ? softCap(above, taperLimit(at.gum)) : above) - deep;
        if (target < above) capped = (target - above) * kept;
      }
    } else if (margin) erased = Math.max(brushed, pastMargin(margin, q, [nx, ny, nz]));
    const w = kept * erased;
    if (w <= 1e-3 && capped > -1e-4) continue;
    const px = p[0] + nx * capped, py = p[1] + ny * capped, pz = p[2] + nz * capped;
    out[v * 3] = px; out[v * 3 + 1] = py; out[v * 3 + 2] = pz;
    moved += 1;
    if (above + capped < -1e-3) sunk[v] = 1;
    if (w <= 1e-3 || above + capped < -tuck) continue; // already under the patient's surface
    // Build 116: pushed along the surface's normal, not onto its nearest point - near a corner of the scan many
    // vertices share one nearest point, and landing on it together folded the tooth so Make could not join it.
    const sink = above + capped + tuck;
    const tx = px - nx * sink, ty = py - ny * sink, tz = pz - nz * sink;
    out[v * 3] = px + w * (tx - px); out[v * 3 + 1] = py + w * (ty - py); out[v * 3 + 2] = pz + w * (tz - pz);
    weight[v] = w;
    if (w > 0.999) sunk[v] = 1;
  }
  // Build 116: near a closed margin the wax is moved by different amounts vertex to vertex (tapered, sunk under the
  // tooth, sunk under the gum), which left steps; how far each vertex moved is smoothed over its neighbours there, so
  // the wax fades onto the tooth. Never towards the outside: a vertex is not left standing further out than it was moved to.
  if (moved && margin && "inside" in margin) {
    const band = new Uint8Array(count);
    for (let v = 0; v < count; v += 1) {
      const g = gumLinePoint(margin, [out[v * 3], out[v * 3 + 1], out[v * 3 + 2]]);
      if (g && Math.hypot(out[v * 3] - g[0], out[v * 3 + 1] - g[1], out[v * 3 + 2] - g[2]) < 2.2) band[v] = 1;
    }
    const ring: number[][] = Array.from({ length: count }, () => []);
    for (let c = 0; c + 2 < corner.length; c += 3) {
      const a = corner[c], b = corner[c + 1], e = corner[c + 2];
      if (!band[a] && !band[b] && !band[e]) continue;
      ring[a].push(b, e); ring[b].push(a, e); ring[e].push(a, b);
    }
    const shift = new Float64Array(count * 3);
    for (let i = 0; i < shift.length; i += 1) shift[i] = out[i] - xyz[i];
    for (let pass = 0; pass < 8; pass += 1) {
      const next = Float64Array.from(shift);
      for (let v = 0; v < count; v += 1) {
        if (!band[v] || !ring[v].length) continue;
        let sx = 0, sy = 0, sz = 0;
        for (const u of ring[v]) { sx += shift[u * 3]; sy += shift[u * 3 + 1]; sz += shift[u * 3 + 2]; }
        const k = ring[v].length;
        next[v * 3] = 0.5 * shift[v * 3] + 0.5 * sx / k; next[v * 3 + 1] = 0.5 * shift[v * 3 + 1] + 0.5 * sy / k; next[v * 3 + 2] = 0.5 * shift[v * 3 + 2] + 0.5 * sz / k;
      }
      shift.set(next);
    }
    for (let v = 0; v < count; v += 1) {
      if (!band[v]) continue;
      const nx = xyz[v * 3] + shift[v * 3], ny = xyz[v * 3 + 1] + shift[v * 3 + 1], nz = xyz[v * 3 + 2] + shift[v * 3 + 2];
      // Kept only where it does not stand further out from the patient's surface than the vertex was moved to.
      if (surface.nearest(nx, ny, nz, q) === Infinity || surface.lastTriangle < 0) continue;
      surface.triangleNormal(surface.lastTriangle, nt);
      const hNew = ((nx - q[0]) * nt[0] + (ny - q[1]) * nt[1] + (nz - q[2]) * nt[2]) * sign;
      const ox = out[v * 3], oy = out[v * 3 + 1], oz = out[v * 3 + 2];
      if (surface.nearest(ox, oy, oz, q) === Infinity || surface.lastTriangle < 0) continue;
      surface.triangleNormal(surface.lastTriangle, nt);
      const hOld = ((ox - q[0]) * nt[0] + (oy - q[1]) * nt[1] + (oz - q[2]) * nt[2]) * sign;
      if (hNew <= Math.max(hOld, 0) + 0.02) { out[v * 3] = nx; out[v * 3 + 1] = ny; out[v * 3 + 2] = nz; if (hNew < -1e-3) sunk[v] = 1; else sunk[v] = 0; }
    }
  }
  // Build 116: a triangle whose corners are all under the patient's surface can still cross the gum-tooth groove in
  // the air between them (a fringe round the neck). Each such triangle that breaks the surface is pushed in until its
  // middle is under it too - a few times over, as pushing one moves its neighbours'.
  if (moved) for (let pass = 0; pass < 4; pass += 1) {
    const push = new Float64Array(count * 3), pushes = new Uint16Array(count);
    let poked = 0;
    for (let c = 0; c + 2 < corner.length; c += 3) {
      const a = corner[c], b = corner[c + 1], e = corner[c + 2];
      if (!sunk[a] || !sunk[b] || !sunk[e]) continue;
      for (const [wa, wb, we] of [[1 / 3, 1 / 3, 1 / 3], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5]]) {
        const mx = out[a * 3] * wa + out[b * 3] * wb + out[e * 3] * we, my = out[a * 3 + 1] * wa + out[b * 3 + 1] * wb + out[e * 3 + 1] * we, mz = out[a * 3 + 2] * wa + out[b * 3 + 2] * wb + out[e * 3 + 2] * we;
        if (surface.nearest(mx, my, mz, q) === Infinity || surface.lastTriangle < 0) continue;
        surface.triangleNormal(surface.lastTriangle, nt);
        const nx = nt[0] * sign, ny = nt[1] * sign, nz = nt[2] * sign;
        const above = (mx - q[0]) * nx + (my - q[1]) * ny + (mz - q[2]) * nz;
        if (above <= -0.05) continue;
        const depth = above + ERASE_TUCK;
        for (const v of [a, b, e]) { push[v * 3] -= nx * depth; push[v * 3 + 1] -= ny * depth; push[v * 3 + 2] -= nz * depth; pushes[v] += 1; }
        poked += 1;
        break;
      }
    }
    if (!poked) break;
    for (let v = 0; v < count; v += 1) if (pushes[v]) { out[v * 3] += push[v * 3] / pushes[v]; out[v * 3 + 1] += push[v * 3 + 1] / pushes[v]; out[v * 3 + 2] += push[v * 3 + 2] / pushes[v]; }
  }
  if (!moved) return null;
  // The band eased once more (a light smoothing of what moved part way), so the wax meets the surface without a crease.
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
      const k = 2 * w * (1 - w);
      let sx = 0, sy = 0, sz = 0;
      for (const u of neighbours[v]) { sx += out[u * 3]; sy += out[u * 3 + 1]; sz += out[u * 3 + 2]; }
      const n = neighbours[v].length;
      next[v * 3] += k * (sx / n - out[v * 3]); next[v * 3 + 1] += k * (sy / n - out[v * 3 + 1]); next[v * 3 + 2] += k * (sz / n - out[v * 3 + 2]);
    }
    out.set(next);
  }
  const result = new Float32Array(soup.length);
  for (let c = 0; c < corner.length; c += 1) { const v = corner[c]; result[c * 3] = out[v * 3]; result[c * 3 + 1] = out[v * 3 + 1]; result[c * 3 + 2] = out[v * 3 + 2]; }
  return result;
}

/** Each corner of a soup: 1 inside the kept paint, else 0 (for colouring what is kept). */
export function keptCorners(soup: ArrayLike<number>, axes: ToothAxes, keep: Dab[]): Uint8Array {
  const out = new Uint8Array(soup.length / 3);
  if (!keep.length) return out;
  for (let c = 0; c < out.length; c += 1) {
    const [m, u, o] = toFrame(axes, [soup[c * 3], soup[c * 3 + 1], soup[c * 3 + 2]]);
    if (outside(keep, m, u, o) <= 0) out[c] = 1;
  }
  return out;
}

/** The paint as a short key (0.01 mm). */
export const eraseKey = (p: ToothErase | undefined) => (p ? `${p.rest ? 1 : 0}|${p.keep.map((d) => d.map((v) => Math.round(v * 100)).join(",")).join(";")}|${p.erase.map((d) => d.map((v) => Math.round(v * 100)).join(",")).join(";")}` : "");
