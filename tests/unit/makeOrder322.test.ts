import { describe, expect, it } from "vitest";
import { MAKE_ONE_AT_A_TIME_FROM, makesOneAtATime } from "@/lib/meshJobs";
import type { DentalStudioInput } from "@/lib/dentalModel";

/** Build 322: large pairs are made one arch after the other (half the memory at the peak); small ones side by side. */
const pair = (upper: number, lower: number) => ({ arches: [{ id: "u", positions: new Float32Array(upper * 9) }, { id: "l", positions: new Float32Array(lower * 9) }], bite: null }) as unknown as DentalStudioInput;

describe("the order a pair of models is made in", () => {
  it("side by side for ordinary scans", () => {
    expect(makesOneAtATime(pair(270_000, 170_000))).toBe(false);
  });
  it("one after the other from the limit up, counted over both scans together", () => {
    expect(makesOneAtATime(pair(MAKE_ONE_AT_A_TIME_FROM / 2, MAKE_ONE_AT_A_TIME_FROM / 2))).toBe(true);
    expect(makesOneAtATime(pair(860_000, 665_000))).toBe(true);
    expect(makesOneAtATime(pair(MAKE_ONE_AT_A_TIME_FROM / 2, MAKE_ONE_AT_A_TIME_FROM / 2 - 1))).toBe(false);
  });
});
