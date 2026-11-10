import { describe, expect, it } from "vitest";
import { cutterBox, proudOfWax, sweptSurface } from "@/lib/waxReduce";
import type { ToothFrame } from "@/lib/dentalWaxup";

/** Build 279: where the patient's tooth stands proud of the wax tooth, and by how much. Synthetic shapes. */
const frame: ToothFrame = { origin: [0, 0, 0], mesial: [1, 0, 0], out: [0, 1, 0], up: [0, 0, 1] };
// A wax tooth's labial face at y = 0 and a palatal face at y = -6, x -4..4, z -10..0, as a cloud of corners.
const wax: number[] = [];
for (let x = -4; x <= 4; x += 0.5) for (let z = -10; z <= 0; z += 0.5) wax.push(x, 0, z, x, -6, z);
// The patient's labial surface at y = s, z -9..h.
const scan = (s: number, top = -1) => { const p: number[] = []; for (let x = -3.5; x <= 3.5; x += 0.5) for (let z = -9; z <= top; z += 0.5) p.push(x, s, z); return p; };

describe("proudOfWax", () => {
  it("finds nothing when the patient's tooth is behind the wax", () => {
    expect(proudOfWax(scan(-0.8), wax, frame, 8, 10).depth).toBe(0);
  });
  it("measures how far the patient's tooth stands labial of the wax", () => {
    const proud = proudOfWax(scan(0.7), wax, frame, 8, 10);
    expect(proud.depth).toBeCloseTo(0.7, 5);
    expect(proud.points.length).toBeGreaterThan(10);
  });
  it("measures how far it reaches beyond the wax's incisal edge", () => {
    expect(proudOfWax(scan(-1, 1.5), wax, frame, 8, 10).depth).toBeCloseTo(1.5, 5);
  });
});

describe("cutterBox", () => {
  it("is a closed box round the tooth, a margin past it", () => {
    const box = cutterBox(wax, 2);
    expect(box.length).toBe(12 * 9);
    let maxY = -Infinity; for (let i = 1; i < box.length; i += 3) maxY = Math.max(maxY, box[i]);
    expect(maxY).toBeCloseTo(2, 6);
  });
});

describe("sweptSurface (build 281: the flush cut follows the wax's own surface)", () => {
  // A closed box, x [-3, 3], y [-6, 0] (labial face at y 0), z [-8, 0], wound outward.
  const box = (() => {
    const v = (i: number) => [i & 1 ? 3 : -3, i & 2 ? 0 : -6, i & 4 ? 0 : -8];
    const quads = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
    const out: number[] = [];
    for (const [a, b, c, d] of quads) out.push(...v(a), ...v(b), ...v(c), ...v(a), ...v(c), ...v(d));
    return Float32Array.from(out);
  })();
  const volume = (s: Float32Array) => { let v = 0; for (let i = 0; i < s.length; i += 9) v += (s[i] * (s[i + 4] * s[i + 8] - s[i + 5] * s[i + 7]) - s[i + 1] * (s[i + 3] * s[i + 8] - s[i + 5] * s[i + 6]) + s[i + 2] * (s[i + 3] * s[i + 7] - s[i + 4] * s[i + 6])) / 6; return v; };
  it("is the labial face swept out: closed, wound outward, its volume the face times the depth, nothing beyond the outline", () => {
    const swept = sweptSurface(box, [0, 1, 0], 4)!;
    expect(swept).not.toBeNull();
    expect(volume(swept)).toBeCloseTo(6 * 8 * 4, 4);
    for (let i = 0; i < swept.length; i += 3) {
      expect(Math.abs(swept[i])).toBeLessThanOrEqual(3 + 1e-6);
      expect(swept[i + 1]).toBeGreaterThanOrEqual(-1e-6);
      expect(swept[i + 2]).toBeLessThanOrEqual(1e-6);
    }
    // Watertight: every edge used twice.
    const count = new Map<string, number>();
    const k = (i: number) => `${swept[i].toFixed(4)},${swept[i + 1].toFixed(4)},${swept[i + 2].toFixed(4)}`;
    for (let i = 0; i < swept.length; i += 9) for (let e = 0; e < 3; e += 1) { const a = k(i + e * 3), b = k(i + ((e + 1) % 3) * 3); const id = a < b ? a + b : b + a; count.set(id, (count.get(id) ?? 0) + 1); }
    for (const c of count.values()) expect(c).toBe(2);
  });
});
