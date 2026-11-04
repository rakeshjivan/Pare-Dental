import manifoldModule, { type ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import { articulatorParts, CAPTIVE_BALL, CAPTIVE_GRIP, CAPTIVE_STEM, CUP_FIT } from "@/lib/dentalArticulator";

/* Build 118: Pare Captive - an 8 mm ball under the upper, clicked into a cradle on the lower from behind. */
let runtime: ManifoldToplevel;
beforeAll(async () => { runtime = await manifoldModule(); runtime.setup(); });

const parts = (hinge: "passive" | "captive", fit?: number) => articulatorParts(runtime as never, 0, -25, 25, 18, -18, null, 0, null, "fused", { hinge, ...(fit !== undefined ? { fit } : {}) });
/** Whether the point is inside the solid (a tiny cube there overlaps it). */
const inside = (solid: { intersect: (other: unknown) => { volume: () => number; delete: () => void } }, p: [number, number, number]) => {
  const probe = runtime.Manifold.cube([0.02, 0.02, 0.02], true).translate(p);
  const hit = solid.intersect(probe); const v = hit.volume(); hit.delete(); probe.delete();
  return v > 1e-9;
};

describe("Pare Captive", () => {
  it("puts the ball under the upper and the cradle on the lower, on the same axis as Pare Passive", () => {
    const passive = parts("passive"), captive = parts("captive");
    expect(captive.axleY).toBeCloseTo(passive.axleY, 6);
    expect(captive.centres).toEqual(passive.centres);
    const [c] = captive.centres, ay = captive.axleY;
    // The ball's centre and its stem on the upper; the ball's top, but not past it.
    expect(inside(captive.upper as never, [c, ay, 0])).toBe(true);
    expect(inside(captive.upper as never, [c, ay, CAPTIVE_BALL - 0.05])).toBe(true);
    expect(inside(captive.upper as never, [c + CAPTIVE_BALL + 0.1, ay, 0])).toBe(false);
    expect(inside(captive.upper as never, [c, ay, 10])).toBe(true);
    expect(inside(captive.upper as never, [c + CAPTIVE_STEM + 0.1, ay, 10])).toBe(false);
    for (const s of [passive, captive]) { s.upper.delete(); s.lower.delete(); }
  });
  it("leaves the pocket clear of the ball by the fit, and the slot behind it narrower than the ball", () => {
    for (const fit of [0.05, CUP_FIT, 0.2]) {
      const captive = parts("captive", fit);
      const [c] = captive.centres, ay = captive.axleY;
      // Clear just outside the ball all round the front and sides; post wall beyond the pocket.
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, -1, 0], [0, 0, -1]]) {
        const r = CAPTIVE_BALL + fit * 0.5;
        expect(inside(captive.lower as never, [c + dx * r, ay + dy * r, dz * r])).toBe(false);
        expect([dx, dy, dz, inside(captive.lower as never, [c + dx * (CAPTIVE_BALL + fit + 0.3), ay + dy * (CAPTIVE_BALL + fit + 0.3), dz * (CAPTIVE_BALL + fit + 0.3)])]).toEqual([dx, dy, dz, true]);
      }
      // Behind the ball the slot's walls stand inside the ball's width: the grip that holds it.
      const halfSlot = CAPTIVE_BALL - CAPTIVE_GRIP / 2;
      expect(inside(captive.lower as never, [c + halfSlot + 0.03, ay + 2.5, 0])).toBe(true);
      expect(inside(captive.lower as never, [c + halfSlot - 0.03, ay + 2.5, 0])).toBe(false);
      // Above the ball the post holds it down (wall either side of the slot at the post's top).
      expect(inside(captive.lower as never, [c + halfSlot + 0.03, ay - 0.5, 2])).toBe(true);
      captive.upper.delete(); captive.lower.delete();
    }
  });
  it("makes closed solids that do not overlap each other with the models closed", () => {
    const captive = parts("captive");
    expect(String(captive.upper.status())).toMatch(/NoError|^0$/); expect(String(captive.lower.status())).toMatch(/NoError|^0$/);
    const both = captive.upper.intersect(captive.lower);
    expect(both.volume()).toBeLessThan(1e-6);
    both.delete(); captive.upper.delete(); captive.lower.delete();
  });
});
