import { WAXUP_ENABLED } from "@/lib/pareFeatures";

/**
 * Build 107: CAD Studio's fresh look (white bars, quiet grey ribbon labels, teal accent, floating
 * cards). It is a data attribute on <html> - `data-look="studio"` - that app/studioLook.css styles;
 * nothing moves and no tool changes. On by default in test builds, off in the live one, and
 * switchable in Settings either way.
 */
export const STUDIO_LOOK_STORAGE_KEY = "pare.studioLook";
export type StudioLook = "studio" | "classic";
export const STUDIO_LOOK_DEFAULT: StudioLook = WAXUP_ENABLED ? "studio" : "classic";

export function normalizeStudioLook(value: unknown): StudioLook {
  return value === "studio" || value === "classic" ? value : STUDIO_LOOK_DEFAULT;
}

export function applyStudioLook(look: StudioLook) {
  if (typeof document === "undefined") return;
  if (look === "studio") document.documentElement.dataset.look = "studio";
  else delete document.documentElement.dataset.look;
}

/** Runs in <head> before the page paints, so the page does not flash the other look first. */
export const STUDIO_LOOK_BOOT_SCRIPT = `try{var l=localStorage.getItem(${JSON.stringify(STUDIO_LOOK_STORAGE_KEY)});if(l!=="studio"&&l!=="classic")l=${JSON.stringify(STUDIO_LOOK_DEFAULT)};if(l==="studio")document.documentElement.dataset.look="studio"}catch(e){}`;

function readStoredStudioLook(): StudioLook {
  try {
    return normalizeStudioLook(window.localStorage.getItem(STUDIO_LOOK_STORAGE_KEY));
  } catch {
    return STUDIO_LOOK_DEFAULT;
  }
}

const listeners = new Set<() => void>();
let current: StudioLook = typeof window !== "undefined" ? readStoredStudioLook() : STUDIO_LOOK_DEFAULT;

export function setStudioLook(look: StudioLook) {
  current = look;
  try {
    window.localStorage.setItem(STUDIO_LOOK_STORAGE_KEY, look);
  } catch {
    // The look still applies for this session when storage is unavailable.
  }
  applyStudioLook(look);
  listeners.forEach((listener) => listener());
}

export function getStudioLook(): StudioLook {
  return current;
}

/** Whether the page is showing the fresh look right now (the attribute is the truth). */
export function studioLookActive(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.look === "studio";
}

export function subscribeToStudioLook(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
