/**
 * Build 119: the snap hinge (Pare's own snap-in articulation, made to the layout, sizes and fit of the
 * lab articulator models Rakesh benchmarked - our own geometry, none of theirs).
 *
 * In the hinge's frame: the origin at the ball's centre (on the condyles' axis), x across, y back, z up.
 * - The upper: a beak off the base's back wall, with a stem slanting down and back from under it to a
 *   7.8 mm ball. Opening, the upper turns about the ball and the stem swings back.
 * - The lower: a post off the base's back wall - two cheeks either side of a slot - with the ball's
 *   pocket (SNAP.fit larger all round) and a throat out of the back a little narrower than the ball, so
 *   the ball snaps in from behind and is held. The slot's front face leans forward as it rises, just
 *   clear of the stem with the models closed (a stop against closing past the bite), open behind, so the
 *   models open past 90 degrees.
 * Every edge is rounded and the profiles are smooth curves: the parts are a level set of their distance
 * fields, the pocket and throat cut into it with a small blend at their edges. The parts reach SNAP.front
 * forward of the ball, into the bases' back walls (the axis stands SNAP.behind behind the bases' backs).
 */
import type { ManifoldRuntime, ManifoldSolid } from "@/lib/dentalMesh";

export const SNAP = {
  /** The ball's radius, its pocket's clearance all round (the default fit), and the throat's radius - less than the ball's, the snap. */
  ball: 3.9,
  fit: 0.12,
  throat: 3.795,
  /** The throat's lead-in: its radius at the post's back, and how far behind the ball's centre it starts. */
  lead: 4.35,
  throatRun: 2.2,
  /** The stem: radius, degrees forward of upright (its top forward of the ball), length to the beak. */
  stem: 2.85,
  stemTilt: 23,
  stemLength: 11,
  /** Half the beak's width, its edges' radius, and the blend between beak and stem. */
  armHalf: 4.85,
  armRound: 1,
  blend: 1.4,
  /** Half the post's width, its edges' radius, the slot's half width, and the cuts' edge blend. */
  postHalf: 5.2,
  postRound: 0.9,
  slotHalf: 3.15,
  cutRound: 0.5,
  /** The slot's front face: its lean forward from upright (degrees), where it crosses the axis' height, and the slot's floor. */
  slotLean: 20.2,
  slotFront: -3.55,
  slotFloor: -10.2,
  /** How far forward of the ball's centre the parts reach (into the bases' back walls), and how far behind the bases' backs the axis stands. */
  front: -12,
  behind: 10.8,
  /** The beak's top above the axis, and the post's underside below it (each cut at its base's floor when the base is shallower). */
  armTop: 16.6,
  postBottom: -18.2,
} as const;

/** The pocket's fit: the clearance all round the ball, mm, kept within these. */
export const SNAP_FIT_MIN = 0.05;
export const SNAP_FIT_MAX = 0.25;
export function snapFit(fit: number | undefined) {
  return Number.isFinite(fit) ? Math.max(SNAP_FIT_MIN, Math.min(SNAP_FIT_MAX, fit as number)) : SNAP.fit;
}

type P2 = [number, number];
/** The beak's side profile (y, z), the stem's top inside it. */
export const ARM_PROFILE: P2[] = [[SNAP.front - 2, 16.6], [-9, 16.57], [-5, 15.6], [-1, 13.7], [1.6, 11.8], [3.0, 10.7], [2.4, 9.95], [0.4, 10.3], [-3, 9.84], [-5.2, 8.9], [-7.4, 7.6], [SNAP.front - 2, 7.4]];
/** The post's side profile (y, z): its rounded head behind the ball, its front stepping back from the base's wall above the bridge it stands on. */
export const POST_PROFILE: P2[] = [[SNAP.front - 2, -18.2], [-4.5, -16.8], [-2.2, -15.2], [-0.6, -12.6], [2.1, -10], [4.4, -7.6], [5.6, -4.5], [6.1, 0], [5.6, 3.4], [4.0, 6.3], [1.6, 8.1], [-1, 8.4], [-3.4, 7.8], [-5.4, 6.6], [-6.4, 4.4], [-6.4, 0.5], [-6.7, -3], [-7.8, -6], [-9.4, -8.2], [-11.2, -9.9], [SNAP.front - 2, -11.2]];

