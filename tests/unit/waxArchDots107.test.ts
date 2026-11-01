import { describe, expect, it } from "vitest";
import { archCurveAt, marksFromAnchors, gumward, type ToothAnchors } from "../../apps/web/src/lib/waxArchDots";

// An upper arch: x across (patient's left +), y up towards the gum, z forward. Edges at y = 0.
const tooth = (x0: number, x1: number, z: number): ToothAnchors => ({ mesial: [x0, 4, z], distal: [x1, 4, z - 1], cervical: [(x0 + x1) / 2, 10, z] });

describe("build 107: the arch dots", () => {
  const arch: [number, number, number][] = [[0, -1, 10], [-18, 0, 2], [18, 0, 2]];

  it("runs the incisal curve through the midline and both canine tips", () => {
    expect(archCurveAt(arch as never, 0)).toEqual([0, -1, 10]);
    expect(archCurveAt(arch as never, -1)).toEqual([-18, 0, 2]);
    expect(archCurveAt(arch as never, 1)).toEqual([18, 0, 2]);
  });

  it("puts each tooth's edge on the curve where it stands, the laterals shorter", () => {
    const anchors = { 11: tooth(0, -8.5, 9.5), 12: tooth(-8.5, -14.5, 7), 13: tooth(-14.5, -20, 4) };
    expect(gumward(anchors)![1]).toBeGreaterThan(0.9);
    const marks = marksFromAnchors(anchors, arch);
    // The central's edge sits low near the midline, the canine's at its tip height.
    expect(marks[11].incisal[1]).toBeLessThan(-0.5);
    expect(marks[13].incisal).toEqual([-18, 0, 2]);
    // The lateral is set 0.75 mm towards the gum from the curve.
    const onCurve = marksFromAnchors(anchors, arch, 0)[12].incisal;
    expect(marks[12].incisal[1] - onCurve[1]).toBeGreaterThan(0.7);
    // The contacts and zenith are kept as clicked.
    expect(marks[12].mesial).toEqual(anchors[12].mesial);
  });

  it("gives nothing until all three arch dots are in", () => {
    expect(marksFromAnchors({ 11: tooth(0, -8.5, 9.5) }, arch.slice(0, 2))).toEqual({});
  });
});
