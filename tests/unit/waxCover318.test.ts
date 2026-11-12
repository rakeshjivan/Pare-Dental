import { describe, expect, it } from "vitest";
import { COVER_LENGTH_MOST, COVER_PALATAL_MOST, coverChange, coverNeed } from "@/lib/waxCover";
import type { ToothFrame } from "@/lib/dentalWaxup";

/** Build 318: a wax tooth made to cover the patient's tooth, kept anatomical. A box crown 8 wide, 10 long, 2 thick (b from -2 to 0), edge at h = 0. */
const frame: ToothFrame = { origin: [0, 0, 0], mesial: [1, 0, 0], out: [0, 1, 0], up: [0, 0, 1] };
const grid = (a0: number, a1: number, b0: number, b1: number, h0: number, h1: number, step = 0.25) => {
  const pts: number[] = [];
  for (let a = a0; a <= a1 + 1e-9; a += step) for (let b = b0; b <= b1 + 1e-9; b += step) for (let h = h0; h <= h1 + 1e-9; h += step) pts.push(a, b, h);
  return pts;
};
const wax = new Float32Array(grid(-4, 4, -2, 0, -10, 0));

describe("what a wax tooth leaves uncovered, and the least that covers it (build 318)", () => {
  it("a patient's tooth wholly inside the wax needs nothing", () => {
    const scan = new Float32Array(grid(-3, 3, -1.5, -0.5, -8, -0.5));
    expect(coverNeed(scan, wax, frame, 8, 10)).toMatchObject({ palatal: 0, incisal: 0 });
  });

  it("a patient's tooth standing 1 mm out palatally is found, by about 1 mm", () => {
    const scan = new Float32Array(grid(-3, 3, -3, -3, -5, -0.5));
    const need = coverNeed(scan, wax, frame, 8, 10);
    expect(need.palatal).toBeGreaterThan(0.9);
    expect(need.palatal).toBeLessThan(1.1);
    expect(need.incisal).toBe(0);
  });

  it("a patient's edge 0.6 mm beyond the wax edge is found", () => {
    const scan = new Float32Array(grid(-3, 3, -1.5, -0.5, 0.6, 0.6));
    const need = coverNeed(scan, wax, frame, 8, 10);
    expect(need.incisal).toBeCloseTo(0.6, 1);
    expect(need.palatal).toBe(0);
  });

  it("what is far behind the tooth (a neighbour tucked behind it, the palate) is not its to cover", () => {
    const scan = new Float32Array(grid(-3, 3, -7, -5.5, -5, -0.5));
    expect(coverNeed(scan, wax, frame, 8, 10).palatal).toBe(0);
  });

  it("the gum is not the tooth: the scan gumwards of the margin is left out", () => {
    const scan = new Float32Array(grid(-3, 3, -3, -3, -5, -3));
    expect(coverNeed(scan, wax, frame, 8, 10, { up: [0, 0, 1], level: -2 }).palatal).toBe(0);
  });

  it("the neighbours at the tooth's sides are left out", () => {
    const scan = new Float32Array(grid(3.6, 4, -3, -3, -5, -0.5));
    expect(coverNeed(scan, wax, frame, 8, 10).palatal).toBe(0);
  });

  it("a stray corner or two does not count", () => {
    const scan = new Float32Array([0, -3, -2, 0.3, -3, -2.2, -0.3, -3, -1.8]);
    expect(coverNeed(scan, wax, frame, 8, 10).palatal).toBe(0);
  });

  it("the change covers the need with a margin - and no more than a dentist would add by hand", () => {
    expect(coverChange({ palatal: 0.6, incisal: 0.3, palatalPoints: 50, incisalPoints: 50 }, 8.5, 10.5, { palatal: 0, length: 0 })).toEqual({ palatal: 1, length: 0.5 });
    // Capped: the tooth is never made giant.
    const big = coverChange({ palatal: 2.4, incisal: 2.4, palatalPoints: 50, incisalPoints: 50 }, 8.5, 10.5, { palatal: 0, length: 0 });
    expect(big.palatal).toBe(COVER_PALATAL_MOST);
    expect(big.length).toBe(COVER_LENGTH_MOST);
    // What it already has counts against the cap.
    expect(coverChange({ palatal: 2.4, incisal: 2.4, palatalPoints: 50, incisalPoints: 50 }, 8.5, 10.5, { palatal: 1.2, length: 0.8 })).toEqual({ palatal: 0.3, length: 0.2 });
  });

  it("a tooth is not lengthened out of proportion: its width stays at least 70% of its length", () => {
    // A lateral 6.5 wide and 9 long may reach 9.29 long: 0.29 more at most.
    const change = coverChange({ palatal: 0, incisal: 1.5, palatalPoints: 0, incisalPoints: 50 }, 6.5, 9, { palatal: 0, length: 0 });
    expect(change.length).toBeCloseTo(0.29, 2);
    // One already long for its width is not lengthened at all.
    expect(coverChange({ palatal: 0, incisal: 1.5, palatalPoints: 0, incisalPoints: 50 }, 6.5, 9.5, { palatal: 0, length: 0 }).length).toBe(0);
  });
});