/** A closed polygon through `points` as a smooth curve (uniform Catmull-Rom), `steps` points a span. */
export function smoothLoop(points: P2[], steps = 16): P2[] {
  const out: P2[] = [];
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
    for (let k = 0; k < steps; k += 1) {
      const t = k / steps, t2 = t * t, t3 = t2 * t;
      const at = (a: 0 | 1) => 0.5 * (2 * p1[a] + (p2[a] - p0[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (3 * p1[a] - p0[a] - 3 * p2[a] + p3[a]) * t3);
      out.push([at(0), at(1)]);
    }
  }
  return out;
}

/** Signed distance to a closed polygon (negative inside). */
export function polygonDistance(poly: P2[], x: number, y: number) {
  let d = Infinity, s = 1;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [ax, ay] = poly[j], [bx, by] = poly[i];
    const ex = bx - ax, ey = by - ay, wx = x - ax, wy = y - ay;
    const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
    const dx = wx - ex * t, dy = wy - ey * t;
    d = Math.min(d, dx * dx + dy * dy);
    const c1 = y >= ay, c2 = y < by, c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}

/** A profile's distance, sampled on a grid over [lo, hi] and read bilinearly (exact enough at 0.05 mm, and fast). */
function profileField(points: P2[], lo: P2, hi: P2, g = 0.05) {
  const poly = smoothLoop(points);
  const nx = Math.ceil((hi[0] - lo[0]) / g) + 1, ny = Math.ceil((hi[1] - lo[1]) / g) + 1;
  const a = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) a[j * nx + i] = polygonDistance(poly, lo[0] + i * g, lo[1] + j * g);
  return (x: number, y: number) => {
    const fx = Math.max(0, Math.min(nx - 1.001, (x - lo[0]) / g)), fy = Math.max(0, Math.min(ny - 1.001, (y - lo[1]) / g));
    const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * nx + i;
    const beyond = Math.hypot(Math.max(lo[0] - x, 0, x - hi[0]), Math.max(lo[1] - y, 0, y - hi[1]));
    return (a[k] * (1 - u) + a[k + 1] * u) * (1 - v) + (a[k + nx] * (1 - u) + a[k + nx + 1] * u) * v + beyond;
  };
}

/** A 2-D profile (in y, z) extruded across |x| <= half, its edges rounded by r. */
const extruded = (f: (y: number, z: number) => number, half: number, r: number) => (x: number, y: number, z: number) => {
  const wx = f(y, z) + r, wy = Math.abs(x) - half + r;
  return Math.min(Math.max(wx, wy), 0) + Math.hypot(Math.max(wx, 0), Math.max(wy, 0)) - r;
};
const smin = (a: number, b: number, k: number) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);

/** The beak and stem's distance field (negative inside), ball excluded. */
export function upperField() {
  const arm = extruded(profileField(ARM_PROFILE, [SNAP.front - 3, 5], [5, 18]), SNAP.armHalf, SNAP.armRound);
  const t = (SNAP.stemTilt * Math.PI) / 180;
  const ey = -Math.sin(t) * SNAP.stemLength, ez = Math.cos(t) * SNAP.stemLength, ee = ey * ey + ez * ez;
  const stem = (x: number, y: number, z: number) => {
    const s = Math.max(0, Math.min(1, (y * ey + z * ez) / ee));
    return Math.hypot(x, y - ey * s, z - ez * s) - SNAP.stem;
  };
  return (x: number, y: number, z: number) => Math.max(smin(arm(x, y, z), stem(x, y, z), SNAP.blend), SNAP.front - y);
}

/** The post's distance field (negative inside) with its slot, pocket (fit as given) and throat cut. */
export function lowerField(fit: number = SNAP.fit) {
  const post = extruded(profileField(POST_PROFILE, [SNAP.front - 3, -20], [8, 10]), SNAP.postHalf, SNAP.postRound);
  const lean = (SNAP.slotLean * Math.PI) / 180, ny = Math.cos(lean), nz = Math.sin(lean);
  const slot = (x: number, y: number, z: number) => Math.max(Math.abs(x) - SNAP.slotHalf, -((y - SNAP.slotFront) * ny + z * nz), SNAP.slotFloor - z);
  const pocket = (x: number, y: number, z: number) => Math.hypot(x, y, z) - (SNAP.ball + fit);
  const throat = (x: number, y: number, z: number) => {
    if (y < 0) return Infinity;
    const r = y < SNAP.throatRun ? SNAP.throat : SNAP.throat + (SNAP.lead - SNAP.throat) * Math.min(1, (y - SNAP.throatRun) / 4.4);
    return Math.hypot(x, z) - r;
  };
  return (x: number, y: number, z: number) => Math.max(smax(post(x, y, z), -Math.min(slot(x, y, z), pocket(x, y, z), throat(x, y, z)), SNAP.cutRound), SNAP.front - y);
}

/** The level set's grid step, mm. */
export const SNAP_STEP = 0.12;
const made = new Map<string, { upper: ManifoldSolid; lower: ManifoldSolid }>();

/**
 * One side's hinge in its own frame (made once for each fit and kept): the upper's beak, stem and ball,
 * and the lower's post. The caller moves copies into place (translate makes a new solid) and never frees these.
 */
export function snapHinge(runtime: ManifoldRuntime, fitGiven?: number) {
  const fit = snapFit(fitGiven);
  const key = fit.toFixed(3);
  const kept = made.get(key);
  if (kept) return kept;
  const { Manifold } = runtime;
  const field = (f: (x: number, y: number, z: number) => number, min: [number, number, number], max: [number, number, number]) =>
    Manifold.levelSet((p: [number, number, number]) => -f(p[0], p[1], p[2]), { min, max }, SNAP_STEP, 0);
  const shaped = field(upperField(), [-6, SNAP.front, -1], [6, 4.5, 18]);
  const ball = Manifold.sphere(SNAP.ball, 192);
  const upper = Manifold.union(shaped, ball);
  shaped.delete();
  ball.delete();
  const lower = field(lowerField(fit), [-6, SNAP.front, -19], [6, 7.5, 9.5]);
  const both = { upper, lower };
  made.set(key, both);
  return both;
}
