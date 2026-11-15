import { describe, expect, it } from "vitest";
import { LiveMesh, stampBrush } from "@/lib/liveSculpt";

/* Pare Dental: Finishing touches on a made model - the frozen part (its base) does not move under a brush. */
describe("LiveMesh.freezeWhere", () => {
  // A flat sheet z = 0 over x, y in [0, 10], in 0.5 mm triangles.
  const soup: number[] = [];
  for (let x = 0; x < 10; x += 0.5) for (let y = 0; y < 10; y += 0.5) soup.push(x, y, 0, x + 0.5, y, 0, x + 0.5, y + 0.5, 0, x, y, 0, x + 0.5, y + 0.5, 0, x, y + 0.5, 0);
  it("freezes the corners asked for, and a brush leaves them where they are", () => {
    const live = LiveMesh.fromSoup(soup);
    const frozen = live.freezeWhere((x) => x < 5);
    expect(frozen).toBeGreaterThan(0);
    const before = Array.from(live.frozenPoints());
    for (let i = 0; i < 5; i += 1) stampBrush(live, "draw", [5, 5, 0], [0, 0, 1], 3, -1, 0.8, false);
    // Every frozen corner exactly where it was (the free ones beside them may lean over them).
    expect(Array.from(live.frozenPoints())).toEqual(before);
    const out = live.soup();
    let movedFree = 0;
    for (let i = 0; i < out.length; i += 3) if (Math.abs(out[i + 2]) > 1e-6) movedFree += 1;
    expect(movedFree).toBeGreaterThan(0);
  });
});
