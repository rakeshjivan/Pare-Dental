import manifoldModule, { type ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import { lowerField, SNAP, snapFit, snapHinge, upperField } from "@/lib/dentalSnapHinge";

/** Build 119: the snap hinge - the ball on the upper, snapping into a post on the lower. */
let runtime: ManifoldToplevel;
beforeAll(async () => {
  runtime = await manifoldModule();
  runtime.setup();
}, 60000);

describe("the snap hinge's fields", () => {
  const lower = lowerField();
  const upper = upperField();
  it("cuts a pocket the ball's size plus the fit, all round", () => {
    // Into each cheek (a little forward of the throat), below and above that, and forward into the front web: the pocket's wall SNAP.fit outside the ball.
    for (const [x, y, z] of [[0.94, -0.34, 0], [0.9, -0.3, -0.3], [0.9, -0.3, 0.3], [0, -1, 0]]) {
      const r = (SNAP.ball + SNAP.fit) / Math.hypot(x, y, z);
      expect(Math.abs(lower(x * r, y * r, z * r))).toBeLessThan(0.02);
    }
  });
  it("narrows the throat behind the ball to less than the ball, so the ball snaps in", () => {
    expect(SNAP.throat).toBeLessThan(SNAP.ball);
    // 1.5 mm behind the ball's centre, at the throat's radius: the cheek's face.
    expect(Math.abs(lower(SNAP.throat, 1.5, 0))).toBeLessThan(0.02);
    expect(lower(SNAP.ball - 0.05, 1.5, 0)).toBeLessThan(0);
    // The lead-in at the post's back is wider than the ball.
    expect(SNAP.lead).toBeGreaterThan(SNAP.ball);
  });
  it("leaves the cheeks about a millimetre thick beside the pocket", () => {
    const wall = SNAP.postHalf - (SNAP.ball + SNAP.fit);
    expect(wall).toBeGreaterThan(1);
    expect(wall).toBeLessThan(1.4);
  });
  it("puts the stem above the ball, leaning forward as it rises", () => {
    expect(upper(0, -2, 5)).toBeLessThan(0);
    expect(upper(0, 2, 5)).toBeGreaterThan(0);
  });
  it("keeps the fit within its bounds", () => {
    expect(snapFit(undefined)).toBe(SNAP.fit);
    expect(snapFit(1)).toBeLessThanOrEqual(0.25);
    expect(snapFit(0)).toBeGreaterThanOrEqual(0.05);
  });
});

describe("the snap hinge's parts", () => {
  it("closes on the bite and opens past 90 degrees without touching the post", () => {
    const { upper, lower } = snapHinge(runtime);
    const ball = runtime.Manifold.sphere(SNAP.ball, 192);
    const stem = upper.subtract(ball);
    for (const angle of [0, 15, 45, 90, 105]) {
      const turned = stem.rotate([-angle, 0, 0]);
      const touching = turned.intersect(lower);
      expect(touching.volume()).toBeLessThan(1e-4);
      touching.delete();
      turned.delete();
    }
    // The ball sits in its pocket, touching nothing.
    const inPocket = ball.intersect(lower);
    expect(inPocket.volume()).toBeLessThan(1e-4);
    // Closing past the bite, the stem meets the slot's front face: a stop.
    const past = stem.rotate([4, 0, 0]);
    const stop = past.intersect(lower);
    expect(stop.volume()).toBeGreaterThan(0.01);
    [inPocket, past, stop, stem, ball].forEach((solid) => solid.delete());
  }, 120000);
  it("is made once for each fit", () => {
    expect(snapHinge(runtime)).toBe(snapHinge(runtime, SNAP.fit));
  }, 120000);
});

describe("the snap hinge in the articulator", () => {
  it("stands its ball behind the bases' backs, clear of the post closed and opened", async () => {
    const { articulatorParts } = await import("@/lib/dentalArticulator");
    const heels = [{ x: -22, y: 20 }, { x: 22, y: 20 }];
    const a = articulatorParts(runtime as never, 20, -27, 27, 21, -21, null, 0, { upper: heels, lower: heels }, "fused", { snap: {} });
    expect(a.axleY).toBeCloseTo(20 + SNAP.behind, 6);
    // As wide as the bases allow: each post's outer side inside the bases' width.
    expect(Math.max(...a.centres.map(Math.abs)) + SNAP.postHalf).toBeLessThanOrEqual(27);
    const touching = runtime.Manifold.intersection(a.upper, a.lower);
    expect(touching.volume()).toBeLessThan(1e-3);
    // Opened about the axis: nothing of the upper's hinge meets the lower's posts (the ball turns in its pocket).
    const open = a.upper.translate([0, -a.axleY, 0]).rotate([-90, 0, 0]).translate([0, a.axleY, 0]);
    expect(runtime.Manifold.intersection(open, a.lower).volume()).toBeLessThan(1e-3);
  }, 120000);
});
