import { describe, expect, it } from "vitest";
import { NECK_FROM, NECK_LEAN, NECK_REACH, NECK_UNDER, extendNeck, neckFit } from "@/lib/waxNeck";

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

  it("carries the palatal side of the cervical end gumwards and a little palatally, eased in from the crown", () => {
    let last = 0;
    for (let i = 0; i < soup.length; i += 3) {
      if (soup[i] !== -3 || soup[i + 1] !== -6) continue;
      const moved = soup[i + 2] - out[i + 2];
      expect(moved).toBeGreaterThanOrEqual(last - 1e-6);
      last = moved;
      if (soup[i + 2] === -10) { expect(moved).toBeCloseTo(NECK_REACH, 4); expect(soup[i + 1] - out[i + 1]).toBeCloseTo(NECK_REACH * NECK_LEAN, 4); expect(out[i]).toBe(-3); }
    }
    // Just past where the neck begins it has hardly moved.
    const k = soup.findIndex((_, i) => i % 3 === 2 && soup[i] === -7.5 && soup[i - 1] === -6);
    expect(soup[k] - out[k]).toBeLessThan(0.1);
  });

  it("leaves the labial side of the neck where it was laid", () => {
    for (let i = 0; i < soup.length; i += 3) if (soup[i + 1] === 0) for (let k = 0; k < 3; k += 1) expect(out[i + k]).toBe(soup[i + k]);
  });

  it("gives back a tooth too short to have a neck as it is", () => {
    const stub = [0, 0, 0, 1, 0, -1, 0, 1, -1];
    expect(Array.from(extendNeck(stub, frame))).toEqual(stub);
  });
});

/* Pare Dental: the palatal neck drawn out until the palatal gum covers its end, as the labial gum covers the labial. */
describe("extendNeck under the palatal gum", () => {
  const soup: number[] = [];
  for (let z = 0; z >= -10; z -= 0.5) for (const [x, y] of [[-3, 0], [3, 0], [3, -6], [-3, -6]]) soup.push(x, y, z);
  const frame = { origin: [0, 0, 0], up: [0, 0, 1], out: [0, 1, 0] };
  // The palatal gum: at z -11 under the tooth's palatal face, falling away steeply into the palate (4 mm per mm).
  const gum = (y: number) => -11 + 4 * Math.min(0, y + 6);
  const under = (_x: number, y: number, z: number) => (z - gum(y)) / Math.hypot(1, 4);
  const ends = (out: Float32Array) => { const h: number[] = []; for (let i = 0; i < soup.length; i += 3) if (soup[i + 1] === -6 && soup[i + 2] === -10) h.push(under(out[i], out[i + 1], out[i + 2])); return h; };

  it("leaves the end over the gum with the fixed reach - the case it is for", () => {
    for (const h of ends(extendNeck(soup, frame))) expect(h).toBeGreaterThan(0);
  });
  it("reaches on until the end is under the gum", () => {
    const fit = neckFit(soup, frame, NECK_REACH, under);
    expect(fit.under).toBeGreaterThanOrEqual(0.95);
    for (const h of ends(extendNeck(soup, frame, NECK_REACH, under))) expect(h).toBeLessThan(-NECK_UNDER + 1e-6);
  });
  it("changes nothing where the fixed reach already puts it under", () => {
    const deep = (_x: number, _y: number, z: number) => z + 9;
    expect(Array.from(extendNeck(soup, frame, NECK_REACH, deep))).toEqual(Array.from(extendNeck(soup, frame)));
  });
});
