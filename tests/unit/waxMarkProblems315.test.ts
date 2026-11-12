import { describe, expect, it } from "vitest";
import { archMarkProblems } from "@/lib/waxArchMarks";

type V = [number, number, number];
/** Seven contacts round an even upper arch (canine 8, lateral 7, central 8.5 wide), then the canine tips. */
const arch = (): V[] => {
  const widths = [8, 7, 8.5, 8.5, 7, 8];
  const y = (x: number) => -0.035 * x * x;
  const xs: number[] = [0];
  for (const side of [-1, 1]) {
    let x = 0;
    for (const w of side < 0 ? [8.5, 7, 8] : [8.5, 7, 8]) {
      // Step along the curve by the width.
      let step = w;
      for (let k = 0; k < 20; k += 1) { const nx = x + side * step; step *= w / Math.hypot(nx - x, y(nx) - y(x)); }
      x += side * step;
      xs.push(x);
    }
  }
  void widths;
  const sorted = xs.sort((a, b) => a - b);
  const contacts = sorted.map((x) => [x, y(x), 0] as V);
  const tip = (a: V, b: V): V => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, -1];
  return [...contacts, tip(contacts[0], contacts[1]), tip(contacts[5], contacts[6])];
};

describe("marks that no arch of teeth could give are told (build 315)", () => {
  it("an even arch has nothing wrong", () => {
    expect(archMarkProblems("upper", arch())).toEqual([]);
  });

  it("a crowded arch - laterals tucked behind and seen narrow, a canine standing out - has nothing wrong either", () => {
    const m = arch();
    m[1] = [m[1][0] + 1.5, m[1][1] - 2.5, 0];
    m[5] = [m[5][0] - 2, m[5][1] - 2, 0.5];
    expect(archMarkProblems("upper", m)).toEqual([]);
  });

  it("two contacts clicked on the same spot: that tooth is told as too narrow, with its two dots", () => {
    const m = arch();
    m[1] = [m[0][0] + 0.4, m[0][1], 0];
    const found = archMarkProblems("upper", m);
    expect(found.some((p) => p.kind === "width" && p.fdi === 13 && p.dots[0] === 1 && p.dots[1] === 2)).toBe(true);
  });

  it("a contact clicked on the palate: its teeth come out too wide and the contacts double back there", () => {
    const m = arch();
    m[1] = [m[1][0] + 6, m[1][1] - 16, 2];
    const found = archMarkProblems("upper", m);
    expect(found.some((p) => p.kind === "width")).toBe(true);
    expect(found.some((p) => p.kind === "order")).toBe(true);
  });

  it("contacts clicked out of turn are told as doubling back", () => {
    const m = arch();
    [m[1], m[2]] = [m[2], m[1]];
    expect(archMarkProblems("upper", m).some((p) => p.kind === "order")).toBe(true);
  });

  it("a canine tip put on the wrong tooth is told", () => {
    const m = arch();
    m[7] = m[3];
    const found = archMarkProblems("upper", m);
    expect(found).toEqual([{ kind: "tip", fdi: 13, dots: [8] }]);
  });

  it("marks not yet placed are not problems", () => {
    const m: Array<V | null> = arch();
    m[4] = null; m[8] = null;
    expect(archMarkProblems("upper", m)).toEqual([]);
    expect(archMarkProblems("upper", undefined)).toEqual([]);
  });
});

import { orderArchMarks } from "@/lib/waxArchMarks";

describe("marks clicked in any order are put in order (build 316)", () => {
  // The patient's left: +x here (the arch above runs from -x to +x).
  const left = [1, 0, 0];
  it("contacts clicked in their order are left exactly as they are", () => {
    const m = arch();
    expect(orderArchMarks("upper", m, left)).toEqual(m);
  });
  it("contacts clicked from the patient's left are turned round", () => {
    const m = arch(), turned = [...m.slice(0, 7).reverse(), m[7], m[8]];
    expect(orderArchMarks("upper", turned, left)).toEqual(m);
  });
  it("contacts clicked in any order are sorted round the arch", () => {
    const m = arch(), mixed = [m[3], m[0], m[6], m[2], m[5], m[1], m[4], m[7], m[8]];
    expect(orderArchMarks("upper", mixed, left)).toEqual(m);
  });
  it("the canine tips go to their own sides", () => {
    const m = arch(), swapped = [...m.slice(0, 7), m[8], m[7]];
    expect(orderArchMarks("upper", swapped, left)).toEqual(m);
  });
  it("nothing is moved until all seven contacts are placed", () => {
    const m: Array<V | null> = arch(); const part = [m[3], m[0], null, null, null, null, null, null, null];
    expect(orderArchMarks("upper", part, left)).toEqual(part);
  });
  it("contacts that overlap across a crowded arch, clicked in their true order, are left alone", () => {
    const m = arch();
    // The lateral tucked behind: its mesial contact lies a little to the right of where it would be, seen from the front.
    m[2] = [m[1][0] - 0.4, m[1][1] + 3, 0];
    expect(archMarkProblems("upper", m).filter((p) => p.kind === "order")).toEqual([]);
    expect(orderArchMarks("upper", m, left)).toEqual(m);
  });
});
