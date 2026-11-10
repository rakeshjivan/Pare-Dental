import { describe, expect, it } from "vitest";
import { alongAxis, directZone } from "@/components/workplane/WaxToothDirect";

/** Build 284: a tooth taken hold of directly - which part was taken, and how far a drag goes along the tooth's axis. */
const tooth = { frame: { origin: [0, 0, 0] as [number, number, number], mesial: [1, 0, 0] as [number, number, number], out: [0, 1, 0] as [number, number, number], up: [0, 0, 1] as [number, number, number] }, width: 8, length: 10 };

describe("directZone", () => {
  it("reads the incisal fifth as length, the outer quarters as the contacts, the rest as the tooth", () => {
    expect(directZone(tooth, [0, 0, -1])).toBe("length");
    expect(directZone(tooth, [3.5, 0, -1])).toBe("length");
    expect(directZone(tooth, [3, 0, -5])).toBe("mesial");
    expect(directZone(tooth, [-3, 0, -5])).toBe("distal");
    expect(directZone(tooth, [0.5, 0, -5])).toBe("move");
  });
});

describe("alongAxis", () => {
  it("keeps the surface under the pointer: full distance for an axis in the screen, more for one leaning away", () => {
    expect(alongAxis([0, 0, 2], [0, 0, 1], [0, 1, 0])).toBeCloseTo(2);
    // The axis leans 60 degrees out of the screen: a 1 mm drag on the screen is 2 mm along it.
    const lean = [0, Math.sin(Math.PI / 3), Math.cos(Math.PI / 3)];
    expect(alongAxis([0, 0, 1], lean, [0, 1, 0])).toBeCloseTo(2);
  });
  it("reads nothing along an axis pointing at the viewer", () => {
    expect(alongAxis([1, 0, 0], [0, 1, 0], [0, 1, 0])).toBeNull();
  });
});
