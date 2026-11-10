import { describe, expect, it } from "vitest";
import { archMarkLabel, frontTeeth, markedWidths, nextArchMark } from "@/lib/waxArchMarks";

/** Build 278: Wax-up Studio step 1 - the nine marks on the scan. */
describe("arch marks", () => {
  it("names the marks from the patient's right, the midline fourth and the canine tips last", () => {
    expect(archMarkLabel("upper", 0)).toEqual({ kind: "distal", teeth: [13] });
    expect(archMarkLabel("upper", 3)).toEqual({ kind: "midline", teeth: [11, 21] });
    expect(archMarkLabel("upper", 6)).toEqual({ kind: "distal", teeth: [23] });
    expect(archMarkLabel("lower", 8)).toEqual({ kind: "tip", teeth: [33] });
    expect(frontTeeth("lower")).toEqual([43, 42, 41, 31, 32, 33]);
  });
  it("asks for the first gap next, and nothing when all nine are there", () => {
    const p: [number, number, number] = [0, 0, 0];
    expect(nextArchMark(undefined)).toBe(0);
    expect(nextArchMark([p, p, null, p])).toBe(2);
    expect(nextArchMark(Array(9).fill(p))).toBeNull();
  });
  it("measures each tooth between its two contacts", () => {
    const marks: Array<[number, number, number]> = [[-20, -6, 0], [-14, -3, 0], [-8, -1, 0], [0, 0, 0], [8.5, -1, 0], [15, -3, 0], [21, -6, 0]];
    const w = markedWidths("upper", marks);
    expect(w.get(11)).toBeCloseTo(Math.hypot(8, 1), 6);
    expect(w.get(21)).toBeCloseTo(Math.hypot(8.5, 1), 6);
    expect(w.size).toBe(6);
    expect(markedWidths("upper", [marks[0], null, ...marks.slice(2)]).has(13)).toBe(false);
  });
});
