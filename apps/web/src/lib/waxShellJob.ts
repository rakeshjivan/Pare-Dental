/**
 * Build 283: the wax-up model's front teeth (lib/waxShell) worked out off the page's own thread. The crowns found on
 * the scan are kept in the worker for as long as the scan and the marks stay the same (`segKey`), so moving a tooth
 * only redoes the move.
 */
import { segmentFront, shellScan, type FrontSegmentation, type ShellToothSpec } from "@/lib/waxShell";

export type ShellJob = {
  segKey: string;
  scan: Float32Array;
  specs: ShellToothSpec[];
  up: [number, number, number];
  edgeLevel: number;
  library: Array<{ fdi: number; soup: Float32Array; reduce?: boolean }>;
};
export type ShellResult = { soup: Float32Array; proud: Record<number, number>; crowns: number } | null;
export type ShellJobMessage = { jobId: number; job: ShellJob };
export type ShellJobReply = { jobId: number; result: ShellResult } | { jobId: number; error: string };

let cached: { key: string; seg: FrontSegmentation | null } | null = null;

/** The job done here (in the worker, or on the page where a worker cannot start). */
export function runShellJob(job: ShellJob): ShellResult {
  if (!cached || cached.key !== job.segKey) {
    // The crowns are looked for near the ideal teeth as first laid (the key holds while the marks and scan do).
    const ideal = new Map(job.library.map((tooth) => [tooth.fdi, tooth.soup]));
    cached = { key: job.segKey, seg: segmentFront(job.scan, job.specs.map((spec) => ({ ...spec, ideal: ideal.get(spec.fdi) })), job.up, job.edgeLevel, 13) };
  }
  const seg = cached.seg;
  if (!seg || !seg.teeth.size) return null;
  const library = new Map(job.library.map((tooth) => [tooth.fdi, { soup: tooth.soup, reduce: tooth.reduce }]));
  const { soup, proud } = shellScan(job.scan, seg, library);
  return { soup, proud, crowns: seg.teeth.size };
}

let worker: Worker | null = null;
let broken = false;
let nextJob = 1;
const pending = new Map<number, { resolve: (result: ShellResult) => void; reject: (error: Error) => void }>();

function workerFor(): Worker | null {
  if (broken || typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("../workers/waxShell.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<ShellJobReply>) => {
      const reply = event.data, job = pending.get(reply.jobId);
      if (!job) return;
      pending.delete(reply.jobId);
      if ("error" in reply) job.reject(new Error(reply.error)); else job.resolve(reply.result);
    };
    worker.onerror = () => {
      broken = true;
      for (const [id, job] of pending) { pending.delete(id); job.reject(new Error("shell worker failed")); }
      worker = null;
    };
    return worker;
  } catch {
    broken = true;
    return null;
  }
}

export function shellInBackground(job: ShellJob): Promise<ShellResult> {
  const w = workerFor();
  if (!w) return Promise.resolve(runShellJob(job));
  const jobId = nextJob++;
  return new Promise((resolve, reject) => {
    pending.set(jobId, { resolve, reject });
    w.postMessage({ jobId, job } satisfies ShellJobMessage, [job.scan.buffer, ...job.library.map((tooth) => tooth.soup.buffer)]);
  });
}
