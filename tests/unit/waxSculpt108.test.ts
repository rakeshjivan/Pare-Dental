import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { rayMeetsSoup, soupBoxOf, soupWithin } from "@/lib/nearestSurface";
import { openedLowerPose } from "@/lib/waxOcclusion";
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


describe("Wax-up Open the bite (build 108)", () => {
  // Pair frame = the scene's; the lower's incisal point 25 mm in front of the middle, at the occlusal plane.
  const hinge = { frame: new THREE.Matrix4().toArray(), incisal: [0, -25, 0] as [number, number, number] };
  const at = (raise: number, p: [number, number, number]) => new THREE.Vector3(...p).applyMatrix4(openedLowerPose(hinge, raise));
  it("leaves the bite as scanned at 0", () => {
    expect(openedLowerPose(hinge, 0).equals(new THREE.Matrix4())).toBe(true);
  });
  it("opens the incisal point by the raise, measured vertically", () => {
    for (const raise of [1, 3, 6]) expect(at(raise, hinge.incisal).z).toBeCloseTo(-raise, 1);
  });
  it("turns about the condyles: the back teeth part less than the front", () => {
    const front = -at(4, [0, -25, 0]).z, molar = -at(4, [20, 10, 0]).z;
    expect(molar).toBeGreaterThan(0);
    expect(molar).toBeLessThan(front);
  });
  it("is one turn: opening 2 then 3 more is opening 5", () => {
    const two = openedLowerPose(hinge, 2), five = openedLowerPose(hinge, 5);
    const step = five.clone().multiply(two.clone().invert());
    const p = new THREE.Vector3(3, -20, -2);
    expect(p.clone().applyMatrix4(two).applyMatrix4(step).distanceTo(p.clone().applyMatrix4(five))).toBeLessThan(1e-9);
  });
});

import { biteOpenings } from "@/lib/waxOcclusion";
describe("Open bite readout (build 108)", () => {
  const hinge = { frame: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], incisal: [0, -25, 0] as [number, number, number], molar: [0, 10, 0] as [number, number, number] };
  it("reads the opening at the incisors and less at the molars", () => {
    const { front, back } = biteOpenings(hinge, 3);
    expect(front).toBeCloseTo(3, 1);
    expect(back).toBeGreaterThan(0);
    expect(back).toBeLessThan(front);
    expect(biteOpenings(hinge, 0)).toEqual({ front: 0, back: 0 });
  });
});
