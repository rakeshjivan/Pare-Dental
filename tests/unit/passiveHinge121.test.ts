import manifoldModule, { type ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import { passiveHinge, passiveStemDirection, passiveUpperField } from "@/lib/dentalPassiveHinge";
import { SNAP } from "@/lib/dentalSnapHinge";

/** Build 121: the passive hinge - the snap hinge turned upside down, the ball on the lower, lifting out of the upper's housing. */
let runtime: ManifoldToplevel;
beforeAll(async () => {
  runtime = await manifoldModule();
  runtime.setup();
}, 60000);

const FIT = 0.1;
/** Turns a solid open by `angle` degrees about the axis (as the upper opens) and moves it `lift` mm out along its channel. */
function moved(solid: ReturnType<ManifoldToplevel["Manifold"]["sphere"]>, angle: number, lift = 0) {
  const [, dy, dz] = passiveStemDirection();
  const r = (angle * Math.PI) / 180;
  const ly = -dy * Math.cos(r) - dz * Math.sin(r), lz = dy * Math.sin(r) - dz * Math.cos(r);
  return solid.rotate([-angle, 0, 0]).translate([0, ly * lift, lz * lift]);
}

describe("the passive hinge's housing", () => {
  const housing = passiveUpperField(FIT);
  it("seats the ball in its own shape, the fit larger all round, in the cheeks either side and the web in front", () => {
    // (Over the ball's middle is the slot the stem swings back through as the models open, as in the snap hinge's post.)
    for (const [x, y, z] of [[0.9, 0, 0.4], [-0.9, 0, 0.4], [0.9, 0.3, 0.1], [0.9, -0.3, 0.3], [0, -1, 0.8]]) {
      const r = (SNAP.ball + FIT) / Math.hypot(x, y, z);
      expect(Math.abs(housing(x * r, y * r, z * r))).toBeLessThan(0.03);
    }
  });
  it("is open below along the stem, as wide as the seat, so nothing grips the ball", () => {
    const [, dy, dz] = passiveStemDirection();
    expect(dz).toBeLessThan(0);
    for (const s of [1, 3, 5]) expect(housing(SNAP.ball, dy * s, dz * s)).toBeGreaterThan(0);
  });
});

describe("the passive hinge's parts", () => {
  it("closes on the bite, opens past 90 degrees and lifts off without touching", () => {
    const { upper, lower } = passiveHinge(runtime as never, FIT) as unknown as { upper: ReturnType<ManifoldToplevel["Manifold"]["sphere"]>; lower: ReturnType<ManifoldToplevel["Manifold"]["sphere"]> };
    for (const angle of [0, 15, 45, 90, 105]) expect(moved(upper, angle).intersect(lower).volume()).toBeLessThan(1e-4);
    for (const angle of [0, 30]) for (const lift of [1, 4, 10]) expect(moved(upper, angle, lift).intersect(lower).volume()).toBeLessThan(1e-4);
    // Pressed down onto the ball, or pushed back or sideways past the fit, the housing meets it: the ball locates the upper.
    for (const [x, y, z] of [[0, 0, -0.3], [0.3, 0, 0], [-0.3, 0, 0], [0, 0.3, 0], [0, -0.3, 0]]) expect(upper.translate([x, y, z]).intersect(lower).volume()).toBeGreaterThan(1e-4);
  }, 120000);
  it("is the snap hinge's size: a 7.8 mm ball and parts no wider than the snap hinge's", () => {
    const { upper, lower } = passiveHinge(runtime as never, FIT) as unknown as { upper: { boundingBox(): { min: number[]; max: number[] } }; lower: { boundingBox(): { min: number[]; max: number[] } } };
    expect(lower.boundingBox().max[2]).toBeCloseTo(SNAP.ball, 1);
    expect(upper.boundingBox().max[0]).toBeLessThanOrEqual(SNAP.postHalf + 0.05);
    expect(lower.boundingBox().max[0]).toBeLessThanOrEqual(SNAP.armHalf + 0.05);
  }, 120000);
  it("is made once for each fit", () => {
    expect(passiveHinge(runtime as never, FIT)).toBe(passiveHinge(runtime as never, FIT));
  }, 120000);
});

describe("the passive hinge in the articulator", () => {
  it("stands where the snap hinge does on the smooth base, clear closed and opened", async () => {
    const { articulatorParts } = await import("@/lib/dentalArticulator");
    const heels = [{ x: -22, y: 20 }, { x: 22, y: 20 }];
    const a = articulatorParts(runtime as never, 20, -27, 27, 21, -21, null, 0, { upper: heels, lower: heels }, "fused", { smooth: true });
    expect(a.axleY).toBeCloseTo(20 + SNAP.behind, 6);
    expect(runtime.Manifold.intersection(a.upper, a.lower).volume()).toBeLessThan(1e-3);
    for (const angle of [30, 60, 90]) {
      const open = a.upper.translate([0, -a.axleY, 0]).rotate([-angle, 0, 0]).translate([0, a.axleY, 0]);
      expect(runtime.Manifold.intersection(open, a.lower).volume()).toBeLessThan(1e-3);
    }
  }, 180000);
});
