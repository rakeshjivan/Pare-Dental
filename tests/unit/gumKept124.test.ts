import manifoldModule, { type ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import { EDGE_SMOOTH, makeDentalStudio, type DentalStudioOptions } from "@/lib/dentalModel";

/**
 * Build 124 (Rakesh): every bit of the gum the person keeps after the Trim step comes through on the smooth base -
 * only its trimmed edge (the last EDGE_SMOOTH mm) may be smoothed. A quadrant of five teeth on a band of gum, made on
 * each smooth base: of the gum more than EDGE_SMOOTH in from its edge, all must be on the finished model, exactly.
 */
let runtime: ManifoldToplevel;
beforeAll(async () => {
  runtime = await manifoldModule();
  runtime.setup();
}, 60000);

function quadrant(): Float32Array {
  const out: number[] = [];
  const nx = 100, ny = 30, sx = 40, sy = 14;
  const z = (i: number, j: number) => {
    const u = i / nx, v = j / ny;
    const edge = Math.min(u, 1 - u, v, 1 - v);
    const plateau = Math.min(1, edge * 5);
    const teeth = 1.4 * Math.max(0, Math.sin(u * Math.PI * 5)) * Math.max(0, Math.sin((v - 0.25) * Math.PI * 2));
    // The gum falls away from the teeth to a trimmed edge that wanders up and down a little, as a real trim does.
    return plateau * (8 + teeth) - (1 - plateau) * (3 + 0.6 * Math.sin(i * 0.37) + 0.3 * Math.cos(j * 0.9));
  };
  const p = (i: number, j: number) => [(j / ny - 0.5) * sy, (i / nx - 0.5) * sx, z(i, j)];
  for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) {
    const a = p(i, j), b = p(i + 1, j), c = p(i + 1, j + 1), d = p(i, j + 1);
    out.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  return Float32Array.from(out);
}

const base: DentalStudioOptions = { keep: null, base: 4, baseStyle: "clean", inside: "open", wall: 2, hinge: false, layout: "print", label: "" };

describe("the gum the person kept (build 124)", () => {
  it.each(["clean", "ortho", "follow"] as const)("all comes through on the %s smooth base, but its trimmed edge", async (baseStyle) => {
    const made = await makeDentalStudio({ arches: [{ id: "q", positions: quadrant() }] }, { ...base, baseStyle }, runtime as never);
    expect(made.gumKept).toBeDefined();
    expect(made.gumKept![0][EDGE_SMOOTH]).toBeGreaterThanOrEqual(0.999);
  }, 120_000);
});
