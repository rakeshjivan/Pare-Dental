import { describe, expect, it } from "vitest";
import { autoMarksInArchFrame } from "@/lib/waxAutoMarks";
import { archMarkProblems } from "@/lib/waxArchMarks";

/**
 * Build 330: Find for me put the canines' distal dots in towards their cusp tips (the canines squeezed). A made-up
 * arch in the arch frame (teeth up along z, front at -y) as in waxAutoMarks285, but with pointed canines whose
 * tips stand well above their shoulders.
 */
const RADIUS = 22;
const WIDTHS = [10, 7, 7, 7.8, 6.8, 8.6, 8.6, 6.8, 7.8, 7, 7, 10];
const TOTAL = WIDTHS.reduce((a, b) => a + b, 0);
const contactsAlong: number[] = [];
{ let s = -TOTAL / 2; contactsAlong.push(s); for (const w of WIDTHS) { s += w; contactsAlong.push(s); } }
const onArch = (s: number, r = RADIUS): [number, number] => [r * Math.sin(s / RADIUS), -r * Math.cos(s / RADIUS)];

function arch(cusp: number): Float32Array {
  const out: number[] = [];
  WIDTHS.forEach((width, index) => {
    const canine = index === 3 || index === 8;
    const mid = (contactsAlong[index] + contactsAlong[index + 1]) / 2, angle = mid / RADIUS;
    const [cx, cy] = onArch(mid);
    const tangent = [Math.cos(angle), Math.sin(angle)], normal = [Math.sin(angle), -Math.cos(angle)];
    const a = width / 2, b = 3.5, c = 5;
    for (let i = 0; i <= 60; i += 1) for (let j = 0; j < 90; j += 1) {
      const t = (i / 60) * Math.PI, f = (j / 90) * 2 * Math.PI;
      const u = a * Math.sin(t) * Math.cos(f), n = b * Math.sin(t) * Math.sin(f);
      let h = c * Math.cos(t);
      // The canine's cusp: the crown drawn up to a point over its middle.
      if (canine && h > 0) h += cusp * Math.max(0, 1 - Math.abs(u) / a) * (h / c);
      out.push(cx + tangent[0] * u + normal[0] * n, cy + tangent[1] * u + normal[1] * n, -5 + h);
    }
  });
  for (let r = 14; r <= 27; r += 0.5) for (let s = -TOTAL / 2; s <= TOTAL / 2; s += 0.5) { const [x, y] = onArch(s, r); out.push(x, y, -8); }
  return Float32Array.from(out);
}

describe("Find for me on pointed canines (build 330)", () => {
  for (const cusp of [2, 3]) {
    it(`finds each canine's contacts where it meets its neighbours, not in towards its tip (tip ${cusp} mm up)`, () => {
      const found = autoMarksInArchFrame(arch(cusp), true)!;
      expect(found).not.toBeNull();
      const expected = contactsAlong.slice(3, 10).reverse().map((s) => onArch(s));
      found.marks.slice(0, 7).forEach((mark, i) => {
        expect(Math.hypot(mark[0] - expected[i][0], mark[1] - expected[i][1])).toBeLessThan(1);
      });
      expect(archMarkProblems("upper", found.marks)).toEqual([]);
    });
  }
});

type V = [number, number, number];
/** Seven contacts straight across with the widths given (from the patient's right), then the canine tips 2 mm up. */
const marks = (widths: number[]): V[] => {
  const xs = [0];
  for (const w of widths) xs.push(xs[xs.length - 1] + w);
  const contacts = xs.map((x) => [x, 0, 0] as V);
  const tip = (a: V, b: V): V => [(a[0] + b[0]) / 2, 0, 2];
  return [...contacts, tip(contacts[0], contacts[1]), tip(contacts[5], contacts[6])];
};

describe("the warning box catches a squeezed canine (build 330)", () => {
  it("a canine's distal dot on its cusp tip is told, with that dot and the tip's", () => {
    const m = marks([8, 7, 8.5, 8.5, 7, 8]);
    m[0] = [m[7][0] - 0.5, 0, 1.6];
    const found = archMarkProblems("upper", m);
    expect(found.some((p) => p.kind === "tipAtContact" && p.fdi === 13 && p.dots[0] === 1 && p.dots[1] === 8)).toBe(true);
  });

  it("a canine marked narrower than its lateral is told", () => {
    const m = marks([5, 7, 8.5, 8.5, 7, 8]);
    m[7] = [2.5, 0, 2];
    const found = archMarkProblems("upper", m);
    expect(found).toContainEqual(expect.objectContaining({ kind: "canineNarrow", fdi: 13, lateral: 12, dots: [1, 2] }));
    expect(found.some((p) => p.kind === "canineNarrow" && p.fdi === 23)).toBe(false);
  });

  it("an ordinary set is left alone", () => {
    expect(archMarkProblems("upper", marks([8, 7, 8.5, 8.5, 7, 8]))).toEqual([]);
    expect(archMarkProblems("lower", marks([7, 5.9, 5.4, 5.4, 5.9, 7]))).toEqual([]);
  });
});
