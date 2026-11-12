/**
 * Build 278 (Rakesh, Wax-up Studio step-by-step redesign, step 1 "Mark"): the points the dentist clicks on
 * the scan before anything else, from the patient's right - the canine's distal contact, each contact
 * between the six front teeth (the 11/21 contact at the incisal edge is the midline), the other canine's
 * distal contact, then the two canine tips. The contacts give each tooth's width (the next step snaps the
 * library teeth to them), the midline sets the incisal edge level, the tips the arch curve and smile arc.
 */
type Vec3 = [number, number, number];

/** The nine marks, in the order they are clicked. 0-6 contacts (occlusal view), 7-8 canine tips (front view). */
export const ARCH_MARK_COUNT = 9;
export const ARCH_MARK_CONTACTS = 7;
export const ARCH_MARK_MIDLINE = 3;
/**
 * Build 310 (Rakesh: "if we had mid-buccal ... marks on the gingival, would each tooth auto-size to snap to those
 * points - I think that is the missing piece"): after the nine, one mark for each of the six front teeth at the
 * middle of its labial gingival margin (from the patient's right) - marks 9 to 14. The app places them itself once
 * the nine are there (the margin read on the scan); the dentist drags any that is off. They are never asked for:
 * a tooth without one is laid as before.
 */
export const ARCH_MARK_GUM = 9;
export const ARCH_MARK_GUMS = 6;
/** The six gum marks of an arch's marks (null where there is none). */
export function gumMarks(marks: ReadonlyArray<Vec3 | null | undefined> | undefined): Array<Vec3 | null> {
  return Array.from({ length: ARCH_MARK_GUMS }, (_, i) => marks?.[ARCH_MARK_GUM + i] ?? null);
}

/** The FDI numbers of the six front teeth on an arch: right canine, lateral, central, then left central, lateral, canine. */
export function frontTeeth(slot: "upper" | "lower"): [number, number, number, number, number, number] {
  return slot === "upper" ? [13, 12, 11, 21, 22, 23] : [43, 42, 41, 31, 32, 33];
}

/** What each mark is, for the guide: its kind and the teeth it sits between. */
export function archMarkLabel(slot: "upper" | "lower", index: number): { kind: "distal" | "contact" | "midline" | "tip" | "gum"; teeth: number[] } {
  const [r3, r2, r1, l1, l2, l3] = frontTeeth(slot);
  if (index >= ARCH_MARK_GUM) return { kind: "gum", teeth: [frontTeeth(slot)[Math.min(ARCH_MARK_GUMS - 1, index - ARCH_MARK_GUM)]] };
  switch (index) {
    case 0: return { kind: "distal", teeth: [r3] };
    case 1: return { kind: "contact", teeth: [r3, r2] };
    case 2: return { kind: "contact", teeth: [r2, r1] };
    case 3: return { kind: "midline", teeth: [r1, l1] };
    case 4: return { kind: "contact", teeth: [l1, l2] };
    case 5: return { kind: "contact", teeth: [l2, l3] };
    case 6: return { kind: "distal", teeth: [l3] };
    case 7: return { kind: "tip", teeth: [r3] };
    default: return { kind: "tip", teeth: [l3] };
  }
}

/** The next mark still to place (the first gap), or null when all nine are there. */
export function nextArchMark(marks: ReadonlyArray<Vec3 | null | undefined> | undefined): number | null {
  for (let i = 0; i < ARCH_MARK_COUNT; i += 1) if (!marks?.[i]) return i;
  return null;
}

/** Each front tooth's width from the contacts either side of it (straight across, mm), by FDI; a tooth with a contact missing is left out. */
export function markedWidths(slot: "upper" | "lower", marks: ReadonlyArray<Vec3 | null | undefined> | undefined): Map<number, number> {
  const teeth = frontTeeth(slot);
  const out = new Map<number, number>();
  teeth.forEach((fdi, i) => {
    const a = marks?.[i], b = marks?.[i + 1];
    if (a && b) out.set(fdi, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
  });
  return out;
}
