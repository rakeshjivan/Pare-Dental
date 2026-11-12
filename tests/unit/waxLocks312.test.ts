import { describe, expect, it } from "vitest";
import { dotPoint, editTooth, NO_EDIT, TOOTH_DOTS, uneditTooth, withLocks, type ToothEdit } from "@/lib/waxToothEdit";
import type { ToothFrame } from "@/lib/dentalWaxup";

/**
 * Build 312 (Rakesh: "often you need to widen or flare the incisal whilst leaving the middle and neck narrow or a
 * combination"): a locked dot's spot of the tooth stays where it was locked and the tooth gives round it. A box
 * crown: 8 wide, 10 long, 6 thick.
 */
const W = 8, L = 10, T = 6;
const frame: ToothFrame = { origin: [0, 0, 0], mesial: [1, 0, 0], out: [0, 1, 0], up: [0, 0, 1] };
const box = (() => {
  const pts: number[] = [];
  for (let a = -W / 2; a <= W / 2 + 1e-9; a += 0.5) for (let b = -T; b <= 1e-9; b += 0.5) for (let h = -L; h <= 1e-9; h += 0.5) pts.push(a, b, h);
  return new Float32Array(pts);
})();
const spot = (key: keyof typeof TOOTH_DOTS) => dotPoint(TOOTH_DOTS[key], W, L, -T);
/** Where one point of the tooth at rest goes under an edit. */
const goes = (p: number[], edit: ToothEdit) => Array.from(editTooth(new Float32Array(p), frame, W, L, edit, -T));
const far = (a: ArrayLike<number>, b: ArrayLike<number>) => { let most = 0; for (let i = 0; i < a.length; i += 1) most = Math.max(most, Math.abs(a[i] - b[i])); return most; };
const lock = (edit: ToothEdit, before: ToothEdit, keys: Array<keyof typeof TOOTH_DOTS>) => withLocks(edit, before, keys.map((key) => TOOTH_DOTS[key]), W, L, -T);

describe("locked dots hold their spot of the tooth (build 312)", () => {
  it("the mesial contact locked, the mesial corner flared: the contact stays, the corner goes, the neck stays - a tooth wide at the edge and narrow at the middle", () => {
    const flared = lock({ ...NO_EDIT, flareM: 1.5 }, NO_EDIT, ["mesial"]);
    expect(far(goes(spot("mesial"), flared), spot("mesial"))).toBeLessThan(1e-6);
    // Without the lock the contact is carried out by the flare.
    expect(goes(spot("mesial"), { ...NO_EDIT, flareM: 1.5 })[0] - spot("mesial")[0]).toBeGreaterThan(0.7);
    expect(goes(spot("flareM"), flared)[0] - spot("flareM")[0]).toBeGreaterThan(1.2);
    expect(far(goes(spot("neck"), flared), spot("neck"))).toBeLessThan(0.05);
    // The other side of the tooth is left alone.
    expect(far(goes(spot("distal"), flared), spot("distal"))).toBeLessThan(1e-6);
    expect(far(goes(spot("flareD"), flared), spot("flareD"))).toBeLessThan(1e-6);
  });

  it("a dot is held where it stood when it was locked, not where it stands on the library tooth", () => {
    const wide: ToothEdit = { ...NO_EDIT, mesial: 1 };
    const was = goes(spot("mesial"), wide);
    const longer = lock({ ...wide, length: 2, flareM: 1 }, wide, ["mesial"]);
    expect(far(goes(spot("mesial"), longer), was)).toBeLessThan(1e-6);
  });

  it("with nothing locked the tooth is exactly as it was before this build", () => {
    const edit: ToothEdit = { ...NO_EDIT, flareM: 1, length: 1.5, palatalD: 0.5 };
    expect(lock(edit, NO_EDIT, [])).toBe(edit);
  });

  it("letting a dot go changes nothing: what its lock made of the tooth is kept", () => {
    const flared = lock({ ...NO_EDIT, flareM: 1.5 }, NO_EDIT, ["mesial"]);
    const free = lock(flared, flared, []);
    expect(free.held).toBeUndefined();
    expect(free.kept?.length).toBe(1);
    expect(far(editTooth(box, frame, W, L, free, -T), editTooth(box, frame, W, L, flared, -T))).toBeLessThan(1e-5);
    // And locking it again changes nothing either.
    const again = lock(free, free, ["mesial"]);
    expect(again.kept).toBeUndefined();
    expect(far(editTooth(box, frame, W, L, again, -T), editTooth(box, frame, W, L, flared, -T))).toBeLessThan(1e-4);
  });

  it("the tooth gives smoothly: no neighbouring points of it are torn apart", () => {
    const flared = lock({ ...NO_EDIT, flareM: 1.5 }, NO_EDIT, ["mesial"]);
    const e = editTooth(box, frame, W, L, flared, -T);
    let worst = 0;
    // Points half a millimetre apart along the tooth stay within a millimetre of each other.
    for (let i = 0; i + 5 < box.length; i += 3) if (box[i] === box[i + 3] && box[i + 1] === box[i + 4]) worst = Math.max(worst, Math.hypot(e[i] - e[i + 3], e[i + 1] - e[i + 4], e[i + 2] - e[i + 5]));
    expect(worst).toBeLessThan(1);
  });

  it("a tooth with a locked dot is read back from what it has become (the brushes rely on it)", () => {
    const flared = lock({ ...NO_EDIT, flareM: 1.2, length: 1, rotate: 8 }, NO_EDIT, ["mesial", "labialD"]);
    const made = editTooth(box, frame, W, L, flared, -T);
    const back = uneditTooth(made, frame, W, L, flared, -T);
    expect(far(back, box)).toBeLessThan(5e-3);
  });

  it("is quick enough to follow the mouse: a tooth of 20,000 corners in well under a frame or two", () => {
    const flared = lock({ ...NO_EDIT, flareM: 1.5 }, NO_EDIT, ["mesial", "distal"]);
    const big = new Float32Array(60000);
    for (let i = 0; i < big.length; i += 1) big[i] = box[i % box.length];
    const t0 = performance.now();
    editTooth(big, frame, W, L, flared, -T);
    expect(performance.now() - t0).toBeLessThan(60);
  });
});
