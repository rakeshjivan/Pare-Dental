import { describe, expect, it } from "vitest";
import { cleanStlSoup } from "@/lib/dentalMesh";

/**
 * Build 271 (final check): a sheet of no volume pinched onto a model along one of its edges goes, so the file is
 * watertight; the model itself is untouched.
 */
const cube = (): number[] => {
  const p = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const faces = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return faces.flatMap((f) => f.flatMap((i) => p[i]));
};

function edgeUses(soup: Float32Array) {
  const key = (i: number) => `${soup[i * 3]},${soup[i * 3 + 1]},${soup[i * 3 + 2]}`;
  const uses = new Map<string, number>();
  for (let t = 0; t < soup.length / 9; t += 1) {
    for (let k = 0; k < 3; k += 1) {
      const a = key(t * 3 + k), b = key(t * 3 + ((k + 1) % 3));
      const e = a < b ? `${a}|${b}` : `${b}|${a}`;
      uses.set(e, (uses.get(e) ?? 0) + 1);
    }
  }
  return [...uses.values()];
}

describe("cleanStlSoup and pinched sheets", () => {
  it("takes away a closed sheet of no volume pinched onto an edge", () => {
    // A flat square off the cube's edge A-B, its two faces split on different diagonals (no triangle repeated): closed,
    // of no volume, and the edge A-B then used four times.
    const A = [1, 0, 0], B = [1, 1, 0], C = [2, 1, 0], D = [2, 0, 0];
    const sheet = [A, B, C, A, C, D, B, A, D, B, D, C].flat();
    const soup = Float32Array.from([...cube(), ...sheet]);
    expect(edgeUses(soup).some((n) => n !== 2)).toBe(true);
    const clean = cleanStlSoup(soup);
    expect(clean.length).toBe(cube().length);
    expect(edgeUses(clean).every((n) => n === 2)).toBe(true);
  });

  it("leaves a model with no such sheet as it was", () => {
    const soup = Float32Array.from(cube());
    expect(cleanStlSoup(soup)).toBe(soup);
  });

  it("keeps two solids that touch along an edge", () => {
    const other = cube().map((v, i) => (i % 3 === 0 ? v + 1 : i % 3 === 2 ? v + 1 : v));
    const soup = Float32Array.from([...cube(), ...other]);
    expect(cleanStlSoup(soup).length).toBe(soup.length);
  });
});
