/**
 * Build 118: the library tooth's palatal form worked out off the page's own thread, so Position, Sculpt and the bite
 * show it live without the view waiting. One worker; a newer job for the same scan makes an older one's answer moot
 * (the caller keys them). Where a worker cannot start, it is worked out here.
 */
import { pressPalatal, type PalatalTooth } from "@/lib/waxPalatal";

export type PalatalJobMessage = { jobId: number; scan: Float32Array; teeth: PalatalTooth[] };
export type PalatalJobReply = { jobId: number; soup: Float32Array | null } | { jobId: number; error: string };

let worker: Worker | null = null;
let broken = false;
let nextJob = 1;
const pending = new Map<number, { resolve: (soup: Float32Array | null) => void; reject: (error: Error) => void }>();

function workerFor(): Worker | null {
  if (broken || typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("../workers/waxPalatal.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<PalatalJobReply>) => {
      const reply = event.data, job = pending.get(reply.jobId);
      if (!job) return;
      pending.delete(reply.jobId);
      if ("error" in reply) job.reject(new Error(reply.error)); else job.resolve(reply.soup);
    };
    worker.onerror = () => {
      broken = true;
      for (const [id, job] of pending) { pending.delete(id); job.reject(new Error("palatal worker failed")); }
      worker = null;
    };
    return worker;
  } catch {
    broken = true;
    return null;
  }
}

/** The scan (world triangles) with its palatal pressed onto the teeth; null when nothing moved. */
export function palatalInBackground(scan: Float32Array, teeth: PalatalTooth[]): Promise<Float32Array | null> {
  const w = workerFor();
  if (!w) { const r = pressPalatal(scan, teeth); return Promise.resolve(r.moved ? r.positions : null); }
  const jobId = nextJob++;
  return new Promise((resolve, reject) => {
    pending.set(jobId, { resolve, reject });
    w.postMessage({ jobId, scan, teeth } satisfies PalatalJobMessage, [scan.buffer]);
  });
}
