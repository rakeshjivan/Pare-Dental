import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { fitArchLine, layOnArchLine, type ArchTooth } from "../../apps/web/src/lib/waxArchLine";

type V = [number, number, number];
// A scene with y up (incisal edges pointing down, as an upper arch) and z forward; x to the patient's left.
const WIDTHS: Record<number, number> = { 1: 8.6, 2: 6.6, 3: 7.6 };
function archPoints(k: number, jitter = 0): Record<number, V> {
  const out: Record<number, V> = {};
  for (const side of [1, -1]) {
    let x = 0;
    for (const n of [1, 2, 3]) {
      const fdi = (side === 1 ? 20 : 10) + n;
      const w = WIDTHS[n];
      const xc = x + side * w * 0.48;
      out[fdi] = [xc, 10 + (n === 2 ? jitter : 0), -k * xc * xc];
      x += side * w * 0.95;
    }
  }
  return out;
}
function teethAt(points: Record<number, V>, turn = 0.4): ArchTooth[] {
  return Object.entries(points).map(([fdi, p]) => {
    const f = Number(fdi), side = Math.floor(f / 10) === 2 ? 1 : -1;
    // Mesial towards the midline, a bit off; out forward (+z); up towards the edge (-y).
    const mesial = new THREE.Vector3(-side, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn * side).normalize();
    return { id: `t${f}`, fdi: f, width: WIDTHS[f % 10], origin: [p[0] + 1, p[1], p[2] + 2], mesial: mesial.toArray() as V, out: [0, 0, 1], up: [0, -1, 0] };
  });
}

describe("build 106: the arch line", () => {
  it("fits the curve through the incisal marks, symmetric about the midline", () => {
    const line = fitArchLine(archPoints(0.04), [0, -1, 0], [0, 0, 1])!;
    expect(line).not.toBeNull();
    expect(line.k).toBeCloseTo(0.04, 2);
    expect(Math.abs(line.across[0])).toBeCloseTo(1, 5);
    expect(line.forward[2]).toBeGreaterThan(0.99);
  });

  it("lays the teeth along it touching, each moved and turned but never stretched", () => {
    const points = archPoints(0.05, 0.8);
    const teeth = teethAt(points);
    const line = fitArchLine(points, [0, -1, 0], [0, 0, 1])!;
    const moves = layOnArchLine(teeth, line);
    expect(moves.size).toBe(6);
    const placed = new Map<number, { origin: THREE.Vector3; mesial: THREE.Vector3 }>();
    for (const tooth of teeth) {
      const m = moves.get(tooth.id)!;
      // Rigid: no scale.
      const s = new THREE.Vector3(); m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
      expect(s.x).toBeCloseTo(1, 6); expect(s.y).toBeCloseTo(1, 6); expect(s.z).toBeCloseTo(1, 6);
      // Height kept.
      const o = new THREE.Vector3(...tooth.origin).applyMatrix4(m);
      expect(o.y).toBeCloseTo(tooth.origin[1], 6);
      placed.set(tooth.fdi, { origin: o, mesial: new THREE.Vector3(...tooth.mesial).transformDirection(m) });
    }
    // Symmetric about the midline.
    expect(placed.get(11)!.origin.x).toBeCloseTo(-placed.get(21)!.origin.x, 5);
    expect(placed.get(13)!.origin.z).toBeCloseTo(placed.get(23)!.origin.z, 5);
    // The canines turn more than the centrals: a curved arch.
    const angle = (fdi: number) => Math.abs(Math.atan2(placed.get(fdi)!.mesial.z, Math.abs(placed.get(fdi)!.mesial.x)));
    expect(angle(13)).toBeGreaterThan(angle(12));
    expect(angle(12)).toBeGreaterThan(angle(11));
    // Each tooth's mesial contact on its neighbour's distal one (incisal middles about half a width apart each).
    const gap = placed.get(21)!.origin.distanceTo(placed.get(22)!.origin);
    expect(gap).toBeGreaterThan((8.6 + 6.6) / 2 - 0.6);
    expect(gap).toBeLessThan((8.6 + 6.6) / 2 + 0.2);
  });

  it("turns the teeth more on a narrower curve, less on a broader one", () => {
    const points = archPoints(0.05);
    const teeth = teethAt(points);
    const line = fitArchLine(points, [0, -1, 0], [0, 0, 1])!;
    const canineTurn = (curve: number) => {
      const t = teeth.find((tooth) => tooth.fdi === 23)!;
      const m = layOnArchLine(teeth, line, { curve }).get(t.id)!;
      const d = new THREE.Vector3(...t.mesial).transformDirection(m);
      return Math.abs(Math.atan2(d.z, Math.abs(d.x)));
    };
    expect(canineTurn(1.4)).toBeGreaterThan(canineTurn(1));
    expect(canineTurn(1)).toBeGreaterThan(canineTurn(0.6));
  });
});

describe("build 106: the arch line follows the marks, or smooths them", () => {
  it("follows a canine set out of line, where the smooth curve evens it out", () => {
    const points = archPoints(0.05);
    // The patient's right canine 2 mm forward of the curve.
    points[13] = [points[13][0], points[13][1], points[13][2] + 2];
    const teeth = teethAt(points);
    const line = fitArchLine(points, [0, -1, 0], [0, 0, 1])!;
    const forwardOf = (follow: boolean, fdi: number) => {
      const m = layOnArchLine(teeth, line, { follow, keepDepth: false });
      // Forward as the arch line takes it (its frame turns a little with the canine moved).
      return new THREE.Vector3(...teeth.find((t) => t.fdi === fdi)!.origin).applyMatrix4(m.get(`t${fdi}`)!).dot(new THREE.Vector3(...line.forward));
    };
    // Followed, the two sides differ as the marks do; smoothed, they are a mirror of each other.
    expect(Math.abs(forwardOf(true, 13) - forwardOf(true, 23))).toBeGreaterThan(0.3);
    expect(Math.abs(forwardOf(false, 13) - forwardOf(false, 23))).toBeLessThan(1e-6);
  });

  it("runs straight on past the last mark, not curving in", () => {
    const points = archPoints(0.05);
    const line = fitArchLine(points, [0, -1, 0], [0, 0, 1])!;
    // A premolar beyond the canine, with no mark of its own.
    const teeth = [...teethAt(points), { id: "t24", fdi: 24, width: 7, origin: [24, 10, -20] as V, mesial: [-1, 0, 0] as V, out: [0, 0, 1] as V, up: [0, -1, 0] as V }];
    const at = (follow: boolean) => new THREE.Vector3(24, 10, -20).applyMatrix4(layOnArchLine(teeth, line, { follow, keepDepth: false }).get("t24")!);
    // Straight on (follow) keeps the premolar further out across the arch than the parabola, which turns it in behind.
    expect(Math.abs(at(true).x)).toBeGreaterThan(Math.abs(at(false).x) - 0.5);
  });
});
