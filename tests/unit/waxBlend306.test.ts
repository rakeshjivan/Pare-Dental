import manifoldModule, { type ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import { BLEND_REACH, waxBlend, waxWall } from "@/lib/waxBlend";
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

  it("runs no wax over a wax tooth's face where the patient's tooth lies just under it", () => {
    // The patient's tooth, 5.4 mm square, inside the wax tooth, 6 mm square: their faces 0.3 mm apart all the way up.
    const own = runtime.Manifold.cube([5.4, 5.4, 9], true).translate([0, 0, 1.5]);
    const model = runtime.Manifold.union(gum(), own);
    const tooth = runtime.Manifold.cube([6, 6, 11], true).translate([0, 0, 2.5]);
    const wax = waxBlend(runtime, model, tooth);
    const plain = runtime.Manifold.union(model, tooth), joined = wax ? runtime.Manifold.union(plain, wax) : plain;
    // Half way up the wax tooth, just off each face: clear, as it was.
    for (const [x, y] of [[3.06, 0.3], [-3.06, 0.3], [0.3, 3.06], [0.3, -3.06]]) expect(inside(joined, x, y, 4)).toBe(false);
    // And still wax in the corner at the gum.
    expect(inside(joined, 3.2, 0.3, 0.2)).toBe(true);
    [own, model, tooth, plain].forEach((s) => s.delete());
  }, 60000);

  it("gives nothing where the tooth and the model are apart", () => {
    const model = gum(), tooth = runtime.Manifold.cube([4, 4, 4], true).translate([0, 0, 8]);
    expect(waxBlend(runtime, model, tooth)).toBeNull();
    [model, tooth].forEach((s) => s.delete());
  }, 60000);

  it("makes a hollow model's wall good where a cut has opened its cavity", () => {
    // A hollow block (walls 2 mm) with the patient's tooth, hollow too, standing on it; the cut takes the tooth's
    // back half away, down to 1 mm above the block - the cavity stands open; the wax tooth is a thin plate in front.
    const outer = runtime.Manifold.union(runtime.Manifold.cube([20, 20, 8], true), runtime.Manifold.cube([6, 6, 8], true).translate([0, 0, 8]));
    const cavity = runtime.Manifold.union(runtime.Manifold.cube([16, 16, 4], true), runtime.Manifold.cube([2, 2, 9], true).translate([0, 0, 5.5]));
    const cutter = runtime.Manifold.cube([8, 4, 8], true).translate([0, 2, 9]);
    const tooth = runtime.Manifold.cube([6, 1.5, 9], true).translate([0, -2.5, 8]);
    const hollowed = runtime.Manifold.difference(runtime.Manifold.difference(outer, cavity), cutter);
    const model = runtime.Manifold.union(hollowed, runtime.Manifold.difference(tooth, cavity));
    // The cavity's chimney is open to the cut: a point in it, and one just behind the cut face, are empty.
    expect(inside(model, 0.3, 0.2, 7)).toBe(false);
    const fill = waxWall(runtime, model, cavity, tooth, [tooth], [cutter], 1.5);
    expect(fill).not.toBeNull();
    const made = runtime.Manifold.union(model, fill!);
    expect(made.status()).toBe("NoError");
    // Closed over now: solid just inside the cut face; the cavity deep in the block is still there; nothing added outside.
    expect(inside(made, 0.3, -0.3, 7)).toBe(true);
    expect(inside(made, 5.1, 5.2, 0.1)).toBe(false);
    const was = model.boundingBox(), now = made.boundingBox();
    for (let k = 0; k < 3; k += 1) { expect(now.max[k]).toBeCloseTo(was.max[k], 3); expect(now.min[k]).toBeCloseTo(was.min[k], 3); }
    // And where the wall is whole there is nothing to add.
    expect(waxWall(runtime, runtime.Manifold.union(runtime.Manifold.difference(outer, cavity), runtime.Manifold.difference(tooth, cavity)), cavity, tooth, [tooth], [], 1.5)).toBeNull();
  }, 60000);
});
