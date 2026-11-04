/// <reference lib="webworker" />
/** Build 118: the patient's palatal pressed onto the wax teeth (lib/waxPalatal) away from the page - see lib/waxPalatalJob. */
import { pressPalatal } from "@/lib/waxPalatal";
import type { PalatalJobMessage, PalatalJobReply } from "@/lib/waxPalatalJob";

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (event: MessageEvent<PalatalJobMessage>) => {
  const job = event.data;
  try {
    const { positions, moved } = pressPalatal(job.scan, job.teeth);
    const soup = moved ? positions : null;
    scope.postMessage({ jobId: job.jobId, soup } satisfies PalatalJobReply, soup ? [soup.buffer] : []);
  } catch (error) {
    scope.postMessage({ jobId: job.jobId, error: error instanceof Error ? error.message : String(error) } satisfies PalatalJobReply);
  }
};
