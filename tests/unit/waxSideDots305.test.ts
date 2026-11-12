import { describe, expect, it } from "vitest";
import { editTooth, NO_EDIT, uneditTooth } from "@/lib/waxToothEdit";
import type { ToothFrame } from "@/lib/dentalWaxup";

/** Build 305: the four side dots - one side of the palatal or of the labial face, nothing else. A box crown: 8 wide, 10 long, 6 thick. */
const W = 8, L = 10, T = 6;
const frame: ToothFrame = { origin: [0, 0, 0], mesial: [1, 0, 0], out: [0, 1, 0], up: [0, 0, 1] };
const box = (() => {
  const pts: number[] = [];
  for (let a = -W / 2; a <= W / 2 + 1e-9; a += 0.5) for (let b = -T; b <= 1e-9; b += 0.5) for (let h = -L; h <= 1e-9; h += 0.5) pts.push(a, b, h);
  return new Float32Array(pts);
})();
const moved = (e: Float32Array, pick: (a: number, b: number, h: number) => boolean) => {
  let most = 0;
  for (let i = 0; i < box.length; i += 3) if (pick(box[i], box[i + 1], box[i + 2])) most = Math.max(most, Math.hypot(e[i] - box[i], e[i + 1] - box[i + 1], e[i + 2] - box[i + 2]));
  return most;
};

describe("side dots (build 305)", () => {
  it("palatal mesial: that side of the palatal goes out by the whole amount; the middle, the distal side and the labial face stay", () => {
    const e = editTooth(box, frame, W, L, { ...NO_EDIT, palatalM: 1 }, -T);
    expect(moved(e, (a, b) => a >= 0.6 * W / 2 && b === -T)).toBeCloseTo(1, 5);
    expect(moved(e, (a) => a <= 0)).toBe(0);
    expect(moved(e, (_a, b) => b === 0)).toBe(0);
    // Only palatally (-out).
    for (let i = 0; i < box.length; i += 3) { expect(e[i]).toBe(box[i]); expect(e[i + 2]).toBe(box[i + 2]); expect(e[i + 1]).toBeLessThanOrEqual(box[i + 1]); }
  });

  it("palatal distal mirrors it on the other side", () => {
    const e = editTooth(box, frame, W, L, { ...NO_EDIT, palatalD: 1 }, -T);
    expect(moved(e, (a, b) => a <= -0.6 * W / 2 && b === -T)).toBeCloseTo(1, 5);
    expect(moved(e, (a) => a >= 0)).toBe(0);
  });

  it("labial mesial: that side of the labial face goes out; the palatal, the middle, the neck and the incisal edge stay", () => {
    const e = editTooth(box, frame, W, L, { ...NO_EDIT, labialM: 1 }, -T);
    expect(moved(e, (a, b, h) => a >= 0.6 * W / 2 && b === 0 && h === -5)).toBeCloseTo(1, 5);
    expect(moved(e, (a) => a <= 0)).toBe(0);
    expect(moved(e, (_a, b) => b === -T)).toBe(0);
    expect(moved(e, (_a, _b, h) => h === -L || h === 0)).toBe(0);
  });

  it("is smooth: neighbouring corners stay neighbours", () => {
    const e = editTooth(box, frame, W, L, { ...NO_EDIT, palatalM: 2, labialD: 2 }, -T);
    // Corners half a millimetre apart along the width end no further apart than twice that and a bit.
    const n = Math.round(T / 0.5) + 1, k = Math.round(L / 0.5) + 1, step = n * k * 3;
    for (let i = 0; i + step < box.length; i += 3) expect(Math.hypot(e[i + step] - e[i], e[i + step + 1] - e[i + 1], e[i + step + 2] - e[i + 2])).toBeLessThan(1.2);
  });

  it("is undone by uneditTooth", () => {
    const edit = { ...NO_EDIT, palatalM: 1.2, palatalD: -0.6, labialM: 0.8, labialD: 0.5, rotate: 6 };
    const made = editTooth(box, frame, W, L, edit, -T);
    const rest = uneditTooth(made, frame, W, L, edit, -T);
    let worst = 0;
    for (let i = 0; i < box.length; i += 1) worst = Math.max(worst, Math.abs(rest[i] - box[i]));
    expect(worst).toBeLessThan(5e-3);
  });

  it("build 311: an incisal corner flared - that side goes out along the arch, most at the edge and nothing at the neck, in a straight run (no hollow in the middle)", () => {
    const e = editTooth(box, frame, W, L, { ...NO_EDIT, flareM: 1 }, -T);
    const outAt = (h: number) => moved(e, (a, _b, hh) => a === W / 2 && hh === h);
    // The mesial face: the whole millimetre at the edge, nothing at the neck, along the arch only.
    expect(outAt(0)).toBeCloseTo(1, 5);
    expect(outAt(-L)).toBe(0);
    for (let i = 0; i < box.length; i += 3) { expect(e[i + 1]).toBe(box[i + 1]); expect(e[i + 2]).toBe(box[i + 2]); expect(e[i]).toBeGreaterThanOrEqual(box[i]); }
    // A straight run: half way up it is out by about half, and nowhere does the side fall behind the straight line from
    // neck to corner by more than 0.15 mm (a hollow).
    expect(outAt(-0.5 * L)).toBeGreaterThan(0.38);
    expect(outAt(-0.5 * L)).toBeLessThan(0.55);
    for (let h = -L; h <= 0; h += 0.5) expect(outAt(h)).toBeGreaterThan((h + L) / L - 0.15);
    // The distal side and the middle of the tooth: as they were.
    expect(moved(e, (a) => a <= 0)).toBe(0);
    // And undone by uneditTooth, tucked in on the other side as well.
    const edit = { ...NO_EDIT, flareM: 1.5, flareD: -0.8, mesial: 0.5 };
    const rest = uneditTooth(editTooth(box, frame, W, L, edit, -T), frame, W, L, edit, -T);
    let worst = 0;
    for (let i = 0; i < box.length; i += 1) worst = Math.max(worst, Math.abs(rest[i] - box[i]));
    expect(worst).toBeLessThan(5e-3);
  });
});
