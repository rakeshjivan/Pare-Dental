import { describe, expect, it } from "vitest";
import { NECK_FROM, NECK_LEAN, NECK_REACH, extendNeck } from "@/lib/waxNeck";

/** Build 289: a wax tooth's neck drawn out into a short root for the model, the crown untouched. */
describe("extendNeck", () => {
  // A tooth as a column of corners: incisal edge at z 0, neck at z -10, labial +y.
  const soup: number[] = [];
  for (let z = 0; z >= -10; z -= 0.5) for (const [x, y] of [[-3, 0], [3, 0], [3, -6], [-3, -6]]) soup.push(x, y, z);
  const frame = { origin: [0, 0, 0], up: [0, 0, 1], out: [0, 1, 0] };
  const out = extendNeck(soup, frame);

  it("leaves the crown exactly as it was", () => {
    for (let i = 0; i < soup.length; i += 3) if (soup[i + 2] >= -10 * NECK_FROM) for (let k = 0; k < 3; k += 1) expect(out[i + k]).toBe(soup[i + k]);
  });

  it("carries the cervical end gumwards and a little palatally, eased in from the crown", () => {
    let last = 0;
    for (let i = 0; i < soup.length; i += 3) {
      if (soup[i] !== -3 || soup[i + 1] !== 0) continue;
      const moved = soup[i + 2] - out[i + 2];
      expect(moved).toBeGreaterThanOrEqual(last - 1e-6);
      last = moved;
      if (soup[i + 2] === -10) { expect(moved).toBeCloseTo(NECK_REACH, 4); expect(soup[i + 1] - out[i + 1]).toBeCloseTo(NECK_REACH * NECK_LEAN, 4); expect(out[i]).toBe(-3); }
    }
    // Just past where the neck begins it has hardly moved.
    const k = soup.findIndex((_, i) => i % 3 === 2 && soup[i] === -7.5);
    expect(soup[k] - out[k]).toBeLessThan(0.1);
  });

  it("gives back a tooth too short to have a neck as it is", () => {
    const stub = [0, 0, 0, 1, 0, -1, 0, 1, -1];
    expect(Array.from(extendNeck(stub, frame))).toEqual(stub);
  });
});
