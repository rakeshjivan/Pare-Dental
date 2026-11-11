import { describe, expect, it } from "vitest";
import { easeTrim } from "@/lib/waxOcclusion";

/** Build 304: a trim against the opposing teeth evened out - smoother, and never less than the bite needs. */
describe("easeTrim", () => {
  // A flat plate of corners 0.2 mm apart facing down (z = 0), trimmed upwards (dir +1).
  const N = 41;
  const pts = new Float32Array(N * N * 3);
  for (let i = 0; i < N; i += 1) for (let j = 0; j < N; j += 1) { const k = (i * N + j) * 3; pts[k] = i * 0.2; pts[k + 1] = j * 0.2; pts[k + 2] = 0; }
  const at = (i: number, j: number) => i * N + j;
  // Two pits side by side with a ridge left between them, as two cusps leave.
  const need = new Float32Array(N * N);
  for (let i = 0; i < N; i += 1) for (let j = 0; j < N; j += 1) {
    const a = Math.hypot(i - 17, j - 20) * 0.2, b = Math.hypot(i - 23, j - 20) * 0.2;
    need[at(i, j)] = Math.max(0, 0.5 - a * 0.9, 0.5 - b * 0.9);
  }
  const eased = easeTrim(pts, need);
  // The sharpest crease standing towards the opposing teeth (a rim, or a ridge between pits): how far a corner is left proud of the two beside it.
  const roughness = (d: Float32Array) => { let worst = 0; for (let i = 1; i < N - 1; i += 1) for (let j = 1; j < N - 1; j += 1) { const bend = d[at(i - 1, j)] + d[at(i + 1, j)] - 2 * d[at(i, j)]; worst = Math.max(worst, bend); } return worst; };

  it("never takes a corner back less than the bite needs", () => {
    for (let k = 0; k < need.length; k += 1) expect(eased[k]).toBeGreaterThanOrEqual(need[k] - 1e-6);
  });
  it("takes the ridge between two pits down and rounds the rim (less sharply bent than before)", () => {
    expect(eased[at(20, 20)]).toBeGreaterThan(need[at(20, 20)] + 0.03);
    expect(roughness(eased)).toBeLessThan(roughness(need) * 0.75);
  });
  it("goes no deeper than the deepest trim, and leaves the wax away from the trim alone", () => {
    let deepest = 0; for (const v of eased) deepest = Math.max(deepest, v);
    expect(deepest).toBeLessThanOrEqual(0.5 + 1e-6);
    expect(eased[at(2, 2)]).toBe(0);
    expect(eased[at(38, 20)]).toBe(0);
  });
  it("does not walk a trim up an upright wall: a deep trim at the foot of a wall stays at the foot", () => {
    // A wall of corners 0.2 mm apart standing along z (as a tooth's labial face does), its lowest 1 mm trimmed by 4 mm.
    const wall = new Float32Array(N * N * 3);
    for (let i = 0; i < N; i += 1) for (let j = 0; j < N; j += 1) { const k = (i * N + j) * 3; wall[k] = i * 0.2; wall[k + 1] = 0; wall[k + 2] = j * 0.2; }
    const deep = new Float32Array(N * N);
    for (let i = 0; i < N; i += 1) for (let j = 0; j < 5; j += 1) deep[at(i, j)] = 4;
    const out = easeTrim(wall, deep);
    // No corner gains more than EASE_MOST, and 3 mm up the wall nothing has moved.
    for (let k = 0; k < deep.length; k += 1) expect(out[k]).toBeLessThanOrEqual(deep[k] + 0.4 + 1e-6);
    for (let i = 0; i < N; i += 1) expect(out[at(i, 20)]).toBe(0);
  });
  it("leaves a tooth with no trim as it is", () => {
    expect(Array.from(easeTrim(pts, new Float32Array(N * N))).every((v) => v === 0)).toBe(true);
  });
});
