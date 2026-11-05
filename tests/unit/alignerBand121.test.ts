import manifoldModule, { type ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import { archBand } from "@/lib/dentalBase";
import { polygonDistance } from "@/lib/dentalSnapHinge";
import type { Mesh } from "@/lib/dentalMesh";

/** Build 121: an aligner model's outline - a horseshoe round the arch, open in the middle. */
let runtime: ManifoldToplevel;
beforeAll(async () => {
  runtime = await manifoldModule();
  runtime.setup();
}, 60000);

/** A synthetic arch seen from above: a strip 10 mm wide along a U - a half circle of radius 22 mm and two 15 mm arms. */
function uArch(): { mesh: Mesh; centre: Array<[number, number]> } {
  const centre: Array<[number, number]> = [];
  for (let y = 15; y > 0; y -= 1) centre.push([-22, y]);
  for (let k = 0; k <= 60; k += 1) { const a = Math.PI + (Math.PI * k) / 60; centre.push([22 * Math.cos(a), 22 * Math.sin(a)]); }
  for (let y = 1; y <= 15; y += 1) centre.push([22, y]);
  const v: number[] = [], f: number[] = [];
  centre.forEach(([x, y], i) => {
    const [px, py] = centre[Math.max(0, i - 1)], [nx, ny] = centre[Math.min(centre.length - 1, i + 1)];
    const tx = nx - px, ty = ny - py, l = Math.hypot(tx, ty);
    v.push(x - (ty / l) * 5, y + (tx / l) * 5, 0, x + (ty / l) * 5, y - (tx / l) * 5, 0);
    if (i) { const a = 2 * (i - 1); f.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  return { mesh: { v, f }, centre };
}

describe("an aligner model's horseshoe outline", () => {
  it("follows the arch both sides, the scan inside it with room for the drape, the middle left open", () => {
    const { mesh } = uArch();
    const ring = archBand(runtime as never, mesh, 3);
    expect(ring.length).toBeGreaterThan(20);
    const inside = (x: number, y: number) => polygonDistance(ring, x, y);
    // Every point of the scan at least 2 mm inside the line.
    for (let i = 0; i < mesh.v.length; i += 3) expect(inside(mesh.v[i], mesh.v[i + 1])).toBeLessThan(-1.9);
    // The palate / tongue space in the middle of the U is outside it.
    expect(inside(0, 0)).toBeGreaterThan(0);
    expect(inside(0, 10)).toBeGreaterThan(0);
    // No further out than the grow (and a little for the smoothing) from the arch's outer side.
    expect(inside(0, -22 - 5 - 4)).toBeGreaterThan(0);
  }, 60000);
});
