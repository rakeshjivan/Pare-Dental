import { describe, expect, it } from "vitest";
import { boundedEditorHistoryState, firstEntryWithinMeshBudget, type EditorHistoryEntry } from "@/lib/editorHistory";
import type { WorkplaneShape } from "@/types/layerling";

const scan = (n: number) => ({ id: "scan", importedMesh: { positions: new Array(n).fill(0), normals: new Array(n).fill(0) } }) as unknown as WorkplaneShape;
const entry = (shapes: WorkplaneShape[]): EditorHistoryEntry => ({ shapes, selectedIds: [], fingerprint: Math.random().toString() } as unknown as EditorHistoryEntry);

describe("build 107: the history's mesh budget", () => {
  it("lets go of the oldest copies of a big scan, keeping at least three undo steps", () => {
    // Each step a new copy of a full-arch scan (3.1 million numbers each for positions and normals: ~50 MB).
    const entries = Array.from({ length: 30 }, () => entry([scan(3_100_000)]));
    const state = boundedEditorHistoryState(entries, entries.length - 1, 100);
    expect(state.entries.length).toBeGreaterThanOrEqual(4);
    expect(state.entries.length).toBeLessThan(10);
    expect(state.entries[state.index]).toBe(entries[29]);
  });

  it("counts a scan shared by many steps once", () => {
    const shared = scan(3_100_000);
    const entries = Array.from({ length: 60 }, () => entry([shared]));
    expect(firstEntryWithinMeshBudget(entries, 59)).toBe(0);
  });

  it("keeps the redo steps after the current one", () => {
    const entries = Array.from({ length: 20 }, () => entry([scan(3_100_000)]));
    const state = boundedEditorHistoryState(entries, 15, 100);
    expect(state.entries[state.entries.length - 1]).toBe(entries[19]);
    expect(state.entries[state.index]).toBe(entries[15]);
    expect(state.index).toBeGreaterThanOrEqual(3);
  });
});
