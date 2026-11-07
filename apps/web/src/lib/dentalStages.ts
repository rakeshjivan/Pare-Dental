/**
 * Build 267 (Rakesh): what Make is doing, as it goes - so the button can say it ("Building the base - upper") and
 * fill as it goes, rather than look stuck for a minute. The making code calls `dentalStage` as it starts each part
 * of the work; whoever runs it (the worker) listens with `onDentalStage`. The times between stages are kept too, to
 * see where a Make spends its time.
 */
export type DentalStage = "prepare" | "base" | "join" | "edge" | "hollow" | "details" | "hinge" | "check" | "done";
export type DentalArchRole = "upper" | "lower";

/** About how much of a Make each stage takes (measured on full arches), so the button fills at a fair pace. */
const STAGE_SHARE: Record<DentalStage, number> = { prepare: 0.02, base: 0.1, join: 0.45, edge: 0.55, hollow: 0.65, details: 0.75, check: 0.82, hinge: 0.9, done: 1 };

type Sink = (stage: DentalStage, share: number, arch?: DentalArchRole) => void;
let sink: Sink | null = null;
let last: { stage: string; at: number } | null = null;
const times: Array<{ stage: string; ms: number }> = [];

/** Listens to the stages of the Make that runs next (null to stop). The times kept start again. */
export function onDentalStage(listener: Sink | null) {
  sink = listener;
  last = null;
  times.length = 0;
}

/** Make has started `stage` (of `arch`'s model, if it is one arch's work). */
export function dentalStage(stage: DentalStage, arch?: DentalArchRole) {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (last) times.push({ stage: last.stage, ms: Math.round(now - last.at) });
  last = { stage: arch ? `${stage}:${arch}` : stage, at: now };
  sink?.(stage, STAGE_SHARE[stage], arch);
}

/** How long each stage of the last Make took, ms, in order. */
export function dentalStageTimes() {
  return [...times];
}
