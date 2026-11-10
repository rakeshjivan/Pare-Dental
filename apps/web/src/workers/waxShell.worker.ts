/// <reference lib="webworker" />
/** Build 283: the wax-up model's front teeth (lib/waxShell) away from the page - see lib/waxShellJob. */
import { runShellJob, type ShellJobMessage, type ShellJobReply } from "@/lib/waxShellJob";

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (event: MessageEvent<ShellJobMessage>) => {
  const { jobId, job } = event.data;
  try {
    const result = runShellJob(job);
    scope.postMessage({ jobId, result } satisfies ShellJobReply, result ? [result.soup.buffer] : []);
  } catch (error) {
    scope.postMessage({ jobId, error: error instanceof Error ? error.message : String(error) } satisfies ShellJobReply);
  }
};
