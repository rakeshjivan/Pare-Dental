import manifoldModule, { type ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import { ALIGNER_LABEL_LEDGE, ALIGNER_LEDGE_MIN, makeDentalStudio, type DentalStudioOptions } from "@/lib/dentalModel";
import { sideRun } from "@/lib/dentalBase";

/**
 * Build 266 (Rakesh): the name goes on the back of a study or orthodontic model (long and straight), whole - never up
 * into its rounded top edge - and on the side of an aligner model, which has no back.
 */
let runtime: ManifoldToplevel;
beforeAll(async () => {
  runtime = await manifoldModule();
  runtime.setup();
}, 60000);

/** A made-up arch, no patient's (as in dentalStudio47): bumps along a U, the incisors in front at -y. */
function syntheticArch(options: { teethDown?: boolean; flap?: boolean; front?: number } = {}) {
  const nx = 120, ny = 60, sx = 60, sy = 30;
  const front = options.front ?? 0;
  const notch = (u: number, v: number) => Math.max(0.32 - u, u - 0.68, 0.45 - v);
  const z = (i: number, j: number) => {
    const u = i / nx, v = j / ny;
    const edge = Math.min(u, 1 - u, v, 1 - v, Math.max(0, notch(u, v)));
    const plateau = Math.min(1, edge * 8);
    const teeth = 1.5 * Math.max(0, Math.sin(u * Math.PI * 14)) * Math.max(0, Math.sin(v * Math.PI * 2));
    const ragged = 3 + 2 * Math.sin(i * 0.7) * Math.cos(j * 0.9);
    return plateau * (12 + teeth) - (1 - plateau) * ragged;
  };
  // Front at -y: the closed end of the U is at small v.
  const p = (i: number, j: number) => [(i / nx - 0.5) * sx, (j / ny - 0.5) * sy + front, z(i, j)];
  const out: number[] = [];
  const hole = (i: number, j: number) => i >= 20 && i < 22 && j >= 6 && j < 8;
  for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) {
    if (notch((i + 0.5) / nx, (j + 0.5) / ny) < 0 || hole(i, j)) continue;
    const a = p(i, j), b = p(i + 1, j), c = p(i + 1, j + 1), d = p(i, j + 1);
    out.push(...a, ...c, ...b, ...a, ...d, ...c);
  }
  if (options.flap) {
    // A cheek flap folded back under the front edge: a strip that hangs below the margin.
    for (let i = 10; i < 110; i += 1) {
      const x0 = (i / nx - 0.5) * sx, x1 = ((i + 1) / nx - 0.5) * sx, y0 = -sy / 2 + front;
      const a = [x0, y0, z(i, 0)], b = [x1, y0, z(i + 1, 0)], c = [x1, y0 + 3, -6], d = [x0, y0 + 3, -6];
      out.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
  }
  if (options.teethDown) {
    for (let t = 0; t < out.length; t += 9) {
      for (let k = 2; k < 9; k += 3) out[t + k] = -out[t + k];
      for (let k = 0; k < 3; k += 1) { const swap = out[t + 3 + k]; out[t + 3 + k] = out[t + 6 + k]; out[t + 6 + k] = swap; }
    }
  }
  out.push(80, 0, 0, 81, 0, 0, 80, 1, 0);
  return Float32Array.from(out);
}

const base: DentalStudioOptions = { keep: null, base: 4, baseStyle: "clean", inside: "open", wall: 2, hinge: false, layout: "print", label: "" };

/** How many of the model's corners lie within 1 mm of its back (largest y) and of its sides (largest |x|). */
function near(positions: ArrayLike<number>) {
  let maxY = -Infinity, maxX = 0;
  for (let i = 0; i < positions.length; i += 3) { maxY = Math.max(maxY, positions[i + 1]); maxX = Math.max(maxX, Math.abs(positions[i])); }
  let back = 0, side = 0;
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i + 1] > maxY - 1) back += 1;
    if (Math.abs(positions[i]) > maxX - 1) side += 1;
  }
  return { back, side };
}

describe("where the name goes (build 266)", () => {
  it.each(["clean", "ortho"] as const)("a %s model: on its back", async (baseStyle) => {
    const input = { arches: [{ id: "a", positions: syntheticArch() }] };
    const plain = await makeDentalStudio(input, { ...base, baseStyle }, runtime as never);
    const named = await makeDentalStudio(input, { ...base, baseStyle, label: "J 12" }, runtime as never);
    expect(named.warnings).not.toContain("label");
    const before = near(plain.parts[0].positions), after = near(named.parts[0].positions);
    expect(after.back).toBeGreaterThan(before.back + 50);
  }, 180_000);

  it("finds the cheek side's outer wall of a curved outline", () => {
    // An ellipse, counter-clockwise: the run facing out to the right is its right-hand side, all of it in x > 0.
    const ring: Array<[number, number]> = [];
    for (let k = 0; k < 72; k += 1) ring.push([30 * Math.cos((k * Math.PI) / 36), 20 * Math.sin((k * Math.PI) / 36)]);
    const run = sideRun(ring, (nx, _ny, mid) => Math.abs(nx) > 0.6 && nx * mid[0] > 0);
    expect(run.length).toBeGreaterThan(10);
    for (const [x] of run) expect(x).toBeGreaterThan(0);
  });

  it("an aligner model: on its side, the wall raised for it", async () => {
    const input = { arches: [{ id: "a", positions: syntheticArch() }] };
    const aligner = { ...base, baseStyle: "follow" as const, gum: 2 };
    const plain = await makeDentalStudio(input, aligner, runtime as never);
    const named = await makeDentalStudio(input, { ...aligner, label: "J 12" }, runtime as never);
    expect(named.warnings).not.toContain("label");
    expect(named.parts[0].height - plain.parts[0].height).toBeCloseTo(ALIGNER_LABEL_LEDGE - ALIGNER_LEDGE_MIN, 0);
  }, 180_000);
});
