import { describe, expect, it } from "vitest";
import { editTooth, NO_EDIT, uneditTooth, type ToothEdit } from "@/lib/waxToothEdit";
import type { ToothFrame } from "@/lib/dentalWaxup";

/**
 * Build 325 (Rakesh: dots near the cervical, mesial and distal, "to help with curving a tooth to create the papillary
 * space - otherwise the teeth can look like straight tombstones"): one side of the cervical third tucked in (or
 * filled), the contact and the incisal edge left where they are. A box crown: 8 wide, 10 long, 6 thick.
 */
const W = 8, L = 10, T = 6;
const frame: ToothFrame = { origin: [0, 0, 0], mesial: [1, 0, 0], out: [0, 1, 0], up: [0, 0, 1] };
const goes = (p: number[], edit: ToothEdit) => Array.from(editTooth(new Float32Array(p), frame, W, L, edit, -T));
const tucked: ToothEdit = { ...NO_EDIT, cervM: -1 };

describe("the cervical side dots", () => {
  it("tucks the mesial side in by the whole amount low on the crown", () => {
    // 1 mm above the neck (a tenth of the crown), on the mesial side.
    const [a, b, h] = goes([W / 2, -3, -9], tucked);
    expect(a).toBeCloseTo(W / 2 - 1, 5);
    expect(b).toBeCloseTo(-3, 5);
    expect(h).toBeCloseTo(-9, 5);
  });
  it("leaves the contact and the incisal edge where they are", () => {
    // The contact (40% down from the edge) and everything incisal to it.
    for (const h of [-4, -2, 0]) expect(goes([W / 2, -3, h], tucked)[0]).toBeCloseTo(W / 2, 5);
  });
  it("curves in between: more the nearer the neck", () => {
    const at = (h: number) => W / 2 - goes([W / 2, -3, h], tucked)[0];
    expect(at(-8)).toBeGreaterThan(at(-7));
    expect(at(-7)).toBeGreaterThan(at(-5.5));
    expect(at(-5.5)).toBeGreaterThan(0);
    expect(at(-8)).toBeLessThan(1);
  });
  it("leaves the other side and the middle of the tooth alone", () => {
    expect(goes([-W / 2, -3, -9], tucked)[0]).toBeCloseTo(-W / 2, 5);
    expect(goes([0, -3, -9], tucked)[0]).toBeCloseTo(0, 5);
  });
  it("the distal dot does the same on its side, and plus fills", () => {
    expect(goes([-W / 2, -3, -9], { ...NO_EDIT, cervD: -1 })[0]).toBeCloseTo(-W / 2 + 1, 5);
    expect(goes([W / 2, -3, -9], { ...NO_EDIT, cervM: 0.5 })[0]).toBeCloseTo(W / 2 + 0.5, 5);
  });
  it("can be undone point for point", () => {
    const pts = new Float32Array([W / 2, -3, -9, 2.5, -1, -7, -W / 2, -5, -8.5, 1, -2, -3]);
    const edit = { ...NO_EDIT, cervM: -1.2, cervD: -0.8 };
    const back = uneditTooth(editTooth(pts, frame, W, L, edit, -T), frame, W, L, edit, -T);
    for (let i = 0; i < pts.length; i += 1) expect(back[i]).toBeCloseTo(pts[i], 3);
  });
});
