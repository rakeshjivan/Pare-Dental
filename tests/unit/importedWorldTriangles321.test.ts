import { describe, expect, it } from "vitest";
import { importedWorldTriangles, meshForShape } from "@/lib/editorMeshCore";
import { meshShapeFromPositions } from "@/lib/lithophane";
import type { WorkplaneShape } from "@/types/layerling";

/** Build 321: an imported mesh's world triangles worked out directly are exactly meshForShape's. */
const soup = (() => {
  const out: number[] = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let t = 0; t < 400; t += 1) for (let k = 0; k < 9; k += 1) out.push(rnd() * 40 - 20 + (k % 3 === 1 ? 20 : 0));
  return out;
})();
const base = meshShapeFromPositions("Scan", "#cccccc", soup);
const old = (shape: WorkplaneShape) => { const mesh = meshForShape(shape); const out: number[] = []; mesh.faces.forEach((face) => face.forEach((i) => out.push(mesh.vertices[i][0], mesh.vertices[i][1], mesh.vertices[i][2]))); return out; };

describe("an imported mesh's triangles in the world, worked out directly (build 321)", () => {
  const cases: Array<[string, Partial<WorkplaneShape>]> = [
    ["as imported", {}],
    ["moved and lifted", { x: 12.5, z: -7.25, elevation: 3.75 }],
    ["turned about all three axes", { rotation: 37, rotationX: 21, rotationZ: -64 }],
    ["resized", { width: base.width * 1.3, depth: base.depth * 0.8, height: base.height * 1.1 }],
    ["mirrored once (its triangles wound the other way)", { mirrorX: true }],
    ["mirrored twice", { mirrorX: true, mirrorZ: true }],
    ["mirrored three times, turned and moved", { mirrorX: true, mirrorY: true, mirrorZ: true, rotation: -15, rotationX: 80, x: 4, elevation: 9 }],
  ];
  for (const [name, change] of cases) {
    it(`${name}: the same numbers, corner for corner`, () => {
      const shape = { ...base, ...change } as WorkplaneShape;
      const direct = importedWorldTriangles(shape);
      expect(direct).not.toBeNull();
      const want = old(shape);
      expect(direct!.length).toBe(want.length);
      let worst = 0;
      for (let i = 0; i < want.length; i += 1) worst = Math.max(worst, Math.abs(direct![i] - want[i]));
      expect(worst).toBeLessThan(1e-9);
    });
  }
  it("what it does not cover is left to meshForShape", () => {
    expect(importedWorldTriangles({ ...base, kind: "box" } as WorkplaneShape)).toBeNull();
    expect(importedWorldTriangles({ ...base, importedMesh: undefined } as WorkplaneShape)).toBeNull();
  });
});

describe("a tapered or twisted mesh is left to meshForShape (build 321)", () => {
  it("a taper", () => { expect(importedWorldTriangles({ ...base, taperTopWidth: base.width / 2 } as WorkplaneShape)).toBeNull(); });
});
