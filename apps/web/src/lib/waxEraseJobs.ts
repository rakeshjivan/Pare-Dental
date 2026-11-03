/**
 * Build 116: Wax-up Studio's trim (lib/waxErase) off the page's own thread - each tooth in a worker of its own, from a
 * pool as large as the machine allows (two cores kept for the page), so the view never waits on it and six teeth are
 * trimmed at once. Where workers cannot be started the trim is done here, as before.
 */
import type { Vec3 } from "@/lib/waxMargin";
import type { ToothAxes, ToothErase } from "@/lib/waxErase";

/** A closed margin as plain data (its surfaces as triangle soups, rebuilt in the worker). */
export type EraseMarginData = { soup: Float32Array; inside: Uint8Array; line: Vec3[]; gum?: Vec3[]; onGum?: Uint8Array; gumSoup?: Float32Array };
export type EraseJob = { own: Float32Array; axes: ToothAxes; paint: ToothErase; near: Float32Array; margin: EraseMarginData | null };
export type EraseJobMessage = EraseJob & { jobId: number };
export type EraseJobReply = { jobId: number; soup: Float32Array | null; ms: number } | { jobId: number; error: string };

type Slot = { worker: Worker; busy: number };
/** For checks: trims done in the workers, and their time (ms, summed). */
const stats = { done: 0, ms: 0, workers: 0 };
if (typeof window !== "undefined") (window as unknown as { layerlingEraseWorkers?: () => unknown }).layerlingEraseWorkers = () => ({ ...stats, workers: slots.length, broken, pool: erasePoolSize() });
const slots: Slot[] = [];
let broken = false;
let nextJob = 1;
const pending = new Map<number, { resolve: (soup: Float32Array | null) => void; reject: (error: Error) => void; slot: Slot }>();

/** How many trims run at once: the machine's cores less two (for the page and the view), 2 to 8. */
export function erasePoolSize(): number {
  const cores = typeof navigator !== "undefined" && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
  return Math.max(2, Math.min(8, cores - 2));
}

function slotFor(): Slot | null {
  if (broken || typeof Worker === "undefined") return null;
  if (slots.length < erasePoolSize()) {
    try {
      const worker = new Worker(new URL("../workers/waxErase.worker.ts", import.meta.url), { type: "module" });
      const slot: Slot = { worker, busy: 0 };
      worker.onmessage = (event: MessageEvent<EraseJobReply>) => {
        const reply = event.data, job = pending.get(reply.jobId);
        if (!job) return;
        pending.delete(reply.jobId);
        job.slot.busy -= 1;
        if ("error" in reply) job.reject(new Error(reply.error)); else { stats.done += 1; stats.ms += reply.ms; job.resolve(reply.soup); }
      };
      worker.onerror = () => {
        // A worker that will not run: its jobs fail (and are done on the page instead), and no more are made.
        broken = true;
        for (const [id, job] of pending) if (job.slot === slot) { pending.delete(id); job.reject(new Error("erase worker failed")); }
      };
      slots.push(slot);
    } catch {
      broken = true;
      return null;
    }
  }
  return slots.reduce((best, slot) => (slot.busy < best.busy ? slot : best), slots[0]);
}

/** One tooth trimmed in a worker; rejects where no worker can run it (the caller then trims it here). */
export function eraseInBackground(job: EraseJob): Promise<Float32Array | null> {
  const slot = slotFor();
  if (!slot) return Promise.reject(new Error("no erase worker"));
  const jobId = nextJob++;
  slot.busy += 1;
  return new Promise((resolve, reject) => {
    pending.set(jobId, { resolve, reject, slot });
    // Copies go across (the page keeps its own): the scan near the tooth, the tooth, the margin.
    slot.worker.postMessage({ ...job, jobId } satisfies EraseJobMessage);
  });
}

/** Build 116: the workers closed (their memory given back) - they start again when next needed. */
export function closeEraseWorkers() {
  for (const slot of slots.splice(0)) { try { slot.worker.terminate(); } catch { /* gone */ } }
  for (const [id, job] of pending) { pending.delete(id); job.reject(new Error("erase workers closed")); }
}
