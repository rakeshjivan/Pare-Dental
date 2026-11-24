/**
 * Build 127 (Rakesh): which corners of a finished model a finishing brush must not move.
 *
 * The finishing brushes work on a made model with its base and inside frozen. The "blend" brush is the
 * opposite: it smooths the seam where the scan's periphery meets the generated base, and protects the
 * teeth (and the flat underside the model prints on) instead.
 *
 * Pure so it can be tested on its own; the editor supplies each corner's height above the model's own
 * base (zLocal, with the base top at baseTopZ) and, only when needed, its downward-facing normal.
 */
export type MadeBrush = "smooth" | "add" | "remove" | "blend";

/** How far below the base top is treated as "the base", for the ordinary finishing brushes (mm). */
export const MADE_BASE_CLEAR = 1;
/** Half-height of the editable band around the seam, for the blend brush (mm). */
export const MADE_SEAM_BAND = 2;
/** The blend brush is capped gentle, so a seam is eased rather than dragged. */
export const MADE_BLEND_MOST = 0.6;

export function madeCornerFrozen(
  brush: MadeBrush,
  zLocal: number,
  baseTopZ: number,
  downNormalZ: () => number,
  band = MADE_SEAM_BAND,
  clear = MADE_BASE_CLEAR,
): boolean {
  if (brush === "blend") {
    // Freeze the base and flat bottom below, and the gum and teeth above; leave only the seam band.
    return zLocal < baseTopZ - band || zLocal > baseTopZ + band;
  }
  // Smooth / Add / Remove: freeze the base block and the downward-facing roof of a hollow model.
  if (zLocal < baseTopZ + clear) return true;
  return downNormalZ() < -0.35;
}
