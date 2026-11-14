import { describe, expect, it } from "vitest";
import { NearestSurface } from "@/lib/nearestSurface";
import { eraseTooth, type ToothAxes } from "@/lib/waxErase";
import type { ClosedMargin } from "@/lib/waxMargin";

/*
 * Pare Dental: a margin drawn by hand round a tooth - the wax stops at it all the way round. Over the gum outside it the
 * wax goes under the gum on the palatal side as well as the labial (Build 117 kept it palatally, over the gum).
 */
const grid = (z: number, x0: number, x1: number, y0: number, y1: number, step: number) => {
  const out: number[] = [];
  for (let x = x0; x < x1 - 1e-9; x += step) for (let y = y0; y < y1 - 1e-9; y += step) {
    const a = [x, y, z], b = [x + step, y, z], c = [x + step, y + step, z], d = [x, y + step, z];
    out.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  return Float32Array.from(out);
};
describe("closed margin, palatal side", () => {
  // The patient's surface: a plane facing +z; inside the margin (the tooth) is the square |x|, |y| < 2.
  const soup = grid(0, -8, 8, -8, 8, 0.5);
  const surface = new NearestSurface(soup, 6);
  const inside = new Uint8Array(soup.length / 9);
  for (let t = 0; t < inside.length; t += 1) {
    const cx = (soup[t * 9] + soup[t * 9 + 3] + soup[t * 9 + 6]) / 3, cy = (soup[t * 9 + 1] + soup[t * 9 + 4] + soup[t * 9 + 7]) / 3;
    inside[t] = Math.abs(cx) < 2 && Math.abs(cy) < 2 ? 1 : 0;
  }
  const line: Array<[number, number, number]> = [];
  for (let i = 0; i < 16; i += 1) line.push([-2 + i * 0.25, -2, 0]);
  for (let i = 0; i < 16; i += 1) line.push([2, -2 + i * 0.25, 0]);
  for (let i = 0; i < 16; i += 1) line.push([2 - i * 0.25, 2, 0]);
  for (let i = 0; i < 16; i += 1) line.push([-2, 2 - i * 0.25, 0]);
  const margin: ClosedMargin = { surface, inside, line };
  // The wax tooth: 0.5 mm over the patient's surface, reaching 1.5 mm past the margin on every side.
  const wax = grid(0.5, -3.5, 3.5, -3.5, 3.5, 0.25);
  const none = { keep: [], erase: [], rest: false };
  const heights = (out: Float32Array, pick: (x: number, y: number) => boolean) => {
    const z: number[] = [];
    for (let i = 0; i < out.length; i += 3) if (pick(out[i], out[i + 1])) z.push(out[i + 2]);
    return z;
  };
  for (const [side, out] of [["labial", [0, 0, 1]], ["palatal", [0, 0, -1]]] as const) {
    it(`takes the wax over the gum under it, and keeps it on the tooth (surface facing ${side})`, () => {
      // "out" along the surface's normal: the surface faces the lip; against it: the surface faces the palate.
      const axes: ToothAxes = { origin: [0, 0, 0], mesial: [1, 0, 0], up: [0, 1, 0], out: [...out] };
      const result = eraseTooth(wax, axes, none, surface, 1, margin, []);
      expect(result).not.toBeNull();
      const overGum = heights(result!, (x, y) => Math.max(Math.abs(x), Math.abs(y)) > 2.9);
      const onTooth = heights(result!, (x, y) => Math.max(Math.abs(x), Math.abs(y)) < 1);
      expect(overGum.length).toBeGreaterThan(20);
      for (const z of overGum) expect(z).toBeLessThan(0);
      for (const z of onTooth) expect(z).toBeGreaterThan(0.3);
    });
  }
});
