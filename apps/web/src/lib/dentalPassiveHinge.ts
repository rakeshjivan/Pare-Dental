/**
 * Build 121 (Rakesh): the passive hinge, made as the snap hinge (lib/dentalSnapHinge) turned upside down - the
 * same 7.8 mm ball, the same slim parts - with the ball on the lower and nothing that grips it.
 *
 * In the hinge's frame (as the snap hinge's: the origin at the ball's centre, x across, y back, z up):
 * - The lower: the snap hinge's beak and stem mirrored top to bottom - a beak off the lower base's back wall
 *   and a stem slanting up and back from it to the ball.
 * - The upper: the snap hinge's post mirrored - a housing off the upper base's back wall round the ball's top,
 *   the seat the ball's own shape `fit` larger all round, the slot behind for the stem to swing back through
 *   as the models open. In place of the snap's throat, a channel as wide as the seat runs out of the housing
 *   along the stem, so the ball comes in from below and the upper lifts off - nothing snaps, flexes or is
 *   forced. The channel's mouth widens a little, so the ball finds its way in.
 */
import type { ManifoldRuntime, ManifoldSolid } from "@/lib/dentalMesh";
import { SNAP, SNAP_SIMPLIFY, SNAP_STEP, lowerField, upperField } from "@/lib/dentalSnapHinge";

/** The channel's mouth: how far along the stem from the ball's centre it starts to widen, by how much at most, and over what run, mm. */
export const PASSIVE_MOUTH = { from: 2.6, widen: 0.7, run: 3 } as const;

/** The stem's direction out of the ball (the snap hinge's, mirrored): down and forward. */
export function passiveStemDirection(): [number, number, number] {
  const t = (SNAP.stemTilt * Math.PI) / 180;
  return [0, -Math.sin(t), -Math.cos(t)];
}

/** The lower's distance field (negative inside), ball excluded: the snap hinge's beak and stem, mirrored. */
export function passiveLowerField() {
  const upper = upperField();
  return (x: number, y: number, z: number) => upper(x, y, -z);
}

/** The upper's distance field (negative inside): the snap hinge's post, mirrored, its throat replaced by the open channel. */
export function passiveUpperField(fit: number) {
  // The post with its slot and seat, no throat.
  const post = lowerField(fit, null);
  const [, dy, dz] = passiveStemDirection();
  const seat = SNAP.ball + fit;
  const channel = (x: number, y: number, z: number) => {
    const s = y * dy + z * dz;
    if (s < 0) return Infinity;
    const r = seat + PASSIVE_MOUTH.widen * Math.min(1, Math.max(0, s - PASSIVE_MOUTH.from) / PASSIVE_MOUTH.run);
    return Math.hypot(x, y - dy * s, z - dz * s) - r;
  };
  const blend = SNAP.cutRound;
  return (x: number, y: number, z: number) => {
    const a = post(x, y, -z), b = -channel(x, y, z);
    // A smooth max: the channel's edges rounded as the post's other cuts.
    const h = Math.max(blend - Math.abs(a - b), 0) / blend;
    return Math.max(a, b) + h * h * blend * 0.25;
  };
}

const madeBy = new WeakMap<object, Map<string, { upper: ManifoldSolid; lower: ManifoldSolid }>>();

/**
 * One side's passive hinge in its own frame (made once for each fit and kept, per runtime): the upper's housing
 * and the lower's beak, stem and ball. The caller moves copies into place and never frees these.
 */
export function passiveHinge(runtime: ManifoldRuntime, fit: number) {
  const key = fit.toFixed(3);
  let made = madeBy.get(runtime);
  if (!made) { made = new Map(); madeBy.set(runtime, made); }
  const kept = made.get(key);
  if (kept) return kept;
  const { Manifold } = runtime;
  const field = (f: (x: number, y: number, z: number) => number, min: [number, number, number], max: [number, number, number]) =>
    Manifold.levelSet((p: [number, number, number]) => -f(p[0], p[1], p[2]), { min, max }, SNAP_STEP, 0);
  const shaped = field(passiveLowerField(), [-6, SNAP.front, -18], [6, 4.5, 1]);
  const ball = Manifold.sphere(SNAP.ball, 192);
  const joined = Manifold.union(shaped, ball);
  const lower = joined.simplify(SNAP_SIMPLIFY);
  joined.delete();
  shaped.delete();
  ball.delete();
  const raw = field(passiveUpperField(fit), [-6, SNAP.front, -9.5], [6, 7.5, 19]);
  const upper = raw.simplify(SNAP_SIMPLIFY);
  raw.delete();
  const both = { upper, lower };
  made.set(key, both);
  return both;
}
