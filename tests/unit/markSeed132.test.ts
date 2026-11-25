import { describe, expect, it } from "vitest";
import { contactBetween, archMarksFromSegmentation } from "@/lib/toothSegment";

// A minimal two-tooth soup: label 11 occupies x<0, label 21 occupies x>0, meeting at x=0.
// Each "tooth" is a grid of small triangles so the contact code has >20 corners per label.
function twoTeeth(gap: number): { soup: Float32Array; fdi: Uint8Array } {
  const tris: number[] = []; const labels: number[] = [];
  const add = (cx: number, label: number) => {
    for (let i = 0; i < 40; i += 1) {
      const z = i * 0.5; // runs up in +Z (occlusal)
      // a thin triangle near x=cx
      tris.push(cx, 0, z, cx, 1, z, cx, 0, z + 0.5);
      labels.push(label);
    }
  };
  // 11 side face at x = -gap/2, 21 side face at x = +gap/2
  add(-gap / 2, 11); add(gap / 2, 21);
  return { soup: Float32Array.from(tris), fdi: Uint8Array.from(labels) };
}

describe("contactBetween (build 132)", () => {
  it("returns the midpoint when two labels touch", () => {
    const { soup, fdi } = twoTeeth(0);
    const c = contactBetween(soup, fdi, 11, 21);
    expect(c).not.toBeNull();
    expect(Math.abs(c![0])).toBeLessThan(1e-6); // midline at x≈0
  });

  it("rejects a contact when the labels stand further apart than maxGap", () => {
    const { soup, fdi } = twoTeeth(10); // 10 mm apart
    expect(contactBetween(soup, fdi, 11, 21, 2)).toBeNull();
  });

  it("returns null when a label is missing or too small", () => {
    const { soup, fdi } = twoTeeth(0);
    expect(contactBetween(soup, fdi, 11, 13)).toBeNull();
  });
});

describe("archMarksFromSegmentation (build 132)", () => {
  it("returns null when the nine marks can't all be found (only centrals present)", () => {
    const { soup, fdi } = twoTeeth(0);
    const teeth = [
      { fdi: 11, centre: [-1, 0, 10] as [number, number, number], top: [-1, 0, 20] as [number, number, number], area: 100, confidence: 1, agreed: true },
      { fdi: 21, centre: [1, 0, 10] as [number, number, number], top: [1, 0, 20] as [number, number, number], area: 100, confidence: 1, agreed: true },
    ];
    // No laterals/canines, so the lateral contacts and canine tips are missing → null (heuristic fallback).
    expect(archMarksFromSegmentation(soup, { fdi, teeth, seconds: 0 }, "upper")).toBeNull();
  });
});
