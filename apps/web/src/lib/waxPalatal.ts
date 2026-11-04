/**
 * Build 118: Wax-up Studio's palatal form - the library tooth's or the patient's.
 *
 * Joined to the model, a wax tooth only adds (a union): wherever the patient's tooth stands out beyond the
 * library tooth, the patient's surface is what shows. On worn, long teeth the patient's palatal
 * stands proud of a Brenes central over almost its whole height, so the made model kept the patient's palatal
 * and showed the library tooth only labially and at the new edge.
 *
 * "library": before the wax is joined, the patient's surface standing palatal of a wax tooth (within
 * PALATAL_REACH of its palatal face) is pressed down onto it, just inside it, so the whole reference tooth
 * forms the palatal surface - as a technician reduces the palatal of a model to the set-up. The press fades out
 * over PALATAL_FADE towards the palatal gum and the palate, towards the tooth's cervical end and at its
 * mesial and distal edges, so the patient's surface runs on smoothly into the library tooth with no step.
 * Palatal of the tooth's cingulum the press eases out over PALATAL_RAMP, so where the cingulum lies under the palatal
 * gum the gum ramps down to it rather than being dug out behind it. The gum labially, below the tooth and between
 * the teeth beyond the fade is never moved.
 */
import { NearestSurface } from "@/lib/nearestSurface";

export type PalatalForm = "patient" | "library";

/** A wax tooth, in the scan's coordinates: its closed soup and frame (up towards the incisal edge, out labial). */
export type PalatalTooth = { soup: Float32Array; origin: ArrayLike<number>; up: ArrayLike<number>; out: ArrayLike<number>; mesial: ArrayLike<number> };

/** How far palatal of the library tooth's surface the patient's surface is pressed onto it, mm. */
export const PALATAL_REACH = 4;
/** Over how much (the last part of the reach, the cervical end, the mesial and distal edges) the press fades out, mm. */
export const PALATAL_FADE = 1.5;
/** How far inside the library tooth the pressed surface goes (so the join is clean), mm. */
export const PALATAL_SINK = 0.15;
/** A face counts as palatal when its normal points this far palatally (its share along -out). */
export const PALATAL_FACING = 0.1;
/** Palatal of the tooth's most palatal point (its cingulum), the gum and palate ease down to it over this - a ramp, never a trench, mm. */
export const PALATAL_RAMP = 3;

const smooth01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * The scan (a triangle soup) with its surface standing palatal of each wax tooth pressed onto that tooth.
 * Corners at one point move together, so the soup stays closed. Returns the soup unchanged when nothing moved.
 */
export function pressPalatal(scan: Float32Array, teeth: PalatalTooth[]): { positions: Float32Array; moved: number } {
  if (!teeth.length) return { positions: scan, moved: 0 };
  const out = Float32Array.from(scan);
  let moved = 0;
  const q = [0, 0, 0], n = [0, 0, 0];
  for (const tooth of teeth) {
    const o = tooth.origin;
    // The tooth's extent in its own frame.
    let m0 = Infinity, m1 = -Infinity, u0 = Infinity, u1 = -Infinity, b0 = Infinity;
    for (let i = 0; i + 2 < tooth.soup.length; i += 3) {
      const d = [tooth.soup[i] - o[0], tooth.soup[i + 1] - o[1], tooth.soup[i + 2] - o[2]];
      const m = dot(d, tooth.mesial), u = dot(d, tooth.up), b = dot(d, tooth.out);
      m0 = Math.min(m0, m); m1 = Math.max(m1, m); u0 = Math.min(u0, u); u1 = Math.max(u1, u); b0 = Math.min(b0, b);
    }
    if (!Number.isFinite(m0)) continue;
    const surface = new NearestSurface(tooth.soup, PALATAL_REACH + 0.5);
    const seen = new Map<string, [number, number, number] | null>();
    for (let c = 0; c + 2 < out.length; c += 3) {
      const x = out[c], y = out[c + 1], z = out[c + 2];
      const d = [x - o[0], y - o[1], z - o[2]];
      const m = dot(d, tooth.mesial), u = dot(d, tooth.up), b = dot(d, tooth.out);
      // Only beside the tooth's palatal half: within its width, from its cervical end to past its edge, and palatal of its labial face.
      if (m < m0 - 0.5 || m > m1 + 0.5 || u < u0 || u > u1 + 1 || b > 0.5 || b < b0 - PALATAL_REACH - 0.5) continue;
      const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
      let to = seen.get(key);
      if (to === undefined) {
        to = null;
        const dist = surface.nearest(x, y, z, q);
        if (dist !== Infinity && surface.lastTriangle >= 0) {
          surface.triangleNormal(surface.lastTriangle, n);
          const above = (x - q[0]) * n[0] + (y - q[1]) * n[1] + (z - q[2]) * n[2];
          const facing = -dot(n, tooth.out);
          // Outside the tooth, over a face turned palatally (not its cervical cap, which faces the root).
          if (above > 0 && facing > PALATAL_FACING && dot(n, tooth.up) > -0.6 && dist < PALATAL_REACH) {
            const fade = PALATAL_FADE;
            const w = (1 - smooth01((dist - (PALATAL_REACH - fade)) / fade))
              * smooth01((u - u0) / fade)
              * smooth01((m - (m0 - 0.5)) / fade) * smooth01((m1 + 0.5 - m) / fade)
              * smooth01((facing - PALATAL_FACING) / 0.2)
              * (b < b0 ? 1 - smooth01((b0 - b) / PALATAL_RAMP) : 1);
            if (w > 1e-3) {
              const tx = q[0] - n[0] * PALATAL_SINK, ty = q[1] - n[1] * PALATAL_SINK, tz = q[2] - n[2] * PALATAL_SINK;
              to = [x + w * (tx - x), y + w * (ty - y), z + w * (tz - z)];
            }
          }
        }
        seen.set(key, to);
      }
      if (!to) continue;
      out[c] = to[0]; out[c + 1] = to[1]; out[c + 2] = to[2];
      moved += 1;
    }
  }
  return moved ? { positions: out, moved } : { positions: scan, moved: 0 };
}
