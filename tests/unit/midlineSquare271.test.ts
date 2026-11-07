import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { midlineSquare } from "@/lib/dentalModel";

/**
 * Build 271 (Rakesh): two points on the midline - between the centrals, and further back - square the arch: the line
 * between them runs straight front to back (+y) on x = 0, the front point where it was front to back.
 */
describe("midlineSquare", () => {
  const front = { x: 3, y: -30 }, back = { x: -4, y: 2 };
  it("lays the line along y on x = 0 (the lower's frame, the pair's own)", () => {
    const m = midlineSquare(front, back, "lower");
    const f = new THREE.Vector3(front.x, front.y, 5).applyMatrix4(m), b = new THREE.Vector3(back.x, back.y, 5).applyMatrix4(m);
    expect(f.x).toBeCloseTo(0, 9);
    expect(b.x).toBeCloseTo(0, 9);
    expect(b.y).toBeGreaterThan(f.y);
    expect(f.y).toBeCloseTo(front.y, 9);
    expect(b.distanceTo(f)).toBeCloseTo(Math.hypot(back.x - front.x, back.y - front.y), 9);
    expect(f.z).toBeCloseTo(5, 9);
  });
  it("turns the upper's frame (the pair's seen turned over) the same way in the pair", () => {
    const flip = new THREE.Matrix4().makeRotationY(Math.PI);
    // A point of the pair at (x, y, z) is at flip(x, y, z) in the upper's frame.
    const inUpper = (p: { x: number; y: number }) => new THREE.Vector3(p.x, p.y, -2).applyMatrix4(flip);
    const m = midlineSquare(front, back, "upper");
    const f = inUpper(front).applyMatrix4(m).applyMatrix4(flip), b = inUpper(back).applyMatrix4(m).applyMatrix4(flip);
    expect(f.x).toBeCloseTo(0, 9);
    expect(b.x).toBeCloseTo(0, 9);
    expect(b.y).toBeGreaterThan(f.y);
  });
});
