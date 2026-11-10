import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { clampEdit, editTooth, NO_EDIT } from "@/lib/waxToothEdit";
import type { ToothFrame } from "@/lib/dentalWaxup";

/** Build 277: a tooth's own changes, one direction each. A synthetic box crown: 8 wide, 10 long, 6 thick. */
const W = 8, L = 10, T = 6;
const frame: ToothFrame = { origin: [0, 0, 0], mesial: [1, 0, 0], out: [0, 1, 0], up: [0, 0, 1] };
const box = (() => {
  const pts: number[] = [];
  for (let a = -W / 2; a <= W / 2 + 1e-9; a += 1) for (let b = -T; b <= 1e-9; b += 1) for (let h = -L; h <= 1e-9; h += 1) pts.push(a, b, h);
  return new Float32Array(pts);
})();
const extent = (soup: Float32Array, k: 0 | 1 | 2) => { let lo = Infinity, hi = -Infinity; for (let i = k; i < soup.length; i += 3) { lo = Math.min(lo, soup[i]); hi = Math.max(hi, soup[i]); } return [lo, hi]; };
/** Points at one height (h), within a hair. */
const at = (soup: Float32Array, rest: Float32Array, h: number) => { const out: number[] = []; for (let i = 0; i < rest.length; i += 3) if (Math.abs(rest[i + 2] - h) < 1e-6) out.push(i); return out.map((i) => [soup[i], soup[i + 1], soup[i + 2]]); };

describe("editTooth", () => {
  it("changes nothing with no edit", () => {
    expect(Array.from(editTooth(box, frame, W, L, NO_EDIT))).toEqual(Array.from(box));
  });

  it("lengthens from the edge only: the cervical stays, the width and thickness do not change", () => {
    const e = editTooth(box, frame, W, L, { ...NO_EDIT, length: 2 });
    expect(extent(e, 2)).toEqual([-L, 2]);
    expect(extent(e, 0)).toEqual([-W / 2, W / 2]);
    expect(extent(e, 1)).toEqual([-T, 0]);
    for (const [, , z] of at(e, box, -L)) expect(z).toBeCloseTo(-L, 6);
  });

  it("widens the mesial side only, the distal side held, the neck kept", () => {
    const e = editTooth(box, frame, W, L, { ...NO_EDIT, mesial: 1 });
    const edge = at(e, box, 0);
    expect(Math.max(...edge.map((p) => p[0]))).toBeCloseTo(W / 2 + 1, 6);
    expect(Math.min(...edge.map((p) => p[0]))).toBeCloseTo(-W / 2, 6);
    // At the cervical: unchanged.
    const neck = at(e, box, -L);
    expect(Math.max(...neck.map((p) => p[0]))).toBeCloseTo(W / 2, 6);
    // No longer or thicker.
    expect(extent(e, 2)).toEqual([-L, 0]);
    expect(extent(e, 1)).toEqual([-T, 0]);
  });

  it("thickens the labial face only, the palatal held", () => {
    const e = editTooth(box, frame, W, L, { ...NO_EDIT, thickness: 0.8 });
    const edge = at(e, box, 0);
    expect(Math.max(...edge.map((p) => p[1]))).toBeCloseTo(0.8, 6);
    expect(Math.min(...edge.map((p) => p[1]))).toBeCloseTo(-T, 6);
    expect(extent(e, 0)).toEqual([-W / 2, W / 2]);
  });

  it("turns the same way on mirrored left and right teeth (rotation, tip, torque)", () => {
    const right: ToothFrame = { origin: [-4, 0, 0], mesial: [1, 0, 0], out: [0, 1, 0], up: [0, 0, 1] };
    const left: ToothFrame = { origin: [4, 0, 0], mesial: [-1, 0, 0], out: [0, 1, 0], up: [0, 0, 1] };
    const mirror = (s: Float32Array) => { const o = s.slice(); for (let i = 0; i < o.length; i += 3) o[i] = -o[i]; return o; };
    const r = box.slice(); for (let i = 0; i < r.length; i += 3) r[i] -= 4;
    const l = mirror(r);
    const edit = { ...NO_EDIT, rotate: 10, tip: 5, torque: -4, moveMesial: 0.5, moveOut: 0.3 };
    const er = editTooth(r, right, W, L, edit), el = editTooth(l, left, W, L, edit);
    const back = mirror(el);
    for (let i = 0; i < er.length; i += 1) expect(back[i]).toBeCloseTo(er[i], 4);
    // Tip +: the incisal edge moves mesially (towards +x on the right tooth).
    const tipped = editTooth(r, right, W, L, { ...NO_EDIT, tip: 8 });
    const mid = (s: Float32Array) => at(s, box, 0).reduce((sum, p) => sum + p[0], 0) / at(s, box, 0).length;
    expect(mid(tipped)).toBeGreaterThan(mid(r) + 0.5);
    // Torque +: the incisal edge moves labially (+y).
    const torqued = editTooth(r, right, W, L, { ...NO_EDIT, torque: 8 });
    expect(Math.max(...at(torqued, box, 0).map((p) => p[1]))).toBeGreaterThan(0.5);
  });

  it("keeps edits in range", () => {
    expect(clampEdit({ length: 9, rotate: -90 }).length).toBe(3);
    expect(clampEdit({ length: 9, rotate: -90 }).rotate).toBe(-25);
  });

  it("is smooth: neighbouring corners stay neighbours (no tearing)", () => {
    const e = editTooth(box, frame, W, L, { ...NO_EDIT, mesial: 1.5, distal: -1, thickness: 1, length: 3, rotate: 20, tip: -10, torque: 10 });
    const v = new THREE.Vector3();
    for (let i = 0; i + 5 < box.length; i += 3) {
      const before = v.set(box[i + 3] - box[i], box[i + 4] - box[i + 1], box[i + 5] - box[i + 2]).length();
      if (before > 1.01) continue;
      const after = Math.hypot(e[i + 3] - e[i], e[i + 4] - e[i + 1], e[i + 5] - e[i + 2]);
      expect(after).toBeLessThan(before * 1.6);
    }
  });
});
