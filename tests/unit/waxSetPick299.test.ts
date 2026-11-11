import { describe, expect, it } from "vitest";
import { COVER_WEIGHT, archRoom, frameFromMarks, rankSets, scoreSet, type SetDims } from "@/lib/waxSetPick";

/** Build 299: the library set that fits an arch with the least change to its teeth. */
describe("scoreSet", () => {
  // An arch whose six spaces are 7.5, 6.5, 8.5, 8.5, 6.5, 7.5 mm, the margins 10 mm (centrals), 8.5 and 9.5 above the edge level.
  const room = { widths: [7.5, 6.5, 8.5, 8.5, 6.5, 7.5], rooms: [9.5, 8.5, 10, 10, 8.5, 9.5], longer: 0 };
  const made = (widths: number[], lengths: number[]): SetDims => ({ widths, lengths, drops: [-1, -0.5, 0, 0, -0.5, -1], upright: [1, 1, 1, 1, 1, 1] });
  // A set with the arch's own proportions (each tooth as long as its room, less its drop, plus the buried millimetre).
  const fits = made([7.5, 6.5, 8.5, 8.5, 6.5, 7.5], [9.5, 9, 11, 11, 9, 9.5]);

  it("scores a set that already has the arch's proportions at nothing, whatever its size", () => {
    expect(scoreSet(fits, room).score).toBeLessThan(1e-6);
    const small = made(fits.widths.map((w) => w * 0.9), fits.lengths.map((l) => l * 0.9));
    const s = scoreSet(small, room);
    expect(s.widths).toBeLessThan(1e-6);
    // Made 0.9 its size, each tooth must be both widened and lengthened by the same share: its form is kept (nearly - the drops are not scaled).
    expect(s.form).toBeLessThan(0.03);
  });

  it("scores a set with laterals too wide for its centrals worse, under widths", () => {
    const wide = made([7.5, 7.8, 8.5, 8.5, 7.8, 7.5], fits.lengths);
    const s = scoreSet(wide, room);
    expect(s.widths).toBeGreaterThan(0.05);
    expect(s.score).toBeGreaterThan(scoreSet(fits, room).score);
  });

  it("scores short, square teeth worse than teeth of the arch's length, under form", () => {
    const squat = made(fits.widths, fits.lengths.map((l) => l * 0.8));
    const s = scoreSet(squat, room);
    expect(s.form).toBeGreaterThan(0.15);
    expect(s.reach).toBeLessThan(1e-6);
  });

  it("counts a neck that cannot reach the gum line, under reach", () => {
    const stub = made(fits.widths, fits.lengths.map((l) => l * 0.5));
    expect(scoreSet(stub, room).reach).toBeGreaterThan(0.1);
  });

  it("ranks the best first", () => {
    const ranked = rankSets([{ id: "squat", dims: made(fits.widths, fits.lengths.map((l) => l * 0.8)) }, { id: "fits", dims: fits }], room);
    expect(ranked.map((r) => r.id)).toEqual(["fits", "squat"]);
  });

  it("counts the patient's teeth left proud of the wax against a set (build 300)", () => {
    const squat = made(fits.widths, fits.lengths.map((l) => l * 0.9));
    const plain = rankSets([{ id: "fits", dims: fits }, { id: "squat", dims: squat }], room);
    expect(plain[0].id).toBe("fits");
    expect(plain[0].cover).toBeNull();
    // The better-proportioned set leaves 1.5 mm of the patient's teeth showing, the other none.
    const tried = rankSets([{ id: "fits", dims: fits }, { id: "squat", dims: squat }], room, new Map([["fits", 1.5], ["squat", 0]]));
    expect(tried[0].id).toBe("squat");
    expect(tried[1].score).toBeCloseTo(plain[0].score + COVER_WEIGHT * 1.5, 6);
  });

  it("leaves a tooth with no margin read out of the lengths", () => {
    const blind = { ...room, rooms: [null, null, null, null, null, null] };
    expect(scoreSet(made(fits.widths, fits.lengths.map((l) => l * 0.6)), blind).score).toBeLessThan(1e-6);
  });
});

describe("archRoom and frameFromMarks", () => {
  // Seven contacts on an arc in the plane z = 0 (front at -y), the canine tips 2 mm incisal (+z).
  const contacts: Array<[number, number, number]> = [[-20, 0, 0], [-13, -5, 0], [-7, -8, 0], [0, -9, 0], [7, -8, 0], [13, -5, 0], [20, 0, 0]];
  const marks = [...contacts, [-16.5, -3, 2], [16.5, -3, 2]] as Array<[number, number, number]>;

  it("reads up from the side of the canine tips and out towards the front", () => {
    const frame = frameFromMarks(marks)!;
    expect(frame.up[2]).toBeCloseTo(1, 5);
    expect(frame.out[1]).toBeCloseTo(-1, 5);
    const flipped = frameFromMarks(marks.map(([x, y, z]) => [x, y, -z] as [number, number, number]))!;
    expect(flipped.up[2]).toBeCloseTo(-1, 5);
  });

  it("measures the six spaces and each margin's distance from the edge level, and starts short centrals longer", () => {
    const room = archRoom(contacts, [0, 0, 1], [-9, -8, -8.5, -8.5, null, -9], 8.5, 0.78)!;
    expect(room.widths[2]).toBeCloseTo(Math.hypot(7, 1), 5);
    expect(room.rooms).toEqual([9, 8, 8.5, 8.5, null, 9]);
    expect(room.longer).toBeCloseTo(Math.hypot(7, 1) / 0.78 - 8.5, 5);
  });
});
