import { describe, expect, it } from "vitest";
import { VENEER_TUCK, veneerOf, type PatientSurface } from "@/lib/waxVeneer";

/*
 * Pare Dental: a wax tooth made as a veneer. A box tooth: mesial x in [-3, 3], up y in [-8, 0] (edge at 0), labial
 * face at z 0.1 and palatal face at z -6.5. The patient's tooth: labial surface z = 0, palatal surface z = -6.
 */
const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, step = 0.5) => {
  const out: number[] = [];
  const quad = (p: (u: number, v: number) => number[], nu: number, nv: number) => {
    for (let i = 0; i < nu; i += 1) for (let j = 0; j < nv; j += 1) {
      const a = p(i / nu, j / nv), b = p((i + 1) / nu, j / nv), c = p((i + 1) / nu, (j + 1) / nv), d = p(i / nu, (j + 1) / nv);
      out.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
  };
  const nx = Math.round((x1 - x0) / step), ny = Math.round((y1 - y0) / step), nz = Math.round((z1 - z0) / step);
  const L = (a: number, b: number, t: number) => a + (b - a) * t;
  quad((u, v) => [L(x0, x1, u), L(y0, y1, v), z1], nx, ny); // labial (+z)
  quad((u, v) => [L(x0, x1, v), L(y0, y1, u), z0], ny, nx); // palatal (-z)
  quad((u, v) => [L(x0, x1, v), y1, L(z0, z1, u)], nz, nx); // edge (+y)
  quad((u, v) => [L(x0, x1, u), y0, L(z0, z1, v)], nx, nz); // neck (-y)
  quad((u, v) => [x1, L(y0, y1, v), L(z0, z1, u)], nz, ny); // +x
  quad((u, v) => [x0, L(y0, y1, u), L(z0, z1, v)], ny, nz); // -x
  return Float32Array.from(out);
};
const wax = box(-3, 3, -8, 0, -6.5, 0.1);
const frame = { origin: [0, 0, 0], up: [0, 1, 0], out: [0, 0, 1] };
// The patient's tooth: the nearer of its labial (z 0, facing +z) and palatal (z -6, facing -z) surfaces.
const patient: PatientSurface = (_x, _y, z) => (Math.abs(z) < Math.abs(z + 6) ? { at: [_x, _y, 0], normal: [0, 0, 1] } : { at: [_x, _y, -6], normal: [0, 0, -1] });
const zAt = (soup: Float32Array, x: number, y: number, side: "labial" | "palatal") => {
  let best = side === "labial" ? -Infinity : Infinity;
  for (let i = 0; i < soup.length; i += 3) if (Math.abs(soup[i] - x) < 1e-6 && Math.abs(soup[i + 1] - y) < 1e-6) best = side === "labial" ? Math.max(best, soup[i + 2]) : Math.min(best, soup[i + 2]);
  return best;
};

describe("veneerOf", () => {
  const out = veneerOf(wax, frame, patient, { wrap: 2.5, min: 0.3 });
  it("keeps the wax palatally within the wrap, and takes it inside the patient's tooth below it", () => {
    expect(zAt(out, 0, -1, "palatal")).toBeCloseTo(-6.5, 5);
    expect(zAt(out, 0, -5, "palatal")).toBeCloseTo(-6 + VENEER_TUCK, 2);
  });
  it("brings a labial face thinner than the minimum out to it, and eases off at the neck", () => {
    expect(zAt(out, 0, -2, "labial")).toBeCloseTo(0.3, 2);
    expect(zAt(out, 0, -7.5, "labial")).toBeLessThan(0.15);
  });
  it("leaves the labial face alone where the veneer is already thicker", () => {
    const thick = box(-3, 3, -8, 0, -6.5, 0.8);
    expect(zAt(veneerOf(thick, frame, patient, { wrap: 2.5, min: 0.3 }), 0, -2, "labial")).toBeCloseTo(0.8, 5);
  });
});
