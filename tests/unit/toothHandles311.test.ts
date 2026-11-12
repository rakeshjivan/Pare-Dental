import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeToothSet } from "@/lib/toothLibrary";
import { sculptMeshOf } from "@/lib/meshSculpt";
import { handleWeights, pullHandles, type Handle } from "@/lib/toothHandles";

/** Build 311: a tooth shaped by handles - tried on a tooth of the app's own library (the largest of the oval set). */
const set = decodeToothSet(readFileSync(resolve(__dirname, "../../apps/web/public/libraries/pare/oval-upper-front.ptl")));
const soup = set.reduce((a, b) => (b.length > a.length ? b : a));
const made = sculptMeshOf(soup);
const mesh = { points: made.points, triangles: made.triangles };
const n = mesh.points.length / 3;
const box = (() => { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < mesh.points.length; i += 1) { lo[i % 3] = Math.min(lo[i % 3], mesh.points[i]); hi[i % 3] = Math.max(hi[i % 3], mesh.points[i]); } return { lo, hi }; })();
const mid = (k: number) => (box.lo[k] + box.hi[k]) / 2;
/** The corner nearest a point of the tooth's box (shares of it along each axis). */
const cornerAt = (fx: number, fy: number, fz: number): [number, number, number] => {
  const want = [box.lo[0] + fx * (box.hi[0] - box.lo[0]), box.lo[1] + fy * (box.hi[1] - box.lo[1]), box.lo[2] + fz * (box.hi[2] - box.lo[2])];
  let best = 0, least = Infinity;
  for (let v = 0; v < n; v += 1) { const d = Math.hypot(mesh.points[v * 3] - want[0], mesh.points[v * 3 + 1] - want[1], mesh.points[v * 3 + 2] - want[2]); if (d < least) { least = d; best = v; } }
  return [mesh.points[best * 3], mesh.points[best * 3 + 1], mesh.points[best * 3 + 2]];
};
// Six handles round the tooth, as its dots are: both ends of each axis of its box.
const handles: Handle[] = [
  { id: "x0", at: cornerAt(0, 0.5, 0.5), reach: 1 }, { id: "x1", at: cornerAt(1, 0.5, 0.5), reach: 1 },
  { id: "y0", at: cornerAt(0.5, 0, 0.5), reach: 1 }, { id: "y1", at: cornerAt(0.5, 1, 0.5), reach: 1 },
  { id: "z0", at: cornerAt(0.5, 0.5, 0), reach: 1 }, { id: "z1", at: cornerAt(0.5, 0.5, 1), reach: 1 },
];

describe("a tooth shaped by handles (build 311)", () => {
  const t0 = performance.now();
  const found = handleWeights(mesh, handles);
  const took = performance.now() - t0;

  it("finds the weights of a library tooth's handles quickly enough to do when a tooth is picked", () => {
    console.log(`handles: ${n} corners, ${handles.length} handles, ${found.rounds} rounds, ${took.toFixed(0)} ms`);
    expect(n).toBeGreaterThan(500);
    expect(took).toBeLessThan(3000);
  });

  it("each handle is wholly its own and nothing of the others'; the weights are shares (0 to 1, together no more than 1 and a little)", () => {
    handles.forEach((handle, k) => {
      let own = 0;
      for (let v = 0; v < n; v += 1) {
        const d = Math.hypot(mesh.points[v * 3] - handle.at[0], mesh.points[v * 3 + 1] - handle.at[1], mesh.points[v * 3 + 2] - handle.at[2]);
        if (d < 0.5) { own += 1; expect(found.weights[k][v]).toBe(1); found.weights.forEach((w, j) => { if (j !== k) expect(w[v]).toBe(0); }); }
      }
      expect(own).toBeGreaterThan(0);
    });
    for (let v = 0; v < n; v += 1) {
      let sum = 0;
      for (const w of found.weights) { expect(w[v]).toBeGreaterThanOrEqual(0); expect(w[v]).toBeLessThanOrEqual(1); sum += w[v]; }
      expect(sum).toBeLessThan(1.25);
    }
  });

  it("pulling one handle moves it by the whole pull, leaves every other handle exactly where it was, and the tooth between follows smoothly", () => {
    const pulled = pullHandles(mesh.points, found, { x1: [1.5, 0, 0] });
    const moved = (v: number) => Math.hypot(pulled[v * 3] - mesh.points[v * 3], pulled[v * 3 + 1] - mesh.points[v * 3 + 1], pulled[v * 3 + 2] - mesh.points[v * 3 + 2]);
    let whole = 0, still = 0, between = 0;
    for (let v = 0; v < n; v += 1) {
      const w = found.weights[1][v];
      if (w === 1) { whole += 1; expect(moved(v)).toBeCloseTo(1.5, 9); }
      else if (found.weights.some((other, j) => j !== 1 && other[v] === 1)) { still += 1; expect(moved(v)).toBe(0); }
      else if (moved(v) > 0.05 && moved(v) < 1.45) between += 1;
    }
    expect(whole).toBeGreaterThan(0);
    expect(still).toBeGreaterThan(0);
    expect(between).toBeGreaterThan(n / 20);
    // Smooth: no edge of the tooth is stretched or squeezed by more than a fifth of the pull over a short edge.
    let worst = 0;
    for (let i = 0; i + 2 < mesh.triangles.length; i += 3) for (let k = 0; k < 3; k += 1) {
      const a = mesh.triangles[i + k], b = mesh.triangles[i + ((k + 1) % 3)];
      const was = Math.hypot(mesh.points[a * 3] - mesh.points[b * 3], mesh.points[a * 3 + 1] - mesh.points[b * 3 + 1], mesh.points[a * 3 + 2] - mesh.points[b * 3 + 2]);
      const now = Math.hypot(pulled[a * 3] - pulled[b * 3], pulled[a * 3 + 1] - pulled[b * 3 + 1], pulled[a * 3 + 2] - pulled[b * 3 + 2]);
      worst = Math.max(worst, Math.abs(now - was) / Math.max(0.2, was));
    }
    console.log(`handles: worst edge strain ${worst.toFixed(2)}`);
    expect(worst).toBeLessThan(0.6);
    void mid;
  });

  it("pulls add up, and are undone exactly", () => {
    const pulls = { x1: [1, 0, 0] as const, z1: [0, 0.3, 0.8] as const, y0: [0, -0.5, 0] as const };
    const pulled = pullHandles(mesh.points, found, pulls), back = pullHandles(pulled, found, pulls, true);
    let worst = 0;
    for (let i = 0; i < back.length; i += 1) worst = Math.max(worst, Math.abs(back[i] - mesh.points[i]));
    expect(worst).toBeLessThan(1e-9);
  });
});
