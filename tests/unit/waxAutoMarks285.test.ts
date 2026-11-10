import { describe, expect, it } from "vitest";
import { AUTO_MARKS_MIN, autoMarksInArchFrame } from "@/lib/waxAutoMarks";

/**
 * Build 285: the nine marks found on the scan. A made-up arch in the arch frame (teeth up along z, front at -y):
 * rounded crowns side by side on a circle of radius 22, touching at known contacts, over a flat band of gum.
 */
const RADIUS = 22;
const WIDTHS = [10, 7, 7, 7.8, 6.8, 8.6, 8.6, 6.8, 7.8, 7, 7, 10];
const TOTAL = WIDTHS.reduce((a, b) => a + b, 0);
/** Where each contact is along the arch (mm from the midline, + towards +x), and on the circle. */
const contactsAlong: number[] = [];
{ let s = -TOTAL / 2; contactsAlong.push(s); for (const w of WIDTHS) { s += w; contactsAlong.push(s); } }
const onArch = (s: number, r = RADIUS): [number, number] => [r * Math.sin(s / RADIUS), -r * Math.cos(s / RADIUS)];

function arch(tall: (index: number) => number): Float32Array {
  const out: number[] = [];
  WIDTHS.forEach((width, index) => {
    const mid = (contactsAlong[index] + contactsAlong[index + 1]) / 2, angle = mid / RADIUS;
    const [cx, cy] = onArch(mid);
    const tangent = [Math.cos(angle), Math.sin(angle)], normal = [Math.sin(angle), -Math.cos(angle)];
    const a = width / 2, b = 3.5, c = 5 + tall(index);
    for (let i = 0; i <= 60; i += 1) for (let j = 0; j < 90; j += 1) {
      const t = (i / 60) * Math.PI, f = (j / 90) * 2 * Math.PI;
      const u = a * Math.sin(t) * Math.cos(f), n = b * Math.sin(t) * Math.sin(f), h = c * Math.cos(t);
      out.push(cx + tangent[0] * u + normal[0] * n, cy + tangent[1] * u + normal[1] * n, -5 + h);
    }
  });
  // The gum: a flat band under the crowns.
  for (let r = 14; r <= 27; r += 0.5) for (let s = -TOTAL / 2; s <= TOTAL / 2; s += 0.5) { const [x, y] = onArch(s, r); out.push(x, y, -8); }
  return Float32Array.from(out);
}

describe("autoMarksInArchFrame", () => {
  // The canines stand a little taller than their neighbours (3 and 8 of the twelve).
  const scan = arch((index) => (index === 3 || index === 8 ? 0.8 : 0));
  const found = autoMarksInArchFrame(scan, true)!;

  it("finds the seven contacts of the six front teeth, from the patient's right", () => {
    expect(found).not.toBeNull();
    expect(found.score).toBeGreaterThan(AUTO_MARKS_MIN);
    // The patient's right at +x: the marks run from +x to -x. (The crowns here touch below the incisal part the outline is read from, so a mark sits a little way up one side of the dip.)
    const expected = contactsAlong.slice(3, 10).reverse().map((s) => onArch(s));
    found.marks.slice(0, 7).forEach((mark, i) => {
      expect(Math.hypot(mark[0] - expected[i][0], mark[1] - expected[i][1])).toBeLessThan(1.5);
    });
  });

  it("puts the midline mark at the centrals' incisal edge and the tips on the canines", () => {
    expect(found.marks[3][2]).toBeCloseTo(0, 0);
    const tips = [onArch((contactsAlong[8] + contactsAlong[9]) / 2), onArch((contactsAlong[3] + contactsAlong[4]) / 2)];
    [found.marks[7], found.marks[8]].forEach((tip, i) => {
      expect(Math.hypot(tip[0] - tips[i][0], tip[1] - tips[i][1])).toBeLessThan(2);
      expect(tip[2]).toBeGreaterThan(0.5);
    });
  });

  it("runs the other way for an arch whose right side is at -x", () => {
    const other = autoMarksInArchFrame(scan, false)!;
    expect(other.marks[0][0]).toBeLessThan(0);
    expect(other.marks[6][0]).toBeGreaterThan(0);
    expect(other.marks[7][0]).toBeLessThan(0);
  });

  it("gives nothing on too little to read", () => {
    expect(autoMarksInArchFrame(new Float32Array(300), true)).toBeNull();
  });
});
