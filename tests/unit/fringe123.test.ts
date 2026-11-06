import { describe, expect, it } from "vitest";
import { relaxFringe } from "@/lib/dentalBase";
import type { Mesh } from "@/lib/dentalMesh";

/** Build 123: a trimmed scan's last millimetre or so relaxed on the smooth base - the folds out, the teeth untouched. */

/** A flat strip of gum 20 mm long and 6 mm deep (y 0 at its edge), 0.25 mm triangles, its last row zig-zagged in z. */
function raggedStrip(): { mesh: Mesh; nx: number; ny: number } {
  const step = 0.25, nx = 81, ny = 25;
  const v: number[] = [], f: number[] = [];
  for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) {
    const ragged = j <= 2 ? (i % 2 ? 0.4 : -0.4) * (1 - j / 3) : 0;
    v.push(i * step, j * step, ragged);
  }
  for (let j = 0; j + 1 < ny; j += 1) for (let i = 0; i + 1 < nx; i += 1) {
    const a = j * nx + i;
    f.push(a, a + 1, a + nx, a + 1, a + nx + 1, a + nx);
  }
  return { mesh: { v, f }, nx, ny };
}

const roughness = (m: Mesh, nx: number, row: number) => {
  let sum = 0;
  for (let i = 10; i < nx - 10; i += 1) sum += Math.abs(m.v[(row * nx + i) * 3 + 2]);
  return sum / (nx - 20);
};

describe("relaxing the fringe of a scan's edge", () => {
  it("evens out the folds near the edge", () => {
    const { mesh, nx } = raggedStrip();
    const before = roughness(mesh, nx, 1);
    relaxFringe(mesh, 1.5, 8);
    expect(roughness(mesh, nx, 1)).toBeLessThan(before * 0.4);
  });

  it("never moves the teeth, nor the surface beyond its reach", () => {
    const { mesh, nx, ny } = raggedStrip();
    const keep = new Uint8Array(nx * ny);
    for (let i = 0; i < nx / 2; i += 1) keep[nx + i] = 1;
    const was = mesh.v.slice();
    relaxFringe(mesh, 1.5, 8, keep);
    for (let i = 0; i < nx / 2; i += 1) for (let a = 0; a < 3; a += 1) expect(mesh.v[(nx + i) * 3 + a]).toBe(was[(nx + i) * 3 + a]);
    // More than 1.5 mm from every edge of the strip (rows 7 to 17, away from its ends) nothing moves.
    for (let j = 7; j <= 17; j += 1) for (let i = 7; i < nx - 7; i += 1) for (let a = 0; a < 3; a += 1) expect(mesh.v[(j * nx + i) * 3 + a]).toBe(was[(j * nx + i) * 3 + a]);
  });
});
