/**
 * Build 284 (Rakesh: widening a tooth mesially must not widen it distally, and where one tooth's contact moves into
 * the next, that tooth narrows to keep a perfect contact): a contact between two teeth of the set is one thing that
 * moves. Moving a tooth's mesial or distal side moves the contact it shares - the tooth beside it gives way on that
 * side by exactly as much (or follows, when the side is drawn in), and no other tooth moves at all. The contact at
 * the midline (11/21) moves the same way. A canine's distal side has no tooth of the set beside it: it moves alone.
 */
import { EDIT_RANGES, NO_EDIT, type ToothEdit } from "@/lib/waxToothEdit";

export type ContactSide = "mesial" | "distal";

/** The tooth sharing `fdi`'s `side` contact and the side of it that does, in `order` (the six front teeth, patient's right to left). */
export function contactNeighbour(order: readonly number[], fdi: number, side: ContactSide): { fdi: number; side: ContactSide } | null {
  const i = order.indexOf(fdi);
  if (i < 0) return null;
  const right = i < order.length / 2;
  const j = side === "mesial" ? (right ? i + 1 : i - 1) : (right ? i - 1 : i + 1);
  if (j < 0 || j >= order.length) return null;
  const across = (j < order.length / 2) !== right;
  return { fdi: order[j], side: across ? "mesial" : side === "mesial" ? "distal" : "mesial" };
}

/**
 * The teeth's own changes with `fdi`'s `side` moved out by `d` mm (in, when negative) and its neighbour giving way.
 * With `mirror`, the same on the other side of the midline (not for the midline contact itself, which is one contact).
 * `d` is held to what every tooth touched can take, so the contact never opens or overlaps. `has` says which teeth
 * are in the set to be changed (a tooth held or sculpted is not: the side then moves alone).
 */
export function moveContact(own: Readonly<Record<number, ToothEdit>>, order: readonly number[], fdi: number, side: ContactSide, d: number, mirror: boolean, has: (fdi: number) => boolean = () => true): Record<number, ToothEdit> {
  const i = order.indexOf(fdi);
  if (i < 0 || !has(fdi)) return { ...own };
  const moves: Array<{ fdi: number; side: ContactSide; sign: 1 | -1 }> = [];
  const add = (tooth: number, s: ContactSide) => {
    moves.push({ fdi: tooth, side: s, sign: 1 });
    const n = contactNeighbour(order, tooth, s);
    if (n && has(n.fdi)) moves.push({ fdi: n.fdi, side: n.side, sign: -1 });
    return n;
  };
  const n = add(fdi, side);
  const midline = Boolean(n && (order.indexOf(n.fdi) < order.length / 2) !== (i < order.length / 2));
  const partner = order[order.length - 1 - i];
  if (mirror && !midline && partner !== fdi && has(partner)) add(partner, side);
  // Held to every touched tooth's range.
  let lo = -Infinity, hi = Infinity;
  for (const move of moves) {
    const now = own[move.fdi]?.[move.side] ?? 0;
    const [min, max] = EDIT_RANGES[move.side];
    if (move.sign > 0) { lo = Math.max(lo, min - now); hi = Math.min(hi, max - now); }
    else { lo = Math.max(lo, now - max); hi = Math.min(hi, now - min); }
  }
  const by = Math.min(hi, Math.max(lo, d));
  const next: Record<number, ToothEdit> = { ...own };
  for (const move of moves) {
    const edit = { ...NO_EDIT, ...(next[move.fdi] ?? {}) };
    edit[move.side] = Math.round((edit[move.side] + move.sign * by) * 1000) / 1000;
    next[move.fdi] = edit;
  }
  return next;
}
