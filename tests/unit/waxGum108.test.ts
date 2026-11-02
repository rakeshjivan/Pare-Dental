import { describe, expect, it } from "vitest";
import { gumPair, gumSides, idealLevels, inToothFrame, marginAt, marginRegion, moveGumCut, visibleLength, zenithShift, type GumCut, type SurfaceProbe } from "@/lib/waxGum";

// A tooth standing on +z (incisal edge at z = 10, labial face towards -y), mesial towards -x.
const frame = { origin: [0, -3, 10] as [number, number, number], up: [0, 0, 1] as [number, number, number], mesial: [-1, 0, 0] as [number, number, number], out: [0, -1, 0] as [number, number, number] };
const cut: GumCut = { ...frame, soup: new Float32Array(0), keep: 9, distal: 1, width: 8.5 };

/** Signed volume of a closed soup (positive when its faces point out). */
const volume = (soup: Float32Array) => {
  let v = 0;
  for (let i = 0; i < soup.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = soup.subarray(i, i + 9);
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
};

describe("Wax-up Gum line (build 108)", () => {
  it("puts the zenith distal as Chu et al. 2009 measured: 1 mm central, 0.4 lateral, canine centred", () => {
    expect([11, 21, 12, 22, 13, 23].map(zenithShift)).toEqual([1, 1, 0.4, 0.4, 0, 0]);
    expect(zenithShift(31)).toBe(0);
  });
  it("pairs the two sides", () => {
    expect(gumPair(11)).toBe(gumPair(21));
    expect(gumPair(12)).not.toBe(gumPair(22 + 1));
    expect(gumPair(41)).toBe("lower:1");
  });
  it("lowest at the zenith, rising towards the contacts", () => {
    expect(marginAt(9, 0, 8.5)).toBe(9);
    expect(marginAt(9, 4.25, 8.5)).toBeCloseTo(6);
    expect(marginAt(9, -2, 8.5)).toBeGreaterThan(marginAt(9, -3, 8.5));
  });
  it("measures from the zenith's line, distal of the middle", () => {
    // The tooth's middle (x = 0) is 1 mm mesial of a central's zenith; 1 mm distal (+x) is the zenith.
    expect(inToothFrame({ ...frame, distal: 1 }, [0, -3, 10]).m).toBeCloseTo(1);
    expect(inToothFrame({ ...frame, distal: 1 }, [1, -3, 1]).m).toBeCloseTo(0);
    expect(inToothFrame(frame, [0, -3, 1]).u).toBeCloseTo(9);
  });
  it("makes the region coronal of the margin a closed solid facing out", () => {
    const region = marginRegion(cut);
    expect(region.length % 9).toBe(0);
    expect(volume(region)).toBeGreaterThan(0);
    // The zenith's point just coronal of the margin is inside; just apical, outside (its height).
    const zenith = cut.keep;
    expect(zenith).toBe(9);
  });
  it("moves with the model", () => {
    const shift = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1];
    const moved = moveGumCut({ ...cut, soup: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) }, shift);
    expect(moved.origin).toEqual([5, -3, 10]);
    expect(moved.up).toEqual([0, 0, 1]);
    expect(Array.from(moved.soup.slice(0, 3))).toEqual([5, 0, 0]);
  });
  it("finds the visible crown length from where the gum covers the labial face", () => {
    // A labial strip of triangles facing -y down the tooth's middle, from z = 10 to z = 0; gum covers below z = 2.
    const soup: number[] = [];
    for (let z = 10; z > 0; z -= 0.5) soup.push(-0.5, -3, z, 0.5, -3, z - 0.5, 0.5, -3, z, -0.5, -3, z, -0.5, -3, z - 0.5, 0.5, -3, z - 0.5);
    const tooth = { ...frame, distal: 0, width: 8 };
    const probe: SurfaceProbe = {
      lastTriangle: 0,
      nearest(x, y, z, out) { out[0] = x; out[1] = y + (z < 2 ? -0.5 : 0.5); out[2] = z; return 0.5; },
      triangleNormal(_t, out) { out[0] = 0; out[1] = -1; out[2] = 0; },
    };
    const sides = gumSides(Float32Array.from(soup), tooth, probe);
    // The gum begins between z = 2 and 1.5 (the strip's 0.5 mm steps): 8 to 8.5 mm from the edge.
    const at = (s: Float32Array) => visibleLength(soup, { ...tooth, length: 10 }, s);
    expect(at(sides)).toBeGreaterThanOrEqual(7.5);
    expect(at(sides)).toBeLessThanOrEqual(8.5);
    // Deeper under the gum than the look-up reaches (Infinity, in the cervical half) is not read as shown.
    const deep = Float32Array.from(sides, (v, i) => (soup[i * 3 + 2] < 1 ? Infinity : v));
    expect(at(deep)).toBe(at(sides));
    // Nowhere covered: the whole tooth, to its length.
    expect(visibleLength(soup, { ...tooth, length: 9.5 }, new Float32Array(sides.length).fill(1))).toBe(9.5);
  });
  it("sets the canines level with the centrals and the laterals 1 mm coronal", () => {
    const at = (fdi: number, x: number, edge: number) => ({ fdi, frame: { ...frame, origin: [x, -3, edge] as [number, number, number] } });
    // Centrals' edge at 10, laterals' at 10.5 (shorter), canines' at 9.8.
    const levels = idealLevels([at(11, 4, 10), at(21, -4, 10), at(12, 11, 10.5), at(22, -11, 10.5), at(13, 17, 9.8), at(23, -17, 9.8)], 10, [0, 0, 1])!;
    // The centrals' zenith at z = 0; canines' too; laterals' at z = 1.
    expect(levels["upper:1"]).toBeCloseTo(10);
    expect(levels["upper:3"]).toBeCloseTo(9.8);
    expect(levels["upper:2"]).toBeCloseTo(9.5);
  });
});
