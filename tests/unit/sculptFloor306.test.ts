import { describe, expect, it } from "vitest";
import { LiveMesh } from "@/lib/liveSculpt";
import { NearestSurface } from "@/lib/nearestSurface";
import { sculptMeshOf } from "@/lib/meshSculpt";

/** Build 306: a floor under a wax tooth - no brush takes the wax through the patient's tooth. */
function sheet(n: number, size: number, z: number) {
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
    const x0 = i * size, y0 = j * size, x1 = x0 + size, y1 = y0 + size;
    out.push(x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z);
  }
  return out;
}
const live = (soup: number[]) => { const m = sculptMeshOf(soup); return new LiveMesh(m.points, m.triangles); };
const lowest = (mesh: LiveMesh) => { let low = Infinity; for (let v = 0; v < mesh.vCount; v += 1) if (mesh.vAlive[v]) low = Math.min(low, mesh.pos[v * 3 + 2]); return low; };

describe("a sculpt floor (build 306)", () => {
  it("deflating wax stops on the scan under it; without a floor it goes through", () => {
    // The wax: a sheet at z = 0.5 facing up. The patient's tooth: a sheet at z = 0, facing up.
    for (const floored of [true, false]) {
      const mesh = live(sheet(20, 0.5, 0.5));
      if (floored) mesh.floor = new NearestSurface(Float32Array.from(sheet(20, 0.5, 0)), 4);
      const hit = mesh.pick([5, 5, 10], [0, 0, -1])!;
      for (let k = 0; k < 20; k += 1) mesh.dab("deflate", hit.point, [0, 0, 1], 3, mesh.region(hit.point, 3, hit.triangle), 1, 0.2);
      if (floored) { expect(lowest(mesh)).toBeGreaterThan(0); expect(lowest(mesh)).toBeLessThan(0.1); }
      else expect(lowest(mesh)).toBeLessThan(-1);
    }
  });

  it("a corner already buried under the floor is left free (a wax tooth's neck stands in the gum)", () => {
    const mesh = live(sheet(20, 0.5, -1));
    mesh.floor = new NearestSurface(Float32Array.from(sheet(20, 0.5, 0)), 4);
    const hit = mesh.pick([5, 5, 10], [0, 0, -1])!;
    for (let k = 0; k < 5; k += 1) mesh.dab("deflate", hit.point, [0, 0, 1], 3, mesh.region(hit.point, 3, hit.triangle), 1, 0.2);
    expect(lowest(mesh)).toBeLessThan(-1.3);
  });

  it("smoothing a bump of wax down does not take it under the floor", () => {
    const soup = sheet(20, 0.5, 0.1);
    // A dent in the wax reaching under the scan would be what smoothing its rim makes of its neighbours: start with a ridge instead.
    for (let i = 2; i < soup.length; i += 3) if (Math.abs(soup[i - 2] - 5) < 0.3) soup[i] = 1.5;
    const mesh = live(soup);
    mesh.floor = new NearestSurface(Float32Array.from(sheet(20, 0.5, 0)), 4);
    const hit = mesh.pick([5, 5, 10], [0, 0, -1])!;
    for (let k = 0; k < 30; k += 1) mesh.dab("smooth", hit.point, [0, 0, 1], 3, mesh.region(hit.point, 3, hit.triangle), 1, 0.2);
    expect(lowest(mesh)).toBeGreaterThan(0);
  });
});
