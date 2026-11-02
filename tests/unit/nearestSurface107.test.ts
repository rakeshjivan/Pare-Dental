import { describe, expect, it } from "vitest";
import { NearestSurface } from "@/lib/nearestSurface";

// A bumpy sheet of many small triangles, as a scan.
function sheet(n: number, size: number) {
  const out: number[] = [];
  const h = (x: number, y: number) => Math.sin(x * 0.7) * Math.cos(y * 0.5) * 1.5;
  const step = size / n;
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
    const x0 = i * step, y0 = j * step, x1 = x0 + step, y1 = y0 + step;
    out.push(x0, y0, h(x0, y0), x1, y0, h(x1, y0), x1, y1, h(x1, y1), x0, y0, h(x0, y0), x1, y1, h(x1, y1), x0, y1, h(x0, y1));
  }
  return Float32Array.from(out);
}
function brute(soup: Float32Array, x: number, y: number, z: number, reach: number) {
  let best = Infinity;
  for (let t = 0; t < soup.length; t += 9) {
    // sample the triangle densely enough for a check
    for (let a = 0; a <= 10; a += 1) for (let b = 0; a + b <= 10; b += 1) {
      const u = a / 10, v = b / 10, w = 1 - u - v;
      const px = soup[t] * w + soup[t + 3] * u + soup[t + 6] * v, py = soup[t + 1] * w + soup[t + 4] * u + soup[t + 7] * v, pz = soup[t + 2] * w + soup[t + 5] * u + soup[t + 8] * v;
      best = Math.min(best, Math.hypot(px - x, py - y, pz - z));
    }
  }
  return best <= reach ? best : Infinity;
}

describe("build 107: nearest surface, searched ring by ring", () => {
  it("finds the same nearest distance as a full search, within reach, and nothing beyond it", () => {
    const soup = sheet(60, 30);
    const surface = new NearestSurface(soup, 4);
    const out = new Float64Array(3);
    let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 60; i += 1) {
      const x = 2 + rnd() * 26, y = 2 + rnd() * 26, z = -5 + rnd() * 10;
      const d = surface.nearest(x, y, z, out);
      const b = brute(soup, x, y, z, 4);
      if (!Number.isFinite(b)) { expect(Number.isFinite(d) ? d : 5).toBeGreaterThan(3.9); continue; }
      expect(d).toBeLessThanOrEqual(b + 1e-6);
      expect(d).toBeGreaterThan(b - 0.05);
      expect(Math.hypot(out[0] - x, out[1] - y, out[2] - z)).toBeCloseTo(d, 6);
    }
  });
});
