/// <reference lib="webworker" />
/** Build 116: one wax tooth trimmed (lib/waxErase) away from the page - see lib/waxEraseJobs. */
import { NearestSurface } from "@/lib/nearestSurface";
import { eraseTooth, surfaceSign } from "@/lib/waxErase";
import { prepareMargin, type ClosedMargin, type MarginLine } from "@/lib/waxMargin";
import type { EraseJobMessage, EraseJobReply } from "@/lib/waxEraseJobs";

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (event: MessageEvent<EraseJobMessage>) => {
  const job = event.data;
  const started = performance.now();
  try {
    const surface = new NearestSurface(job.near, 6);
    const sign = surfaceSign(job.axes, surface);
    const m = job.margin;
    const margin: ClosedMargin | null = m ? { surface: new NearestSurface(m.soup, 3), inside: m.inside, line: m.line, ...(m.gum ? { gum: m.gum } : {}), ...(m.onGum ? { onGum: m.onGum } : {}), ...(m.gumSoup ? { gumSurface: new NearestSurface(m.gumSoup, 3) } : {}) } : null;
    const boundaries = (job.boundaries ?? []).map((curve) => prepareMargin(curve, surface, sign, job.axes.up)).filter((line): line is MarginLine => !!line);
    const soup = eraseTooth(job.own, job.axes, job.paint, surface, sign, margin, boundaries);
    const reply: EraseJobReply = { jobId: job.jobId, soup, ms: Math.round(performance.now() - started) };
    scope.postMessage(reply, soup ? [soup.buffer] : []);
  } catch (error) {
    scope.postMessage({ jobId: job.jobId, error: error instanceof Error ? error.message : String(error) } satisfies EraseJobReply);
  }
};
