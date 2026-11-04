import { describe, expect, it } from "vitest";
import { NearestSurface } from "@/lib/nearestSurface";
import { eraseTooth, surfaceSign, type ToothAxes } from "@/lib/waxErase";
import { prepareMargin, type MarginLine } from "@/lib/waxMargin";

/* Build 117: a boundary line drawn on the patient's tooth - wax on its incisal side kept, wax past it taken under the surface. */
const grid = (z: number, x0: number, x1: number, y0: number, y1: number, step: number) => {
  const out: number[] = [];
  for (let x = x0; x < x1 - 1e-9; x += step) for (let y = y0; y < y1 - 1e-9; y += step) {
    const a = [x, y, z], b = [x + step, y, z], c = [x + step, y + step, z], d = [x, y + step, z];
    out.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  return Float32Array.from(out);
};
describe("boundary lines", () => {
  const patient = new NearestSurface(grid(0, -8, 8, -8, 8, 1), 6);
  const axes: ToothAxes = { origin: [0, 0, 0], mesial: [1, 0, 0], up: [0, 1, 0], out: [0, 0, 1] };
  const sign = surfaceSign(axes, patient);
  const wax = grid(0.5, -3, 3, -5, 5, 0.25);
  const none = { keep: [], erase: [], rest: false };
  const line = prepareMargin(Array.from({ length: 33 }, (_, i) => [-4 + i * 0.25, 0, 0] as [number, number, number]), patient, sign, axes.up) as MarginLine;
  const at = (soup: Float32Array, y: number) => { const z: number[] = []; for (let i = 0; i < soup.length; i += 3) if (Math.abs(soup[i + 1] - y) < 1e-3 && Math.abs(soup[i]) < 2) z.push(soup[i + 2]); return z; };
  it("does nothing with no line", () => {
    expect(eraseTooth(wax, axes, none, patient, sign, null, [])).toBeNull();
  });
  it("keeps the wax on the incisal side and takes it under the surface past the line", () => {
    expect(line).not.toBeNull();
    const out = eraseTooth(wax, axes, none, patient, sign, null, [line])!;
    expect(out).not.toBeNull();
    for (const z of at(out, 3)) expect(z).toBeCloseTo(0.5, 4);
    for (const z of at(out, 1.5)) expect(z).toBeCloseTo(0.5, 2);
    // Build 117: a feathered finish - part way down within the band before the line, not a step.
    for (const z of at(out, 0.5)) { expect(z).toBeLessThan(0.5); expect(z).toBeGreaterThan(-0.5); }
    for (const z of at(out, -2)) expect(z).toBeLessThan(0);
  });
});
