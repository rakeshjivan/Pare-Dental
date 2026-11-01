import { describe, expect, it } from "vitest";
import { marksFromNeighbours, type ToothMarks } from "../../apps/web/src/lib/dentalWaxup";

// A toy arch: x across (patient's left +), y up, z forward. Each tooth 8 mm wide along x.
const tooth = (x0: number, x1: number, len: number): ToothMarks => ({ mesial: [x0, 0, 0], distal: [x1, 0, 0], cervical: [(x0 + x1) / 2, 4, 1], incisal: [(x0 + x1) / 2, 4 - len, 1] });

describe("build 107: a tooth's dots from its neighbours", () => {
  const marks: Record<number, ToothMarks> = {
    11: tooth(0, -8.5, 10), 21: tooth(0, 8.5, 10),
    12: tooth(-8.5, -15, 8.5), 22: tooth(8.5, 15, 8.5),
    13: tooth(-15, -22, 11), 23: tooth(15, 22, 11),
  };

  it("takes its width from the gap and its length from the tooth on the other side", () => {
    const { 12: _gone, ...rest } = marks;
    const made = marksFromNeighbours(12, rest)!;
    expect(made.mesial).toEqual([-8.5, 0, 0]);
    expect(made.distal).toEqual([-15, 0, 0]);
    expect(made.incisal[1]).toBeCloseTo(4 - 8.5);
    expect(made.incisal[0]).toBeCloseTo(-11.75);
  });

  it("falls back to its neighbours when the other side is not marked, and gives up with nothing to go on", () => {
    const { 12: _a, 22: _b, ...rest } = marks;
    const made = marksFromNeighbours(12, rest)!;
    expect(made.incisal[1]).toBeCloseTo(4 - 10.5); // the average of 11 and 13
    expect(marksFromNeighbours(15, { 11: marks[11] })).toBeNull();
  });

  it("sets the last tooth in the row from the other side's width", () => {
    const { 13: _gone, ...rest } = marks;
    const made = marksFromNeighbours(13, rest)!;
    expect(made.distal[0]).toBeCloseTo(-22);
  });
});
