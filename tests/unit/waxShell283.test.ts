import { describe, expect, it } from "vitest";
import { RadialMap, segmentFront, shellScan } from "@/lib/waxShell";

/**
 * Build 283: a wax tooth as a lab makes it - the scan's crown moved out onto the library tooth, from nothing at the
 * gingival margin. A synthetic scan: flat gum (z 0) with a dome of a tooth standing out of it (radius 2.5 at the
 * gum, a sharp crease where they meet).
 */
const R = 2.5, H = 1.6, STEP = 0.25, SIZE = 6;
const height = (x: number, y: number) => { const r = Math.hypot(x, y); return r < R ? Math.sqrt(R * R - r * r) * H : 0; };
const scan = (() => {
  const out: number[] = [];
  for (let x = -SIZE; x < SIZE - 1e-9; x += STEP) for (let y = -SIZE; y < SIZE - 1e-9; y += STEP) {
    const p = (a: number, b: number) => [a, b, height(a, b)];
    out.push(...p(x, y), ...p(x + STEP, y), ...p(x + STEP, y + STEP), ...p(x, y), ...p(x + STEP, y + STEP), ...p(x, y + STEP));
  }
  return Float32Array.from(out);
})();
/** A library tooth: a bigger dome, closed (a sphere squashed), centred on the tooth. */
const library = (() => {
  const out: number[] = [];
  const pt = (t: number, f: number) => [3 * Math.sin(t) * Math.cos(f), 3 * Math.sin(t) * Math.sin(f), 0.3 + 5 * Math.cos(t)];
  const N = 40;
  for (let i = 0; i < N; i += 1) for (let j = 0; j < N; j += 1) {
    const t0 = (i / N) * Math.PI, t1 = ((i + 1) / N) * Math.PI, f0 = (j / N) * 2 * Math.PI, f1 = ((j + 1) / N) * 2 * Math.PI;
    out.push(...pt(t0, f0), ...pt(t1, f0), ...pt(t1, f1), ...pt(t0, f0), ...pt(t1, f1), ...pt(t0, f1));
  }
  return Float32Array.from(out);
})();

describe("segmentFront", () => {
  it("finds the crown up to the crease where it meets the gum", () => {
    const seg = segmentFront(scan, [{ fdi: 11, seed: [0, 0, R * H], walls: [] }], [0, 0, 1], R * H, R * H - 0.05)!;
    expect(seg).not.toBeNull();
    let wrong = 0, crown = 0;
    for (let i = 0; i < seg.tris.length; i += 1) {
      const o = seg.tris[i] * 9;
      const cx = (scan[o] + scan[o + 3] + scan[o + 6]) / 3, cy = (scan[o + 1] + scan[o + 4] + scan[o + 7]) / 3;
      // Within one ring of the scan's triangles of the crease (it runs through them, not along their edges).
      const onTooth = Math.hypot(cx, cy) < R - 0.5, onGum = Math.hypot(cx, cy) > R + 0.2;
      if (seg.labels[i] === 11) crown += 1;
      if ((onTooth && seg.labels[i] !== 11) || (onGum && seg.labels[i] === 11)) wrong += 1;
    }
    expect(crown).toBeGreaterThan(200);
    expect(wrong).toBe(0);
  });
});

describe("RadialMap", () => {
  it("reads the library surface's distance in each direction", () => {
    const map = new RadialMap([0, 0, 0.3], library);
    expect(map.at([1, 0, 0])).toBeCloseTo(3, 0);
    expect(map.at([0, 0, 1])).toBeCloseTo(5, 0);
  });
});

describe("shellScan", () => {
  const seg = segmentFront(scan, [{ fdi: 11, seed: [0, 0, R * H], walls: [] }], [0, 0, 1], R * H, R * H - 0.05)!;
  const { soup } = shellScan(scan, seg, new Map([[11, { soup: library }]]));

  it("leaves the gum exactly as scanned and moves the crown out onto the library tooth", () => {
    let top = 0;
    for (let i = 0; i < soup.length; i += 3) {
      const r = Math.hypot(soup[i], soup[i + 1]);
      if (r > R + 0.3) expect(soup[i + 2]).toBe(0);
      top = Math.max(top, soup[i + 2]);
    }
    // The dome's top (4 mm) is now the library tooth's (5.3 mm), give or take where the crown's middle is.
    expect(top).toBeGreaterThan(R * H + 0.8);
  });

  it("never moves the crown inwards, and is as closed as the scan was (no cracks at the margin)", () => {
    const edges = (s: Float32Array) => {
      const count = new Map<string, number>();
      const k = (i: number) => `${s[i].toFixed(3)},${s[i + 1].toFixed(3)},${s[i + 2].toFixed(3)}`;
      for (let i = 0; i < s.length; i += 9) for (let e = 0; e < 3; e += 1) { const a = k(i + e * 3), b = k(i + ((e + 1) % 3) * 3); const id = a < b ? a + "|" + b : b + "|" + a; count.set(id, (count.get(id) ?? 0) + 1); }
      let open = 0; for (const c of count.values()) if (c === 1) open += 1;
      return open;
    };
    expect(edges(soup)).toBe(edges(scan));
    for (let i = 0; i < soup.length; i += 3) expect(soup[i + 2]).toBeGreaterThanOrEqual(-1e-6);
  });
});
