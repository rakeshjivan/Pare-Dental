/**
 * Build 133 (Rakesh: the Mark step still froze after the LOD, coarse-gum and decimation fixes, so this measures
 * where the main thread actually goes as Mark opens). A tiny, dependency-free profiler: `timeMark(label, fn)` times a
 * synchronous block and records it if it runs long; a longtask observer catches any long main-thread task that is not
 * wrapped (a runaway effect loop shows as a stream of them). The wax studio renders the list, so the readout is on
 * screen with no dev console. Remove once the freeze is found.
 */
export type MarkSlow = { label: string; ms: number; at: number };

const SLOW: MarkSlow[] = [];
const KEEP = 24;
/** A block this long (ms) is worth seeing. */
const FLOOR = 25;

export function recordSlow(label: string, ms: number): void {
  if (ms < FLOOR) return;
  SLOW.unshift({ label, ms: Math.round(ms), at: Date.now() });
  if (SLOW.length > KEEP) SLOW.length = KEEP;
}

const PHASE_KEY = "pareMarkPhase";

/** A breadcrumb written before a block runs and cleared after. If the block hangs the thread for good, the breadcrumb
 * survives a reload - so the overlay can name the block it died in even when nothing ever repaints. */
function beginPhase(label: string): void {
  try { window.localStorage.setItem(PHASE_KEY, `${label} @ ${new Date().toLocaleTimeString()}`); } catch { /* storage off */ }
}
function endPhase(): void {
  try { window.localStorage.removeItem(PHASE_KEY); } catch { /* storage off */ }
}
/** The block that was running when the page last stopped (survived a reload), or null if it finished cleanly. */
export function stuckPhase(): string | null {
  try { return window.localStorage.getItem(PHASE_KEY); } catch { return null; }
}
export function clearStuckPhase(): void { endPhase(); }

/** Times a synchronous block; records it when it runs long, and leaves a breadcrumb in case it hangs for good. */
export function timeMark<T>(label: string, fn: () => T): T {
  const t0 = performance.now();
  beginPhase(label);
  try { return fn(); } finally { endPhase(); recordSlow(label, performance.now() - t0); }
}

export function markSlowEntries(): ReadonlyArray<MarkSlow> {
  return SLOW;
}

export function clearMarkSlow(): void {
  SLOW.length = 0;
}

let observing = false;
/** Watches for long main-thread tasks the wrapped blocks did not catch (a loop shows as many in a row). */
export function watchLongTasks(): void {
  if (observing || typeof PerformanceObserver === "undefined") return;
  observing = true;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (entry.duration >= FLOOR) recordSlow("(longtask)", entry.duration);
    });
    observer.observe({ entryTypes: ["longtask"] });
  } catch { observing = false; }
}
