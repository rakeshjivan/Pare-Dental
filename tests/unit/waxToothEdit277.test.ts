import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { clampEdit, editTooth, NO_EDIT, uneditTooth } from "@/lib/waxToothEdit";
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
    expect(clampEdit({ length: 9, rotate: -90 }).length).toBe(4);
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

describe("editTooth spread (build 284)", () => {
  it("moves the distal side out like width does, the mesial side held", () => {
    const e = editTooth(box, frame, W, L, { ...NO_EDIT, spread: 1 });
    const edge = at(e, box, 0);
    expect(Math.min(...edge.map((p) => p[0]))).toBeCloseTo(-W / 2 - 1, 6);
    expect(Math.max(...edge.map((p) => p[0]))).toBeCloseTo(W / 2, 6);
  });

  it("palatal fullness moves the palatal surface palatally and leaves the labial face where it is (build 293)", () => {
    // A box of a tooth: labial face at y 0, palatal at y -6, edge at z 0, neck at z -10.
    const frame = { origin: [0, 0, 0] as [number, number, number], mesial: [1, 0, 0] as [number, number, number], out: [0, 1, 0] as [number, number, number], up: [0, 0, 1] as [number, number, number] };
    const rest = [0, 0, -2, 0, -3, -2, 0, -6, -2, 0, -6, -9.5, 0, 0, -9.5];
    const out = editTooth(rest, frame, 8, 10, { ...NO_EDIT, palatal: 2 });
    expect(out[1]).toBeCloseTo(0, 6);
    expect(out[4]).toBeCloseTo(-4, 6);
    expect(out[7]).toBeCloseTo(-8, 6);
    // To the neck too, where the tooth has to reach the palatal gum; the labial neck stays.
    expect(out[10]).toBeCloseTo(-8, 6);
    expect(out[13]).toBeCloseTo(0, 6);
    for (const k of [0, 2, 3, 5, 6, 8]) expect(out[k]).toBeCloseTo(rest[k], 6);
  });
});

/** Build 301: a tooth reshaped by the brushes stays in the set - its rest shape read back from what it has become. */
describe("uneditTooth", () => {
  const worst = (a: ArrayLike<number>, b: ArrayLike<number>) => { let w = 0; for (let i = 0; i < a.length; i += 1) w = Math.max(w, Math.abs(a[i] - b[i])); return w; };
  const cases: Array<[string, Partial<typeof NO_EDIT>]> = [
    ["moves and turns alone", { moveMesial: 1.5, moveOut: -1, moveUp: 2, rotate: 20, tip: -15, torque: 12 }],
    ["a tooth lengthened, widened and thickened", { length: 3, mesial: 1.5, distal: -1, thickness: 1, palatal: 2 }],
    ["every change at once, some at the end of their range", { length: 4, mesial: 2.5, distal: 2.5, spread: 3, thickness: 1.5, palatal: 3, moveMesial: -3, moveOut: 2, moveUp: -3, rotate: -25, tip: 15, torque: -15 }],
    ["a tooth shortened and narrowed as far as offered", { length: -3, mesial: -2.5, distal: -2.5, thickness: -1, palatal: -1 }],
  ];
  for (const [name, change] of cases) {
    it(`gives back the rest tooth: ${name}`, () => {
      const edit = { ...NO_EDIT, ...change };
      const made = editTooth(box, frame, W, L, edit, -T);
      const rest = uneditTooth(made, frame, W, L, edit, -T);
      // Edited again it is the made tooth (what the set needs of it), and it is the rest tooth to well within a hundredth.
      expect(worst(editTooth(rest, frame, W, L, edit, -T), made)).toBeLessThan(2e-3);
      expect(worst(rest, box)).toBeLessThan(1e-2);
    });
  }

  it("keeps a brush's change: the made tooth dented, the rest tooth is dented the same and edits to the dented tooth", () => {
    const edit = { ...NO_EDIT, length: 2, mesial: 1, torque: 8, moveOut: 0.5 };
    const made = editTooth(box, frame, W, L, edit, -T);
    const dented = Float32Array.from(made);
    for (let i = 0; i < dented.length; i += 3) if (Math.abs(box[i]) < 1.1 && Math.abs(box[i + 2] + 5) < 1.1 && box[i + 1] === 0) dented[i + 1] -= 0.4;
    const rest = uneditTooth(dented, frame, W, L, edit, -T);
    expect(worst(editTooth(rest, frame, W, L, edit, -T), dented)).toBeLessThan(2e-3);
    expect(worst(rest, box)).toBeGreaterThan(0.2);
  });
});
