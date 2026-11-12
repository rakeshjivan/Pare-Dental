import { describe, expect, it } from "vitest";
import { idealArch } from "@/lib/waxSmileSet";

type Vec3 = [number, number, number];
/** Build 309: the marked contacts as they would stand on an even arch. Up is +z, labial is -y; the marks run from the patient's right (x < 0). */
const arch = (x: number) => -(-0.03 * x * x); // labial is -y: y grows (palatal) away from the midline
const onArch: Vec3[] = [-17, -11, -4.5, 0, 4.5, 11, 17].map((x, i) => [x, arch(x), 10 + (i % 2) * 0.4]);
const up: Vec3 = [0, 0, 1], out: Vec3 = [0, -1, 0];
const far = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe("idealArch (build 309)", () => {
  it("leaves marks already on an even arch where they are", () => {
    const got = idealArch(onArch, up, out);
    for (let i = 0; i < 7; i += 1) expect(far(got[i], onArch[i])).toBeLessThan(0.4);
  });

  it("brings a tucked-in lateral's contacts out onto the arch; the midline and the ends stay", () => {
    const marks = onArch.map((p) => [...p] as Vec3);
    // The patient's right lateral sits 4 mm palatal: both its contacts (marks 1 and 2) with it.
    marks[1] = [marks[1][0] + 1, marks[1][1] + 4, marks[1][2]];
    marks[2] = [marks[2][0] + 0.5, marks[2][1] + 3.5, marks[2][2]];
    const got = idealArch(marks, up, out);
    for (const i of [0, 3, 6]) expect(far(got[i], marks[i])).toBeLessThan(1e-9);
    // Out on the arch again (within a millimetre of it), at the heights they were marked at.
    for (const i of [1, 2]) { expect(Math.abs(got[i][1] - arch(got[i][0]))).toBeLessThan(1); expect(got[i][2]).toBeCloseTo(marks[i][2], 9); }
    // The other side, untouched by it, hardly moves.
    for (const i of [4, 5]) expect(far(got[i], marks[i])).toBeLessThan(0.6);
    // And in order still along the arch.
    for (let i = 0; i < 6; i += 1) expect(got[i + 1][0]).toBeGreaterThan(got[i][0] + 2);
  });

  it("shares the arch out by the marked widths", () => {
    const marks = onArch.map((p) => [...p] as Vec3);
    marks[1] = [marks[1][0] + 1, marks[1][1] + 4, marks[1][2]];
    const got = idealArch(marks, up, out);
    const flat = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const was = [flat(marks[3], marks[2]), flat(marks[2], marks[1]), flat(marks[1], marks[0])], now = [flat(got[3], got[2]), flat(got[2], got[1]), flat(got[1], got[0])];
    const ratio = now.map((w, k) => w / was[k]);
    // One scale for the three teeth of the side (to a tenth: chords against the way round).
    expect(Math.max(...ratio) - Math.min(...ratio)).toBeLessThan(0.1);
  });

  it("gives the marks back when there are not seven, or they make no arch", () => {
    expect(idealArch(onArch.slice(0, 5), up, out)).toHaveLength(5);
    const line: Vec3[] = [-17, -11, -4.5, 0, 4.5, 11, 17].map((x) => [x, -0.02 * x * x, 10]);
    expect(idealArch(line, up, out)).toEqual(line);
  });
});
