import { describe, expect, it } from "vitest";
import { loosePieces, sculptMeshOf } from "@/lib/meshSculpt";

/** Build 267: the scan's loose pieces - every triangle not joined to its biggest piece - found for one-click removal. */

/** A flat grid of n x n squares (two triangles each) at x offset `ox`, as a soup. */
function sheet(n: number, ox: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
    const a = [ox + i, j, 0], b = [ox + i + 1, j, 0], c = [ox + i + 1, j + 1, 0], d = [ox + i, j + 1, 0];
    out.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  return out;
}

describe("loose pieces of a scan", () => {
  it("chooses the islands and nothing of the biggest piece", () => {
    const main = sheet(10, 0), island = sheet(2, 50), speck = sheet(1, 80);
    const mesh = sculptMeshOf([...main, ...island, ...speck]);
    const chosen = loosePieces(mesh);
    const mainTris = main.length / 9, total = chosen.length;
    expect(total).toBe((main.length + island.length + speck.length) / 9);
    // The welded copy keeps the soup's order: the first 200 are the main sheet.
    for (let t = 0; t < mainTris; t += 1) expect(chosen[t]).toBe(0);
    for (let t = mainTris; t < total; t += 1) expect(chosen[t]).toBe(1);
  });

  it("chooses nothing on a scan in one piece", () => {
    const chosen = loosePieces(sculptMeshOf(sheet(6, 0)));
    expect(chosen.some((c) => c)).toBe(false);
  });
});
