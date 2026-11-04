import { describe, expect, it } from "vitest";
import { PALATAL_SINK, pressPalatal } from "@/lib/waxPalatal";

/* Build 118: the library tooth's palatal form - the patient's surface palatal of a wax tooth pressed onto it. */
// A closed box tooth: mesial x in [-3, 3], up y in [-8, 0] (edge at 0), out z in [-6, 0] (labial face at 0), wound outward.
const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
  const v = (i: number) => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];
  const quads = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
  const out: number[] = [];
  for (const [a, b, c, d] of quads) out.push(...v(a), ...v(b), ...v(c), ...v(a), ...v(c), ...v(d));
  return Float32Array.from(out);
};
// The patient's surface: a sheet at z (a grid of triangles).
const sheet = (z: number) => {
  const out: number[] = [];
  for (let x = -6; x < 6; x += 0.5) for (let y = -10; y < 2; y += 0.5) out.push(x, y, z, x + 0.5, y, z, x + 0.5, y + 0.5, z, x, y, z, x + 0.5, y + 0.5, z, x, y + 0.5, z);
  return Float32Array.from(out);
};
const tooth = { soup: box(-3, 3, -8, 0, -6, 0), origin: [0, 0, 0], up: [0, 1, 0], out: [0, 0, 1], mesial: [1, 0, 0] };
const at = (soup: Float32Array, x: number, y: number) => {
  for (let i = 0; i + 2 < soup.length; i += 3) if (Math.abs(soup[i] - x) < 1e-6 && Math.abs(soup[i + 1] - y) < 1e-6) return soup[i + 2];
  return NaN;
};

describe("pressPalatal", () => {
  it("presses the patient's palatal standing beyond the tooth onto it, just inside", () => {
    const scan = sheet(-6.4);
    const { positions, moved } = pressPalatal(scan, [tooth]);
    expect(moved).toBeGreaterThan(0);
    // Just behind the middle of the palatal face (0.4 mm out): on the tooth, PALATAL_SINK inside it.
    expect(at(positions, 0, -4)).toBeCloseTo(-6 + PALATAL_SINK, 1);
    // Below the tooth's cervical end and beyond its mesial edge: as scanned.
    expect(at(positions, 0, -9.5)).toBeCloseTo(-6.4, 5);
    expect(at(positions, 5.5, -4)).toBeCloseTo(-6.4, 5);
  });
  it("never moves the labial side, or a palatal surface out of reach", () => {
    expect(pressPalatal(sheet(1), [tooth]).moved).toBe(0);
    expect(pressPalatal(sheet(-11), [tooth]).moved).toBe(0);
  });
  it("eases the press out palatal of the tooth - a ramp down to it, never a trench", () => {
    const near = at(pressPalatal(sheet(-6.4), [tooth]).positions, 0, -4);
    const far = at(pressPalatal(sheet(-7.5), [tooth]).positions, 0, -4);
    // 1.5 mm palatal of the tooth's most palatal point, half way up the ramp: moved part way only.
    expect(far).toBeLessThan(-6 + PALATAL_SINK - 0.3);
    expect(far).toBeGreaterThan(-7.5 + 0.3);
    expect(near).toBeGreaterThan(far);
    // Beyond the ramp: as scanned.
    expect(pressPalatal(sheet(-9.2), [tooth]).moved).toBe(0);
  });
});
