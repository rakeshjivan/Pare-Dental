import manifoldModule, { type ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import { BLEND_REACH, waxBlend } from "@/lib/waxBlend";
import { solidPositions } from "@/lib/dentalMesh";

/** Build 306: wax run into the join of a wax tooth and the model - the crease filled, nothing else touched. */
let runtime: ManifoldToplevel;
beforeAll(async () => {
  runtime = await manifoldModule();
  runtime.setup();
}, 60000);

/** The gum: a slab whose top is z = 0. The tooth: an upright post 6 mm across standing 8 mm out of it (and 3 mm in it). */
const gum = () => runtime.Manifold.cube([30, 30, 6], true).translate([0, 0, -3]);
const post = () => runtime.Manifold.cylinder(11, 3, 3, 64).translate([0, 0, -3]);
/** Is the point inside the solid: rays up the z axis, crossings counted. */
function inside(solid: InstanceType<ManifoldToplevel["Manifold"]>, x: number, y: number, z: number): boolean {
  const p = solidPositions(solid);
  let n = 0;
  for (let t = 0; t + 8 < p.length; t += 9) {
    const ax = p[t] - x, ay = p[t + 1] - y, bx = p[t + 3] - x, by = p[t + 4] - y, cx = p[t + 6] - x, cy = p[t + 7] - y;
    const d = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(d) < 1e-12) continue;
    const u = (bx * cy - cx * by) / d, v = (cx * ay - ax * cy) / d, w = 1 - u - v;
    if (u < 0 || v < 0 || w < 0) continue;
    if (u * p[t + 2] + v * p[t + 5] + w * p[t + 8] > z) n += 1;
  }
  return n % 2 === 1;
}

describe("waxBlend (build 306)", () => {
  it("fills the crease where the tooth stands out of the gum, and only there", () => {
    const model = gum(), tooth = post();
    const wax = waxBlend(runtime, model, tooth);
    expect(wax).not.toBeNull();
    const plain = runtime.Manifold.union(model, tooth), joined = runtime.Manifold.union(plain, wax!);
    expect(joined.status()).toBe("NoError");
    expect(joined.genus()).toBe(0);
    // Right in the corner (0.2 mm out from the post, 0.2 mm above the gum): wax now.
    for (const angle of [0, 1, 2.5, 4]) {
      const x = 3.2 * Math.cos(angle) + 1e-4, y = 3.2 * Math.sin(angle) + 1e-4;
      expect(inside(plain, x, y, 0.2)).toBe(false);
      expect(inside(joined, x, y, 0.2)).toBe(true);
      // A fillet, not a collar: beyond its reach along either surface there is none.
      expect(inside(joined, 3 + BLEND_REACH + 1e-4, 1e-4, 0.15)).toBe(false);
      expect(inside(joined, x, y, BLEND_REACH)).toBe(false);
    }
    // Deepest about a quarter of the reach: 0.6 mm from both surfaces is clear.
    expect(inside(joined, 3.6 + 1e-4, 1e-4, 0.6)).toBe(false);
    // Little wax in all: a bead of under half a square millimetre round the post.
    const added = joined.volume() - plain.volume();
    expect(added).toBeGreaterThan(0.2);
    expect(added).toBeLessThan(2 * Math.PI * 3.3 * 0.45);
    // The tooth's top and the gum far away are as they were.
    const box = joined.boundingBox(), was = plain.boundingBox();
    expect(box.max[2]).toBeCloseTo(was.max[2], 3);
    expect(box.min[2]).toBeCloseTo(was.min[2], 3);
    expect(box.max[0]).toBeCloseTo(was.max[0], 3);
    [model, tooth, wax!, plain, joined].forEach((s) => s.delete());
  }, 60000);

  it("softens a step: a tooth standing behind a ledge of the patient's own", () => {
    // The patient's tooth: a block standing 4 mm out of the gum; the wax tooth beside it stands 8 mm - a step between them.
    const own = runtime.Manifold.cube([6, 6, 7], true).translate([0, 0, 0.5]);
    const model = runtime.Manifold.union(gum(), own);
    const tooth = runtime.Manifold.cube([6, 6, 11], true).translate([4, 0, 2.5]);
    const wax = waxBlend(runtime, model, tooth);
    expect(wax).not.toBeNull();
    const plain = runtime.Manifold.union(model, tooth), joined = runtime.Manifold.union(plain, wax!);
    // In the corner of the step (on the patient's tooth's top, against the wax tooth's side).
    expect(inside(plain, 0.8, 0.0001, 4.2)).toBe(false);
    expect(inside(joined, 0.8, 0.0001, 4.2)).toBe(true);
    [own, model, tooth, wax!, plain, joined].forEach((s) => s.delete());
  }, 60000);

  it("gives nothing where the tooth and the model are apart", () => {
    const model = gum(), tooth = runtime.Manifold.cube([4, 4, 4], true).translate([0, 0, 8]);
    expect(waxBlend(runtime, model, tooth)).toBeNull();
    [model, tooth].forEach((s) => s.delete());
  }, 60000);
});
