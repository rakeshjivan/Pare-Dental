import manifoldModule, { type ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import { makeDentalStudio, pinchedEdges, DRAIN_SLOT, type DentalStudioOptions } from "@/lib/dentalModel";

let runtime: ManifoldToplevel;
beforeAll(async () => { runtime = await manifoldModule(); runtime.setup(); });

// The same made-up U-shaped arch as dentalStudio47 (no patient's), teeth down like an upper out of the scanner.
function syntheticArch() {
  const nx = 100, ny = 90, sx = 50, sy = 45;
  const notch = (u: number, v: number) => Math.max(0.32 - u, u - 0.68, 0.45 - v);
  const z = (i: number, j: number) => {
    const u = i / nx, v = j / ny;
    const edge = Math.min(u, 1 - u, v, 1 - v, Math.max(0, notch(u, v)));
    const plateau = Math.min(1, edge * 8);
    const teeth = 1.5 * Math.max(0, Math.sin(u * Math.PI * 14)) * Math.max(0, Math.sin(v * Math.PI * 2));
    return plateau * (12 + teeth) - (1 - plateau) * (3 + 2 * Math.sin(i * 0.7) * Math.cos(j * 0.9));
  };
  const p = (i: number, j: number) => [(i / nx - 0.5) * sx, (j / ny - 0.5) * sy, -z(i, j)];
  const out: number[] = [];
  for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) {
    if (notch((i + 0.5) / nx, (j + 0.5) / ny) < 0) continue;
    const a = p(i, j), b = p(i + 1, j), c = p(i + 1, j + 1), d = p(i, j + 1);
    out.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  return Float32Array.from(out);
}

const base: DentalStudioOptions = { keep: null, base: 4, baseStyle: "follow", inside: "solid", wall: 3, hinge: false, layout: "print", label: "" };

/** Enclosed pockets in a horizontal slice of the model at height z: each is a hollow (or cell) with no way out at that height. */
function pocketsAt(positions: Float32Array, z: number) {
  const mesh = new runtime.Mesh({ numProp: 3, vertProperties: positions, triVerts: Uint32Array.from({ length: positions.length / 3 }, (_, k) => k) });
  mesh.merge();
  const solid = new runtime.Manifold(mesh);
  const section = solid.slice(z);
  const rings = section.toPolygons() as Array<Array<[number, number]>>;
  [solid, section].forEach((m) => m.delete());
  const area = (ring: Array<[number, number]>) => ring.reduce((sum, [x, y], k) => { const [x2, y2] = ring[(k + 1) % ring.length]; return sum + x * y2 - x2 * y; }, 0) / 2;
  return rings.filter((ring) => area(ring) < -0.5).length;
}

describe("build 107: drain slots in hollow models, at the floor", () => {
  it("opens three arch-shaped slots through the outer wall of a closed, empty hollow (none when open or with a honeycomb)", async () => {
    const input = { arches: [{ id: "a", positions: syntheticArch() }] };
    const solid = await makeDentalStudio(input, base, runtime as never);
    const open = await makeDentalStudio(input, { ...base, inside: "open", infill: "base" }, runtime as never);
    const closed = await makeDentalStudio(input, { ...base, inside: "closed", infill: "none" }, runtime as never);
    expect(DRAIN_SLOT).toEqual({ width: 4, height: 3 });
    for (const result of [open, closed]) {
      expect(pinchedEdges(result.parts[0].positions)).toBe(0);
    }
    // Without slots the hollow is a pocket shut in by the wall at the floor; with them it opens to the outside -
    // open underneath at the platform, closed on the floor a wall up - and every honeycomb cell with it.
    expect(pocketsAt(solid.parts[0].positions, 0.6)).toBe(0);
    // Build 117: open underneath (or with a honeycomb) no slots are cut - the resin drains through the open floor -
    // so the wall at the floor is whole and the hollow shows as a pocket there.
    expect(pocketsAt(open.parts[0].positions, 0.6)).toBeGreaterThan(0);
    expect(pocketsAt(closed.parts[0].positions, 3 + 0.6)).toBe(0);
    // Above the slots the wall is whole again: the hollow shows as a pocket there.
    expect(pocketsAt(closed.parts[0].positions, 3 + DRAIN_SLOT.height + 1)).toBeGreaterThan(0);
  }, 120_000);
});
