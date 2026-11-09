import { describe, expect, it } from "vitest";
import { classNumber, cleanRegions, numberTeeth, transferLabels, toothColour } from "@/lib/toothSegment";
import { archOrder } from "@/components/workplane/WaxupCard";
import { fdiKind, fdiNumber } from "@/lib/dentalWaxup";

/* Build 94: numbering and cleaning teeth from labels. Build 277: the tooth finder network itself is removed. */

const rand = (seed: number) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

describe("numbering the teeth", () => {
  // Eight teeth a side round a U, network votes given.
  const arch = (votes: number[][]) => votes.map((v, k) => {
    const side = k < votes.length / 2 ? -1 : 1, i = side < 0 ? votes.length / 2 - 1 - k : k - votes.length / 2;
    const a = side * (0.15 + i * 0.25);
    const centre: [number, number, number] = [Math.sin(a) * 25, -Math.cos(a) * 25 + 10, 0];
    const votesArr = new Float64Array(9); v.forEach((n) => { votesArr[n] += 1; });
    return { centre, votes: votesArr, area: i >= 5 ? 220 : 100 };
  });
  it("numbers out from the midline, upper right at +x", () => {
    const teeth = arch([[7], [6], [5], [4], [3], [2], [1], [1], [2], [3], [4], [5], [6], [7]]);
    const out = numberTeeth(teeth, "upper");
    // +x side (second half) is the upper right: 11..17.
    expect(out.slice(7).map((o) => o.fdi)).toEqual([11, 12, 13, 14, 15, 16, 17]);
    expect(out.slice(0, 7).map((o) => o.fdi)).toEqual([27, 26, 25, 24, 23, 22, 21]);
  });
  it("puts a repeated number right by its place", () => {
    // The network calls two neighbours 5 on the lower left.
    const teeth = arch([[6], [5], [5], [4], [3], [2], [1], [1], [2], [3], [4], [5], [6], [7]]);
    const out = numberTeeth(teeth, "lower");
    const left = out.slice(7).map((o) => o.fdi);
    expect(new Set(left).size).toBe(left.length);
    for (let k = 1; k < left.length; k += 1) expect(left[k]).toBeGreaterThan(left[k - 1]);
    expect(Math.floor(left[0] / 10)).toBe(3);
  });
});

describe("cleaning the network's labels", () => {
  it("joins a small island to what surrounds it", () => {
    // A strip of 20 triangles: 0-9 class 1, 10-19 class 2, with triangle 4 wrongly class 3.
    const count = 20, classes = 19;
    const prob = new Float32Array(count * classes);
    for (let t = 0; t < count; t += 1) prob[t * classes + (t === 4 ? 3 : t < 10 ? 1 : 2)] = 1;
    const nb = Array.from({ length: count }, (_, t) => [t - 1, t + 1].filter((o) => o >= 0 && o < count).map((o) => [o, 1] as [number, number]));
    const areas = new Float32Array(count).fill(2);
    const { region, regions } = cleanRegions(prob, classes, count, areas, nb);
    expect(regions).toBe(2);
    expect(region[4]).toBe(region[0]);
  });
  it("maps classes to tooth numbers", () => {
    expect([0, 1, 8, 9, 16, 17].map(classNumber)).toEqual([0, 1, 8, 1, 8, 0]);
  });
});

describe("tooth finder helpers", () => {
  it("carries labels to another tiling of the surface", () => {
    const from = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 5, 0, 0, 6, 0, 0, 5, 1, 0]);
    const out = transferLabels(from, Uint8Array.from([11, 21]), Float32Array.from([5.1, 0, 0, 5.9, 0, 0, 5.1, 0.9, 0]));
    expect(Array.from(out)).toEqual([21]);
  });
  it("orders chips round the arch and colours teeth apart", () => {
    expect([21, 11, 12, 22].sort((a, b) => archOrder(a) - archOrder(b))).toEqual([12, 11, 21, 22]);
    expect(toothColour(11)).not.toEqual(toothColour(21));
  });
});

describe("fitting to the teeth found", () => {
  it("reads kind and side back from an FDI number", () => {
    for (const arch of ["upper", "lower"] as const) for (const q of arch === "upper" ? [1, 2] : [3, 4]) for (let n = 1; n <= 8; n += 1) {
      const { kind, side } = fdiKind(q * 10 + n, arch);
      expect(fdiNumber(kind, side, arch)).toBe(q * 10 + n);
    }
  });
});

