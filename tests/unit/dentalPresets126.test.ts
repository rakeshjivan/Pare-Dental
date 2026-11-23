import { beforeEach, describe, expect, it } from "vitest";

// The unit suite runs in node; give the module the window.localStorage it expects.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string) { this.store.set(key, String(value)); }
  removeItem(key: string) { this.store.delete(key); }
  clear() { this.store.clear(); }
}
(globalThis as unknown as { window: unknown }).window = { localStorage: new MemoryStorage() };
import {
  deleteDentalPreset, defaultDentalPreset, defaultDentalPresetName, findDentalPreset,
  listDentalPresets, presetOptionsFrom, saveDentalPreset, setDefaultDentalPreset,
} from "@/lib/dentalPresets";
import type { DentalStudioOptions } from "@/lib/dentalModel";

// Build 126: device-local Model Builder presets. jsdom gives us a real localStorage.
const options = (over: Partial<DentalStudioOptions> = {}): DentalStudioOptions => ({
  label: "Patient A", keep: null, base: 3, baseStyle: "clean", inside: "open", wall: 3, hinge: false,
  midlineMark: [1, 2, 3], midlineScan: "upper", ...over,
} as DentalStudioOptions);

describe("Model Builder user presets (build 126)", () => {
  beforeEach(() => window.localStorage.clear());

  it("saves a preset without any case-specific fields", () => {
    saveDentalPreset("My study", "study", presetOptionsFrom(options({ base: 4, wall: 2.5 })));
    const saved = findDentalPreset("My study");
    expect(saved?.base).toBe("study");
    expect(saved?.options.base).toBe(4);
    expect(saved?.options.wall).toBe(2.5);
    expect("label" in (saved?.options ?? {})).toBe(false);
    expect("midlineMark" in (saved?.options ?? {})).toBe(false);
    expect("midlineScan" in (saved?.options ?? {})).toBe(false);
  });

  it("replaces a preset of the same name (case-insensitive) rather than duplicating", () => {
    saveDentalPreset("Ortho", "ortho", presetOptionsFrom(options({ base: 6 })));
    saveDentalPreset("ortho", "ortho", presetOptionsFrom(options({ base: 9 })));
    const all = listDentalPresets();
    expect(all).toHaveLength(1);
    expect(all[0].options.base).toBe(9);
  });

  it("makes the first saved preset the default, and lets the default change and clear", () => {
    saveDentalPreset("One", "study", {});
    expect(defaultDentalPresetName()).toBe("One");
    saveDentalPreset("Two", "ortho", {});
    expect(defaultDentalPresetName()).toBe("One");
    setDefaultDentalPreset("Two");
    expect(defaultDentalPreset()?.name).toBe("Two");
    setDefaultDentalPreset(null);
    expect(defaultDentalPresetName()).toBeNull();
  });

  it("clears the default when the default preset is deleted", () => {
    saveDentalPreset("Keep", "study", {});
    saveDentalPreset("Gone", "ortho", {});
    setDefaultDentalPreset("Gone");
    deleteDentalPreset("Gone");
    expect(findDentalPreset("Gone")).toBeNull();
    expect(defaultDentalPresetName()).toBeNull();
    expect(listDentalPresets()).toHaveLength(1);
  });

  it("ignores a rubbish or empty name", () => {
    saveDentalPreset("   ", "study", {});
    expect(listDentalPresets()).toHaveLength(0);
  });

  it("survives corrupt storage and bad entries", () => {
    window.localStorage.setItem("pare.dental.presets", "not json");
    expect(listDentalPresets()).toEqual([]);
    window.localStorage.setItem("pare.dental.presets", JSON.stringify({ presets: [{ name: "ok", base: "study", options: {} }, { base: "ortho" }, { name: "bad", base: "nope" }], default: "missing" }));
    const all = listDentalPresets();
    expect(all.map((preset) => preset.name)).toEqual(["ok"]);
    expect(defaultDentalPresetName()).toBeNull();
  });
});
