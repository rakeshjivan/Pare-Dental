import { describe, expect, it } from "vitest";
import { cutterBox, proudOfWax } from "@/lib/waxReduce";
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
