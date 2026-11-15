/**
 * Pare Dental: a wax tooth made as a veneer (Rakesh, 15 Nov). An additive veneer wax-up (Magne & Magne 2006; Gurel's
 * APT technique) keeps the patient's tooth inside it and adds wax labially and over the incisal edge only:
 * - below a palatal chamfer wrap (2-3 mm from the incisal edge, `wrap`), the wax tooth's palatal side goes just inside
 *   the patient's tooth, so the patient's own palatal surface shows there;
 * - on the labial face the wax stands at least `min` mm off the patient's tooth (the veneer's minimum thickness), the
 *   amount easing off towards the cervical third, where a veneer thins to its margin;
 * - nothing else changes: where the wax stands further out it stays as designed, and at the gum the labial gum hides
 *   the neck as before (no palatal neck is drawn out for a veneer tooth).
 */

type Vec3 = [number, number, number];

/** How far inside the patient's tooth the palatal wax goes below the wrap, mm (so the join is clean). */
export const VENEER_TUCK = 0.15;
/** Over how much the wrap eases from wax to the patient's palatal, mm. */
export const VENEER_WRAP_EASE = 0.6;
/** The wrap's default and range (mm from the incisal edge, along the tooth). */
export const VENEER_WRAP = 2.5;
export const VENEER_WRAP_RANGE: [number, number] = [1, 4];
/** The minimum thickness' default and range, mm. */
export const VENEER_MIN = 0.3;
export const VENEER_MIN_RANGE: [number, number] = [0, 1.2];
/** The minimum thickness is kept in full to this share of the tooth's length from the edge, and gone at the next. */
export const VENEER_MIN_FULL = 0.6;
export const VENEER_MIN_GONE = 0.85;

export type VeneerSettings = { on: boolean; wrap: number; min: number };
export const VENEER_DEFAULT: VeneerSettings = { on: false, wrap: VENEER_WRAP, min: VENEER_MIN };

/** The patient's surface near a point: the nearest point on it and its outward normal (null where there is none near). */
export type PatientSurface = (x: number, y: number, z: number) => { at: Vec3; normal: Vec3 } | null;

const smooth01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/**
 * The wax tooth (`soup`, a triangle soup) made as a veneer over the patient's tooth. `frame`: the tooth's origin at its
 * incisal edge, `up` towards the edge, `out` labially.
 */
export function veneerOf(soup: ArrayLike<number>, frame: { origin: ArrayLike<number>; up: ArrayLike<number>; out: ArrayLike<number> }, patient: PatientSurface, settings: { wrap: number; min: number }): Float32Array {
  const norm = (v: ArrayLike<number>): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const up = norm(frame.up), out = norm(frame.out), o = frame.origin;
  const corners = Math.floor(soup.length / 3);
  // Corners at one point move together (welded at 0.1 micron), so the surface does not open.
  const ids = new Int32Array(corners);
  const seen = new Map<string, number>();
  let count = 0;
  for (let c = 0; c < corners; c += 1) {
    const key = `${Math.round(soup[c * 3] * 1e4)},${Math.round(soup[c * 3 + 1] * 1e4)},${Math.round(soup[c * 3 + 2] * 1e4)}`;
    let v = seen.get(key);
    if (v === undefined) { v = count; count += 1; seen.set(key, v); }
    ids[c] = v;
  }
  const pos = new Float64Array(count * 3), nrm = new Float64Array(count * 3);
  for (let c = 0; c < corners; c += 1) { const v = ids[c]; pos[v * 3] = soup[c * 3]; pos[v * 3 + 1] = soup[c * 3 + 1]; pos[v * 3 + 2] = soup[c * 3 + 2]; }
  for (let t = 0; t * 3 + 2 < corners; t += 1) {
    const a = t * 9, ux = soup[a + 3] - soup[a], uy = soup[a + 4] - soup[a + 1], uz = soup[a + 5] - soup[a + 2];
    const vx = soup[a + 6] - soup[a], vy = soup[a + 7] - soup[a + 1], vz = soup[a + 8] - soup[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (let k = 0; k < 3; k += 1) { const v = ids[t * 3 + k]; nrm[v * 3] += nx; nrm[v * 3 + 1] += ny; nrm[v * 3 + 2] += nz; }
  }
  let length = 0;
  for (let v = 0; v < count; v += 1) length = Math.max(length, -((pos[v * 3] - o[0]) * up[0] + (pos[v * 3 + 1] - o[1]) * up[1] + (pos[v * 3 + 2] - o[2]) * up[2]));
  if (length < 2) return Float32Array.from(soup);
  const moved = Float64Array.from(pos);
  for (let v = 0; v < count; v += 1) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const nl = Math.hypot(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]) || 1;
    const facing = (nrm[v * 3] * out[0] + nrm[v * 3 + 1] * out[1] + nrm[v * 3 + 2] * out[2]) / nl;
    const depth = -((x - o[0]) * up[0] + (y - o[1]) * up[1] + (z - o[2]) * up[2]);
    const palatal = smooth01((-facing - 0.1) / 0.3), labial = smooth01((facing - 0.1) / 0.3);
    if (palatal <= 0 && labial <= 0) continue;
    const near = patient(x, y, z);
    if (!near) continue;
    const [qx, qy, qz] = near.at, [mx, my, mz] = near.normal;
    const height = (x - qx) * mx + (y - qy) * my + (z - qz) * mz;
    // Below the wrap: the palatal wax just inside the patient's tooth.
    const below = smooth01((depth - settings.wrap) / VENEER_WRAP_EASE) * palatal;
    if (below > 0 && height > -VENEER_TUCK) {
      const by = (height + VENEER_TUCK) * below;
      moved[v * 3] = x - mx * by; moved[v * 3 + 1] = y - my * by; moved[v * 3 + 2] = z - mz * by;
      continue;
    }
    // The labial face at least the minimum thickness off the patient's tooth (not where the patient's tooth stands out
    // through the wax - that is for Reduce - nor near the neck, where a veneer thins to its margin).
    const keep = 1 - smooth01((depth / length - VENEER_MIN_FULL) / (VENEER_MIN_GONE - VENEER_MIN_FULL));
    const short = settings.min - height;
    if (labial > 0 && keep > 0 && short > 0 && height > -0.05) {
      const by = short * labial * keep;
      moved[v * 3] = x + mx * by; moved[v * 3 + 1] = y + my * by; moved[v * 3 + 2] = z + mz * by;
    }
  }
  const result = new Float32Array(corners * 3);
  for (let c = 0; c < corners; c += 1) { const v = ids[c]; result[c * 3] = moved[v * 3]; result[c * 3 + 1] = moved[v * 3 + 1]; result[c * 3 + 2] = moved[v * 3 + 2]; }
  return result;
}
