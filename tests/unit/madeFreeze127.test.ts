import { describe, expect, it } from "vitest";
import { madeCornerFrozen, MADE_BASE_CLEAR, MADE_SEAM_BAND } from "@/lib/madeFreeze";

// Build 127: which corners each finishing brush protects on a made model. Base top sits at z = 3.
const BASE_TOP = 3;
const up = () => 1;     // an upward-facing corner (gum/tooth outer surface)
const down = () => -1;  // a downward-facing corner (the roof of a hollow model)

describe("made-model finishing freeze (build 127)", () => {
  it("Smooth/Add/Remove freeze the base block and the hollow roof, leaving teeth and gum free", () => {
    for (const brush of ["smooth", "add", "remove"] as const) {
      expect(madeCornerFrozen(brush, BASE_TOP - 0.5, BASE_TOP, up)).toBe(true);       // inside the base
      expect(madeCornerFrozen(brush, BASE_TOP + MADE_BASE_CLEAR + 1, BASE_TOP, up)).toBe(false); // gum/tooth
      expect(madeCornerFrozen(brush, BASE_TOP + 5, BASE_TOP, down)).toBe(true);        // hollow roof (faces down)
    }
  });

  it("Blend frees only the seam band and protects the teeth and the flat base", () => {
    expect(madeCornerFrozen("blend", BASE_TOP, BASE_TOP, up)).toBe(false);                 // on the seam
    expect(madeCornerFrozen("blend", BASE_TOP + MADE_SEAM_BAND - 0.1, BASE_TOP, up)).toBe(false); // top of band
    expect(madeCornerFrozen("blend", BASE_TOP - MADE_SEAM_BAND + 0.1, BASE_TOP, up)).toBe(false); // bottom of band
    expect(madeCornerFrozen("blend", BASE_TOP + MADE_SEAM_BAND + 2, BASE_TOP, up)).toBe(true);    // teeth/gum above
    expect(madeCornerFrozen("blend", BASE_TOP - MADE_SEAM_BAND - 1, BASE_TOP, up)).toBe(true);    // base/flat bottom below
  });

  it("Blend never consults the normal (so it protects the teeth whichever way they face)", () => {
    const boom = () => { throw new Error("normal should not be read for blend"); };
    expect(() => madeCornerFrozen("blend", BASE_TOP, BASE_TOP, boom)).not.toThrow();
    expect(madeCornerFrozen("blend", BASE_TOP + MADE_SEAM_BAND + 2, BASE_TOP, boom)).toBe(true);
  });
});
