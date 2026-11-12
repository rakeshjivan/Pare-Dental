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

/**
 * Build 315 (Rakesh, of the hard case marked by hand: "marked the teeth and this happened" - two teeth thrown onto
 * the palate): what looks wrong with the nine marks, before teeth are laid on them. A mark clicked on the wrong
 * spot (the view turns between clicks) gives a tooth no tooth could be - and the set laid on it was wrecked with
 * nothing said. Each problem names the dots to look at (their numbers as shown, from 1).
 *  - width: a tooth between two contacts narrower than MARK_NARROW or wider than MARK_WIDE;
 *  - order: the contacts double back on themselves at a dot (it was clicked out of turn, or on the wrong tooth);
 *  - tip: a canine tip further than MARK_TIP_FAR from the canine its contacts mark.
 */
export const MARK_NARROW = 2.5;
export const MARK_WIDE = 13;
export const MARK_TIP_FAR = 9;
export const MARK_TURN_BACK = -0.6;
export type ArchMarkProblem = { kind: "width"; fdi: number; mm: number; dots: [number, number] } | { kind: "order"; dots: [number] } | { kind: "tip"; fdi: number; dots: [number] };
export function archMarkProblems(slot: "upper" | "lower", marks: ReadonlyArray<Vec3 | null | undefined> | undefined): ArchMarkProblem[] {
  const out: ArchMarkProblem[] = [];
  if (!marks) return out;
  const teeth = frontTeeth(slot);
  const far = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  teeth.forEach((fdi, i) => {
    const a = marks[i], b = marks[i + 1];
    if (!a || !b) return;
    const mm = far(a, b);
    if (mm < MARK_NARROW || mm > MARK_WIDE) out.push({ kind: "width", fdi, mm, dots: [i + 1, i + 2] });
  });
  for (let i = 1; i < ARCH_MARK_CONTACTS - 1; i += 1) {
    const a = marks[i - 1], b = marks[i], c = marks[i + 1];
    if (!a || !b || !c) continue;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
    const lu = Math.hypot(u[0], u[1], u[2]), lw = Math.hypot(w[0], w[1], w[2]);
    // Round an arch each step turns a little, and round a tooth tucked behind its neighbours a good deal; one that
    // turns back on itself by more than MARK_TURN_BACK (as a cosine) is no arch.
    if (lu > 0.5 && lw > 0.5 && (u[0] * w[0] + u[1] * w[1] + u[2] * w[2]) / (lu * lw) < MARK_TURN_BACK) out.push({ kind: "order", dots: [i + 1] });
  }
  ([[7, 0, teeth[0]], [8, 5, teeth[5]]] as const).forEach(([tip, contact, fdi]) => {
    const p = marks[tip], a = marks[contact], b = marks[contact + 1];
    if (!p || !a || !b) return;
    const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    if (far(p, mid) > MARK_TIP_FAR) out.push({ kind: "tip", fdi, dots: [tip + 1] });
  });
  return out;
}

/**
 * Build 316 (Rakesh: "the way the marks are placed is not easy"): the marks in their proper order, whatever order
 * they were clicked in. `left`: the patient's left, as a direction in the marks' coordinates.
 *  - the seven contacts, once all are placed: if they run from the patient's left they are turned round; if they
 *    still double back (clicked out of turn) they are put in order across the arch - but only when that order has
 *    less wrong with it, so contacts that truly overlap on a crowded arch are left as the dentist put them;
 *  - the two canine tips, once both are placed: each on its own side.
 */
export function orderArchMarks<T extends Vec3 | null | undefined>(slot: "upper" | "lower", marks: ReadonlyArray<T>, left: ArrayLike<number>): T[] {
  const out = [...marks];
  const side = (p: Vec3) => p[0] * left[0] + p[1] * left[1] + p[2] * left[2];
  const contacts = out.slice(0, ARCH_MARK_CONTACTS);
  if (contacts.every(Boolean)) {
    let seven = contacts as Vec3[];
    if (side(seven[ARCH_MARK_CONTACTS - 1]) < side(seven[0])) seven = [...seven].reverse();
    const wrong = (list: Vec3[]) => archMarkProblems(slot, list).length;
    const sorted = [...seven].sort((a, b) => side(a) - side(b));
    if (wrong(sorted) < wrong(seven)) seven = sorted;
    seven.forEach((p, i) => { out[i] = p as T; });
  }
  const tipRight = out[ARCH_MARK_CONTACTS], tipLeft = out[ARCH_MARK_CONTACTS + 1];
  if (tipRight && tipLeft && side(tipRight) > side(tipLeft)) { out[ARCH_MARK_CONTACTS] = tipLeft; out[ARCH_MARK_CONTACTS + 1] = tipRight; }
  return out;
}
