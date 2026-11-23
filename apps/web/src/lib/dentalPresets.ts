/**
 * Build 126 (Rakesh): user presets for Model Builder. A dentist who always wants the same model saves
 * their settings once, names them, and picks them on a new case (or sets one as the default, applied
 * automatically). A preset is a device-local snapshot of the model settings - never the case's own
 * scans, label or midline, which belong to each case. Stored in localStorage like the other per-device
 * settings (recentColors, fitTest, autoBackup); no server, nothing patient-specific.
 */
import type { DentalStudioOptions } from "@/lib/dentalModel";

/** The base shape a preset starts from, matching the built-in choices in the panel. */
export type DentalPresetBase = "study" | "ortho" | "aligner";

/** The settings a preset carries: every model option except the ones that belong to a single case. */
export type DentalPresetOptions = Partial<DentalStudioOptions>;

export type DentalUserPreset = {
  name: string;
  base: DentalPresetBase;
  options: DentalPresetOptions;
};

type PresetStore = { presets: DentalUserPreset[]; default: string | null };

const STORAGE_KEY = "pare.dental.presets";
const MAX_PRESETS = 24;
const MAX_NAME = 40;
/** Case-specific fields never saved in a preset - they belong to each case, not the recipe. */
const CASE_FIELDS = ["label", "midlineMark", "midlineScan"] as const;

const EMPTY: PresetStore = { presets: [], default: null };

function isBase(value: unknown): value is DentalPresetBase {
  return value === "study" || value === "ortho" || value === "aligner";
}

/** The model options stripped of anything case-specific, ready to store in a preset. */
export function presetOptionsFrom(options: DentalStudioOptions): DentalPresetOptions {
  const copy: Record<string, unknown> = { ...options };
  for (const field of CASE_FIELDS) delete copy[field];
  return copy as DentalPresetOptions;
}

function cleanPreset(value: unknown): DentalUserPreset | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim().slice(0, MAX_NAME) : "";
  if (!name) return null;
  if (!isBase(record.base)) return null;
  const options = record.options && typeof record.options === "object" ? (record.options as Record<string, unknown>) : {};
  const cleaned: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(options)) {
    if ((CASE_FIELDS as readonly string[]).includes(key)) continue;
    cleaned[key] = val;
  }
  return { name, base: record.base, options: cleaned as DentalPresetOptions };
}

function readStore(): PresetStore {
  if (typeof window === "undefined") return { ...EMPTY };
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return { ...EMPTY };
    const record = parsed as Record<string, unknown>;
    const presets: DentalUserPreset[] = [];
    const seen = new Set<string>();
    for (const entry of Array.isArray(record.presets) ? record.presets : []) {
      const preset = cleanPreset(entry);
      if (!preset) continue;
      const key = preset.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      presets.push(preset);
      if (presets.length >= MAX_PRESETS) break;
    }
    const fallback = typeof record.default === "string" ? record.default : null;
    const def = fallback && presets.some((preset) => preset.name === fallback) ? fallback : null;
    return { presets, default: def };
  } catch {
    return { ...EMPTY };
  }
}

function writeStore(store: PresetStore): PresetStore {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      // storage full or blocked: presets are a convenience, so a failed save is not fatal.
    }
  }
  return store;
}

export function listDentalPresets(): DentalUserPreset[] {
  return readStore().presets;
}

export function defaultDentalPresetName(): string | null {
  return readStore().default;
}

/** The default preset's full record, or null if none is set. */
export function defaultDentalPreset(): DentalUserPreset | null {
  const store = readStore();
  return store.presets.find((preset) => preset.name === store.default) ?? null;
}

export function findDentalPreset(name: string): DentalUserPreset | null {
  const key = name.trim().toLowerCase();
  return readStore().presets.find((preset) => preset.name.toLowerCase() === key) ?? null;
}

/** Save (or replace, by name ignoring case) a preset. Returns the preset list afterwards. */
export function saveDentalPreset(name: string, base: DentalPresetBase, options: DentalPresetOptions): DentalUserPreset[] {
  const clean = cleanPreset({ name, base, options });
  if (!clean) return listDentalPresets();
  const store = readStore();
  const key = clean.name.toLowerCase();
  const rest = store.presets.filter((preset) => preset.name.toLowerCase() !== key);
  if (rest.length >= MAX_PRESETS) rest.length = MAX_PRESETS - 1;
  return writeStore({ presets: [...rest, clean], default: store.default ?? clean.name }).presets;
}

export function deleteDentalPreset(name: string): DentalUserPreset[] {
  const store = readStore();
  const key = name.trim().toLowerCase();
  const presets = store.presets.filter((preset) => preset.name.toLowerCase() !== key);
  const def = store.default && store.default.toLowerCase() === key ? null : store.default;
  return writeStore({ presets, default: def }).presets;
}

/** Set (or clear, with null) which preset is applied automatically to a new case. */
export function setDefaultDentalPreset(name: string | null): void {
  const store = readStore();
  if (name === null) {
    writeStore({ ...store, default: null });
    return;
  }
  const match = store.presets.find((preset) => preset.name.toLowerCase() === name.trim().toLowerCase());
  writeStore({ ...store, default: match ? match.name : store.default });
}
