import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeToothSet } from "@/lib/toothLibrary";
import { sculptMeshOf } from "@/lib/meshSculpt";
import { bendAt, bendPoints, bendSpace, type SpaceHandle, type Vec3 } from "@/lib/toothSpace";

/** Build 312: a tooth shaped by handles as a bend of space - tried on a tooth of the app's own library (the largest of the oval set). */
const set = decodeToothSet(readFileSync(resolve(__dirname, "../../apps/web/public/libraries/pare/oval-upper-front.ptl")));
const made = sculptMeshOf(set.reduce((a, b) => (b.length > a.length ? b : a)));
const points = made.points, n = points.length / 3;
const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < points.length; i += 1) { lo[i % 3] = Math.min(lo[i % 3], points[i]); hi[i % 3] = Math.max(hi[i % 3], points[i]); }
/** The corner of the tooth nearest a point of its box (shares along x: across, y: through, z: neck to edge). */
const on = (fx: number, fy: number, fz: number): Vec3 => {
  const want = [fx, fy, fz].map((f, k) => lo[k] + f * (hi[k] - lo[k]));
  let best = 0, least = Infinity;
  for (let v = 0; v < n; v += 1) { const d = Math.hypot(points[v * 3] - want[0], points[v * 3 + 1] - want[1], points[v * 3 + 2] - want[2]); if (d < least) { least = d; best = v; } }
  return [points[best * 3], points[best * 3 + 1], points[best * 3 + 2]];
};
const neck: SpaceHandle[] = [on(0.15, 0.5, 0.08), on(0.85, 0.5, 0.08), on(0.5, 0, 0.1), on(0.5, 1, 0.1), on(0.5, 0.5, 0)].map((at) => ({ at }));
const left = on(0, 0.5, 1), right = on(1, 0.5, 1);
const flare: SpaceHandle[] = [{ at: left, pull: [-1.5, 0, 0] }, { at: right, pull: [1.5, 0, 0] }, ...neck];
/** The outline of the tooth's right side: its outermost x at each tenth of its length, neck to edge. */
const side = (now: Float64Array) => [0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85].map((f) => {
  const z = lo[2] + f * (hi[2] - lo[2]);
  let most = -Infinity;
  for (let v = 0; v < n; v += 1) if (Math.abs(points[v * 3 + 2] - z) < 0.3) most = Math.max(most, now[v * 3]);
  return most;
});

describe("a tooth shaped by handles, as a bend of space (build 312)", () => {
  it("takes every pulled handle exactly by its pull and leaves every held one exactly where it is", () => {
    const bend = bendSpace(flare)!;
    const move = [0, 0, 0];
    flare.forEach((handle) => {
      bendAt(bend, handle.at[0], handle.at[1], handle.at[2], move);
      const pull = handle.pull ?? [0, 0, 0];
      for (let k = 0; k < 3; k += 1) expect(move[k]).toBeCloseTo(pull[k], 9);
    });
  });

  it("flared by its incisal corners, the side widens more and more towards the edge and bows outwards all the way: never hollow, never a straight run", () => {
    const was = side(points), now = side(bendPoints(points, bendSpace(flare)));
    for (let i = 1; i < now.length; i += 1) expect(now[i] - was[i]).toBeGreaterThan(now[i - 1] - was[i - 1]);
    const steps = now.slice(1).map((x, i) => x - now[i]);
    for (let i = 1; i < steps.length; i += 1) expect(steps[i]).toBeLessThan(steps[i - 1] - 0.02);
  });

  it("with the middle of each side held as well, the edge flares and the middle and neck stay narrow", () => {
    const midLeft = on(0, 0.5, 0.55), midRight = on(1, 0.5, 0.55);
    const now = bendPoints(points, bendSpace([...flare, { at: midLeft }, { at: midRight }]));
    const was = side(points), is = side(now);
    // Below the held middle the side has hardly moved; at the edge it has gone out by most of the pull.
    expect(Math.abs(is[0] - was[0])).toBeLessThan(0.25);
    expect(Math.abs(is[1] - was[1])).toBeLessThan(0.25);
    expect(is[6] - was[6]).toBeGreaterThan(1.1);
  });

  it("one corner pulled with the other held moves its own side and not the other", () => {
    const now = bendPoints(points, bendSpace([{ at: right, pull: [1.5, 0, 0] }, { at: left }, ...neck]));
    let farLeft = 0;
    for (let v = 0; v < n; v += 1) if (points[v * 3] < lo[0] + 0.15 * (hi[0] - lo[0])) farLeft = Math.max(farLeft, Math.abs(now[v * 3] - points[v * 3]));
    expect(farLeft).toBeLessThan(0.3);
    expect(side(now)[6] - side(points)[6]).toBeGreaterThan(1.1);
  });

  it("keeps the tooth's own detail: no edge of the mesh is stretched or squeezed by much more than the edge of the tooth itself is widened (two fifths)", () => {
    const now = bendPoints(points, bendSpace(flare));
    let worst = 0;
    for (let i = 0; i + 2 < made.triangles.length; i += 3) for (let k = 0; k < 3; k += 1) {
      const a = made.triangles[i + k], b = made.triangles[i + ((k + 1) % 3)];
      const len = (p: Float64Array) => Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
      worst = Math.max(worst, Math.abs(len(now) - len(points)) / Math.max(0.2, len(points)));
    }
    expect(worst).toBeLessThan(0.7);
  });

  it("is instant: a tooth's every corner moved in a few milliseconds, nothing worked out in advance", () => {
    const t0 = performance.now();
    for (let round = 0; round < 10; round += 1) bendPoints(points, bendSpace(flare));
    expect((performance.now() - t0) / 10).toBeLessThan(40);
  });

  it("does with few handles, or handles all in one plane: one handle carries everything by its pull", () => {
    const one = bendPoints(points, bendSpace([{ at: right, pull: [0.4, 0, 0.2] }]));
    for (let v = 0; v < n; v += 97) { expect(one[v * 3] - points[v * 3]).toBeCloseTo(0.4, 9); expect(one[v * 3 + 2] - points[v * 3 + 2]).toBeCloseTo(0.2, 9); }
    const flat = bendSpace([{ at: [0, 0, 0], pull: [1, 0, 0] }, { at: [1, 0, 0] }, { at: [0, 1, 0] }, { at: [1, 1, 0] }]);
    expect(flat).not.toBeNull();
    const move = [0, 0, 0];
    bendAt(flat!, 0, 0, 0, move);
    expect(move[0]).toBeCloseTo(1, 6);
    expect(bendSpace([])).toBeNull();
  });
});