describe("tooth sets the right way up", () => {
  it("every shipped set has its incisors' wide incisal third at the top (the edge), both arches", async () => {
    const { readFileSync, readdirSync, existsSync } = await import("node:fs");
    const { librarySet } = await import("@/lib/dentalWaxup");
    const { decodeToothSet } = await import("@/lib/toothLibrary");
    // Build 122: every library that ships (only Pare's since the others were removed).
    const shipped = readdirSync("apps/web/public/libraries").filter((lib) => existsSync(`apps/web/public/libraries/${lib}/manifest.json`));
    expect(shipped.length).toBeGreaterThan(0);
    for (const lib of shipped) {
      const manifest = JSON.parse(readFileSync(`apps/web/public/libraries/${lib}/manifest.json`, "utf8")) as { sets: Array<{ id: string; file: string }> };
      for (const entry of manifest.sets) {
        const set = librarySet(entry.id, decodeToothSet(readFileSync(`apps/web/public/libraries/${lib}/${entry.file}`)));
        for (const t of set.teeth.filter((x) => x.kind === "central")) {
          const p = t.positions;
          let top = -Infinity, bottom = Infinity;
          for (let i = 2; i < p.length; i += 3) { top = Math.max(top, p[i]); bottom = Math.min(bottom, p[i]); }
          const h = top - bottom;
          const width = (z0: number, z1: number) => { let a = Infinity, b = -Infinity; for (let i = 0; i < p.length; i += 3) if (p[i + 2] >= z0 && p[i + 2] <= z1) { a = Math.min(a, p[i]); b = Math.max(b, p[i]); } return b - a; };
          expect(width(top - 0.3 * h, top), entry.id).toBeGreaterThan(width(bottom, bottom + 0.3 * h));
        }
      }
    }
  });
});

describe("smile design on the teeth found", () => {
  it("sets out the front teeth symmetric, natural width steps, a level edge and the smile arc", async () => {
    const { smileTargets } = await import("@/lib/dentalWaxup");
    // Crowns as clouds round y = -25 + 0.04 x^2, a little asymmetric (the patient's), teeth up.
    const crown = (fdi: number, x0: number, x1: number, top: number) => {
      const pts: number[] = [];
      for (let x = x0; x <= x1; x += 0.25) for (let z = top - 9; z <= top; z += 0.5) pts.push(x, -25 + 0.04 * x * x + (z > top - 4 ? 0 : 0.5), z);
      return { fdi, points: Float32Array.from(pts) };
    };
    const crowns = [crown(11, 0.2, 8.6, 0.2), crown(12, 8.8, 15.2, -0.6), crown(13, 15.4, 22, -0.5), crown(21, -8.9, -0.2, 0), crown(22, -15.6, -9.1, -0.4), crown(23, -22.3, -15.8, -0.8)];
    const t = smileTargets(crowns, "upper")!;
    expect(t).not.toBeNull();
    const w = (n: number) => t.get(n)!.width;
    expect(w(11)).toBeCloseTo(w(21), 6);
    expect(w(11) - w(12)).toBeCloseTo(2, 1);
    expect(w(11) - w(13)).toBeCloseTo(1, 1);
    expect(t.get(11)!.edge).toBeCloseTo(t.get(21)!.edge, 6);
    expect(t.get(11)!.edge - t.get(12)!.edge).toBeCloseTo(1, 6);
    // Symmetric about the midline: each pair as far from the centrals' middle (build 103: the design is
    // squared to the front teeth, so the midline need not run along the frame's axis).
    const mx = (t.get(11)!.at[0] + t.get(21)!.at[0]) / 2, my = (t.get(11)!.at[1] + t.get(21)!.at[1]) / 2;
    const from = (fdi: number) => Math.hypot(t.get(fdi)!.at[0] - mx, t.get(fdi)!.at[1] - my);
    expect(from(13)).toBeCloseTo(from(23), 6);
    expect(from(12)).toBeCloseTo(from(22), 6);
    // In front of every crown point (the wax only adds).
    for (const v of t.values()) expect(v.at[1]).toBeLessThan(-25 + 0.04 * v.at[0] * v.at[0]);
    // RED: apparent widths in proportion.
    const r = smileTargets(crowns, "upper", { red: 0.7 })!;
    expect(r.get(12)!.apparent / r.get(11)!.apparent).toBeCloseTo(0.7, 6);
  });
});
