import { describe, expect, it } from "vitest";
import { rayMeetsSoup, soupBoxOf, soupWithin } from "@/lib/nearestSurface";
import { WAX_SCULPT_TOOLS } from "@/components/workplane/MeshSculptPanel";

// Two unit squares (two triangles each) facing +z: one at z = 0 around the origin, one at z = 5 far off in x.
const square = (cx: number, z: number) => [
  cx - 0.5, -0.5, z, cx + 0.5, -0.5, z, cx + 0.5, 0.5, z,
  cx - 0.5, -0.5, z, cx + 0.5, 0.5, z, cx - 0.5, 0.5, z,
];
const soup = [...square(0, 0), ...square(40, 5)];

describe("Wax-up Sculpt (build 108)", () => {
  it("keeps eight dental brushes, no selection or freeze tools", () => {
    expect(WAX_SCULPT_TOOLS).toEqual(["draw", "inflate", "deflate", "flatten", "smooth", "move", "pinch", "attract"]);
  });
  it("boxes a soup and grows the box", () => {
    expect(soupBoxOf(square(0, 0), 2)).toEqual([-2.5, -2.5, -2, 2.5, 2.5, 2]);
  });
  it("keeps only the triangles near the box", () => {
    const near = soupWithin(soup, soupBoxOf(square(0, 0), 6));
    expect(near.length).toBe(18);
    expect(Array.from(near)).toEqual(square(0, 0));
    expect(soupWithin(soup, soupBoxOf(soup, 0)).length).toBe(36);
  });
  it("finds how far a ray first meets the soup, or Infinity", () => {
    expect(rayMeetsSoup([0, 0, 10], [0, 0, -1], soup)).toBeCloseTo(10);
    expect(rayMeetsSoup([40, 0, 10], [0, 0, -1], soup)).toBeCloseTo(5);
    expect(rayMeetsSoup([20, 0, 10], [0, 0, -1], soup)).toBe(Infinity);
    // Only nearer than `before` counts.
    expect(rayMeetsSoup([0, 0, 10], [0, 0, -1], soup, 3)).toBe(3);
  });
});
