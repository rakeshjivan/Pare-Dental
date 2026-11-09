import manifoldModule, { type ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import { cleanStlSoup, pinchedEdges, snapCorners, solidPositions, stlPositions, STL_TIDY, STL_WELD } from "@/lib/dentalMesh";

/**
 * Build 275 (final check, Build 274): a model is written watertight - simplified by a few microns only when the plain
 * file is not - and a model that is already clean is written exactly as made.
 */
let runtime: ManifoldToplevel;
beforeAll(async () => {
  runtime = await manifoldModule();
  runtime.setup();
});

describe("stlPositions", () => {
  it("writes a clean solid exactly as cleanStlSoup does", () => {
    const solid = runtime.Manifold.sphere(10, 64).subtract(runtime.Manifold.cube([8, 8, 30], true));
    const plain = cleanStlSoup(solidPositions(solid));
    const written = stlPositions(solid);
    expect(pinchedEdges(written)).toBe(0);
    expect(Array.from(written)).toEqual(Array.from(plain));
    solid.delete();
  });

  it("tidies by no more than a few microns", () => {
    expect(Math.max(...STL_TIDY)).toBeLessThanOrEqual(0.01);
  });

  it("makes a far-from-origin solid with near-collinear corners watertight", () => {
    // Far from the origin, 32-bit floats are coarse: many thin slivers from the cut can round onto one line.
    const base = runtime.Manifold.cube([40, 40, 20]).translate([60, -20, 0]);
    let solid = base;
    for (let k = 0; k < 40; k += 1) {
      const cut = runtime.Manifold.cylinder(25, 0.3 + k * 0.01, 0.3 + k * 0.01, 24).rotate([0, 0, k * 7.3]).translate([62 + k * 0.9, -18 + k * 0.91, -1]);
      const next = solid.subtract(cut);
      cut.delete();
      if (solid !== base) solid.delete();
      solid = next;
    }
    const written = stlPositions(solid);
    expect(pinchedEdges(written)).toBeLessThanOrEqual(pinchedEdges(cleanStlSoup(solidPositions(solid))));
    expect(Math.abs(solid.volume())).toBeGreaterThan(0);
    solid.delete();
    base.delete();
  });

  it("joins corners a hair apart, so a reader welding within a tolerance finds the file closed", () => {
    // Two triangles of a fan sharing an edge, plus a sliver whose far corner is 1e-9 mm from a fan corner.
    const near = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1e-9, 0, 0, 1, 0]);
    const snapped = snapCorners(near, STL_WELD);
    expect(snapped[12]).toBe(1);
    expect(snapped[13]).toBe(0);
    expect(cleanStlSoup(snapped).length).toBe(9);
    expect(pinchedEdges(near, STL_WELD)).toBeGreaterThan(0);
  });

  it("moves no corner by more than the weld", () => {
    const solid = runtime.Manifold.sphere(10, 48).translate([123.456, -7.89, 3.21]);
    const plain = solidPositions(solid);
    const snapped = snapCorners(plain, STL_WELD);
    let most = 0;
    for (let i = 0; i < plain.length; i += 1) most = Math.max(most, Math.abs(plain[i] - snapped[i]));
    expect(most).toBeLessThanOrEqual(2 * STL_WELD);
    expect(pinchedEdges(stlPositions(solid), STL_WELD)).toBe(0);
    solid.delete();
  });
});
