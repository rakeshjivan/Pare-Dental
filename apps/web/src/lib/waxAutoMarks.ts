/**
 * Build 285 (Rakesh: "our app should auto segment the teeth, identify landmarks ... leaving the dentist to move
 * the teeth to the perfect position"): the nine marks of step "Mark" found on the scan, for the dentist to check
 * and drag rather than click one by one.
 *
 * Seen from the occlusal, the front of an arch is a row of rounded crowns: where two of them meet, the labial
 * outline dips in (the labial embrasure) and so does the incisal edge (the incisal embrasure). The outline is
 * read round the arch from a centre behind the front teeth, the dips are scored, and the seven contacts are the
 * seven dips that best fit a set of front teeth - a central, a lateral and a canine either side of the midline,
 * of believable widths and alike left and right. The canine tips are the highest points between their contacts.
 *
 * Works in the arch frame (teeth up along z, the front at -y: dentalWaxup's scanInArchFrame).
 */
import * as THREE from "three";
import { scanInArchFrame } from "@/lib/dentalWaxup";

type Vec3 = [number, number, number];

/** How finely the outline is read along the arch, mm. */
const STEP = 0.25;
/** The centre the outline is read round: this far behind the front of the arch, mm. */
const CENTRE_BACK = 30;
/** The sweep either side of straight ahead, radians. */
const SWEEP = (75 * Math.PI) / 180;
/** The labial outline is taken from the crowns' incisal part: this far below the edge nearby, mm. */
const BAND = 3.5;
/** The midline mark takes the height of the centrals' edges within this reach of it, mm. */
const EDGE_REACH = 4;
/** A dip is measured against the outline bridged over this reach either side, mm. */
const BRIDGE = 3;
/** Expected widths along the arch and how far they may be off, mm: central, lateral, canine (as seen from the front of the arch). */
type Width = { mean: number; spread: number; min: number; max: number };
const WIDTHS: Record<"upper" | "lower", [Width, Width, Width]> = {
  upper: [{ mean: 8.6, spread: 1.3, min: 6.5, max: 11 }, { mean: 6.7, spread: 1.3, min: 4.5, max: 9 }, { mean: 7.6, spread: 1.5, min: 5.5, max: 10 }],
  lower: [{ mean: 5.4, spread: 0.9, min: 4, max: 7 }, { mean: 5.9, spread: 0.9, min: 4.5, max: 7.5 }, { mean: 6.9, spread: 1.2, min: 5, max: 9 }],
};
/** How far the midline may sit from the middle of the arch before it counts against a fit, mm. */
const MIDLINE_OFF = 2.5;
/** The least total score for the marks to be offered at all (below it the dentist clicks them, as before). */
export const AUTO_MARKS_MIN = 3.5;

export type AutoMarks = {
  /** The nine marks in the order of lib/waxArchMarks (from the patient's right; then the two canine tips). */
  marks: Vec3[];
  /** How well the dips fit a set of front teeth (AUTO_MARKS_MIN and up is offered). */
  score: number;
  /** Each contact's own dip, mm-like (0 = no dip seen there: placed from the widths alone). */
  dips: number[];
};

const runMax = (a: Float64Array, w: number) => { const out = new Float64Array(a.length); for (let i = 0; i < a.length; i += 1) { let m = -Infinity; for (let k = Math.max(0, i - w); k <= Math.min(a.length - 1, i + w); k += 1) if (a[k] > m) m = a[k]; out[i] = m; } return out; };
const runMin = (a: Float64Array, w: number) => { const out = new Float64Array(a.length); for (let i = 0; i < a.length; i += 1) { let m = Infinity; for (let k = Math.max(0, i - w); k <= Math.min(a.length - 1, i + w); k += 1) if (a[k] < m) m = a[k]; out[i] = m; } return out; };
/** The outline bridged over its dips (a morphological closing). */
const bridged = (a: Float64Array, w: number) => runMin(runMax(a, w), w);
const smoothed = (a: Float64Array, w: number) => { const out = new Float64Array(a.length); for (let i = 0; i < a.length; i += 1) { let s = 0, n = 0; for (let k = Math.max(0, i - w); k <= Math.min(a.length - 1, i + w); k += 1) { s += a[k]; n += 1; } out[i] = s / n; } return out; };
/** Gaps (not finite) filled from their neighbours. */
function filled(a: Float64Array): boolean {
  let last = -1;
  for (let i = 0; i < a.length; i += 1) {
    if (!Number.isFinite(a[i])) continue;
    if (last < 0) for (let k = 0; k < i; k += 1) a[k] = a[i];
    else for (let k = last + 1; k < i; k += 1) a[k] = a[last] + ((a[i] - a[last]) * (k - last)) / (i - last);
    last = i;
  }
  if (last < 0) return false;
  for (let k = last + 1; k < a.length; k += 1) a[k] = a[last];
  return true;
}
const percentile = (values: number[], q: number) => { if (!values.length) return NaN; const s = values.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]; };

/**
 * The nine marks on a scan given in its arch frame (`v`: corners or vertices, xyz; teeth up, front at -y), in that
 * frame. `rightAtPlus`: whether the patient's right side is at +x; `slot` picks the widths to expect. Null when no outline can be read.
 */
export function autoMarksInArchFrame(v: ArrayLike<number>, rightAtPlus: boolean, slot: "upper" | "lower" = "upper"): AutoMarks | null {
  const widths = WIDTHS[slot];
  const count = Math.floor(v.length / 3);
  if (count < 500) return null;
  // The tooth-bearing top of the scan: its middle from side to side and its front.
  const heights: number[] = [];
  const stride = Math.max(1, Math.floor(count / 40000));
  for (let i = 0; i < count; i += stride) heights.push(v[i * 3 + 2]);
  const high = percentile(heights, 0.6);
  const xs: number[] = [], fronts: number[] = [];
  for (let i = 0; i < count; i += stride) if (v[i * 3 + 2] > high) { xs.push(v[i * 3]); fronts.push(-v[i * 3 + 1]); }
  if (xs.length < 100) return null;
  const cx = (percentile(xs, 0.01) + percentile(xs, 0.99)) / 2, cf = percentile(fronts, 0.999) - CENTRE_BACK;

  const bins = Math.round((2 * SWEEP) / (STEP / CENTRE_BACK));
  const binOf = new Int32Array(count).fill(-1);
  const edge = new Float64Array(bins).fill(-Infinity), edgeAt = new Int32Array(bins).fill(-1);
  for (let i = 0; i < count; i += 1) {
    const dx = v[i * 3] - cx, df = -v[i * 3 + 1] - cf;
    if (dx * dx + df * df < 144) continue;
    const angle = Math.atan2(dx, df);
    if (Math.abs(angle) >= SWEEP) continue;
    const b = Math.min(bins - 1, Math.floor(((angle + SWEEP) / (2 * SWEEP)) * bins));
    binOf[i] = b;
    if (v[i * 3 + 2] > edge[b]) { edge[b] = v[i * 3 + 2]; edgeAt[b] = i; }
  }
  const reach = Math.round(4 / STEP);
  const edgeNear = runMax(edge, reach);
  const radius = new Float64Array(bins).fill(-Infinity), radiusAt = new Int32Array(bins).fill(-1);
  for (let i = 0; i < count; i += 1) {
    const b = binOf[i];
    if (b < 0 || !(v[i * 3 + 2] > edgeNear[b] - BAND)) continue;
    const r = Math.hypot(v[i * 3] - cx, -v[i * 3 + 1] - cf);
    if (r > radius[b]) { radius[b] = r; radiusAt[b] = i; }
  }
  if (!filled(radius) || !filled(edge)) return null;

  // Length along the arch, on the outline bridged over its dips (the dips themselves would add to it).
  const w = Math.round(BRIDGE / STEP);
  const hull = smoothed(bridged(radius, w), w >> 1);
  const angleOf = (b: number) => ((b + 0.5) / bins) * 2 * SWEEP - SWEEP;
  const along = new Float64Array(bins);
  for (let b = 1; b < bins; b += 1) {
    const a0 = angleOf(b - 1), a1 = angleOf(b);
    along[b] = along[b - 1] + Math.hypot(hull[b] * Math.sin(a1) - hull[b - 1] * Math.sin(a0), hull[b] * Math.cos(a1) - hull[b - 1] * Math.cos(a0));
  }
  // The outline and the edge at even steps along the arch, and the bin each step falls in.
  const n = Math.floor(along[bins - 1] / STEP);
  if (n < Math.round(40 / STEP)) return null;
  const R = new Float64Array(n), H = new Float64Array(n), bin = new Int32Array(n);
  let at = 0;
  for (let k = 0; k < n; k += 1) {
    const s = k * STEP;
    while (at < bins - 2 && along[at + 1] < s) at += 1;
    const f = along[at + 1] > along[at] ? Math.min(1, Math.max(0, (s - along[at]) / (along[at + 1] - along[at]))) : 0;
    R[k] = radius[at] + (radius[at + 1] - radius[at]) * f; H[k] = edge[at] + (edge[at + 1] - edge[at]) * f; bin[k] = f < 0.5 ? at : at + 1;
  }
  const Rs = smoothed(R, 1), Hs = smoothed(H, 1);
  const dipR = bridged(Rs, w), dipH = bridged(Hs, w);
  const raw = new Float64Array(n);
  for (let k = 0; k < n; k += 1) raw[k] = Math.min(1.5, dipR[k] - Rs[k]) + 0.6 * Math.min(1.5, dipH[k] - Hs[k]);
  const score = smoothed(raw, 1);
  // Straight ahead, as a first idea of where the midline is.
  let ahead = 0;
  for (let k = 0; k < n; k += 1) if (Math.abs(angleOf(bin[k])) < Math.abs(angleOf(bin[ahead]))) ahead = k;

  // The best three contacts to one side of a midline at m (sign -1 or +1): a few of the best, with their widths.
  type Side = { value: number; at: [number, number, number]; widths: [number, number, number] };
  const KEEP = 12;
  const steps = widths.map((width) => ({ lo: Math.round(width.min / STEP), hi: Math.round(width.max / STEP) }));
  const sideOf = (m: number, sign: number): Side[] => {
    const best: Side[] = [];
    for (let a = steps[0].lo; a <= steps[0].hi; a += 1) {
      const i1 = m + sign * a;
      if (i1 < 0 || i1 >= n) break;
      for (let b = steps[1].lo; b <= steps[1].hi; b += 1) {
        const i2 = i1 + sign * b;
        if (i2 < 0 || i2 >= n) break;
        for (let c = steps[2].lo; c <= steps[2].hi; c += 1) {
          const i3 = i2 + sign * c;
          if (i3 < 0 || i3 >= n) break;
          const wc = a * STEP, wl = b * STEP, wk = c * STEP;
          let off = ((wc - widths[0].mean) / widths[0].spread) ** 2 + ((wl - widths[1].mean) / widths[1].spread) ** 2 + ((wk - widths[2].mean) / widths[2].spread) ** 2;
          // An upper lateral is narrower than its central.
          if (slot === "upper" && wl > wc) off += ((wl - wc) / 0.5) ** 2;
          const value = score[i1] + score[i2] + 0.7 * score[i3] - 0.15 * off;
          if (best.length === KEEP && value <= best[KEEP - 1].value) continue;
          let p = best.length;
          while (p > 0 && best[p - 1].value < value) p -= 1;
          best.splice(p, 0, { value, at: [i1, i2, i3], widths: [wc, wl, wk] });
          if (best.length > KEEP) best.pop();
        }
      }
    }
    return best;
  };
  let found: { value: number; at: number[] } | null = null;
  const margin = Math.round(18 / STEP);
  for (let m = margin; m < n - margin; m += 1) {
    const left = sideOf(m, -1), right = sideOf(m, 1);
    if (!left.length || !right.length) continue;
    const centred = (((m - ahead) * STEP) / MIDLINE_OFF) ** 2;
    for (const l of left) for (const r of right) {
      const unlike = (l.widths[0] - r.widths[0]) ** 2 + (l.widths[1] - r.widths[1]) ** 2 + (l.widths[2] - r.widths[2]) ** 2;
      const value = 1.3 * score[m] + l.value + r.value - 0.25 * unlike - 0.3 * centred;
      if (!found || value > found.value) found = { value, at: [l.at[2], l.at[1], l.at[0], m, r.at[0], r.at[1], r.at[2]] };
    }
  }
  if (!found) return null;

  const corner = (i: number): Vec3 => [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]];
  // A contact: the scan's most labial point of the crowns' incisal part at the bottom of the dip.
  const contactAt = (k: number): Vec3 | null => {
    let best = -1;
    for (let b = Math.max(0, bin[k] - 1); b <= Math.min(bins - 1, bin[k] + 1); b += 1) if (radiusAt[b] >= 0 && (best < 0 || radius[b] < radius[best])) best = b;
    // Build 304: on a coarser scan no corner may fall in the dip's own strips (the outline there was bridged from its
    // neighbours) - the nearest strip that has one stands for it, up to 2 mm off, instead of the marks being given up.
    for (let off = 2; best < 0 && off <= Math.round(2 / STEP); off += 1) {
      for (const b of [bin[k] - off, bin[k] + off]) if (b >= 0 && b < bins && radiusAt[b] >= 0 && (best < 0 || radius[b] < radius[best])) best = b;
    }
    return best < 0 || radiusAt[best] < 0 ? null : corner(radiusAt[best]);
  };
  const contacts = found.at.map(contactAt);
  if (contacts.some((p) => !p)) return null;
  const marks = contacts as Vec3[];
  // The midline mark at the incisal edge: the height of the centrals' edges beside it.
  const mid = found.at[3];
  let top = -Infinity;
  for (let k = Math.max(0, mid - Math.round(EDGE_REACH / STEP)); k <= Math.min(n - 1, mid + Math.round(EDGE_REACH / STEP)); k += 1) top = Math.max(top, H[k]);
  marks[3] = [marks[3][0], marks[3][1], top];
  // The canine tips: the highest point between each canine's contacts (clear of the contacts themselves).
  const tipBetween = (k0: number, k1: number): Vec3 | null => {
    const lo = Math.min(k0, k1), hi = Math.max(k0, k1), inset = Math.round((hi - lo) * 0.2);
    let best = -1;
    for (let b = bin[lo + inset]; b <= bin[hi - inset]; b += 1) if (edgeAt[b] >= 0 && (best < 0 || edge[b] > edge[best])) best = b;
    return best < 0 ? null : corner(edgeAt[best]);
  };
  const tipLow = tipBetween(found.at[0], found.at[1]), tipHigh = tipBetween(found.at[5], found.at[6]);
  if (!tipLow || !tipHigh) return null;
  const dips = found.at.map((k) => score[k]);
  // Found from -x to +x; the marks run from the patient's right.
  if (rightAtPlus) { marks.reverse(); dips.reverse(); return { marks: [...marks, tipHigh, tipLow], score: found.value, dips }; }
  return { marks: [...marks, tipLow, tipHigh], score: found.value, dips };
}

/**
 * The nine marks on a scan (a soup in any coordinates), in those coordinates; null when the scan's front teeth
 * cannot be read well enough to offer them (score below AUTO_MARKS_MIN).
 */
export function autoArchMarks(scan: ArrayLike<number>, slot: "upper" | "lower"): AutoMarks | null {
  const { mesh, frame } = scanInArchFrame(scan);
  // Teeth up and the front at -y: an upper arch is then seen upside down, its right side at +x (a lower's at -x) -
  // the other way round were the frame a mirror.
  const mirrored = frame.determinant() < 0;
  const found = autoMarksInArchFrame(mesh.v, (slot === "upper") !== mirrored, slot);
  if (!found || found.score < AUTO_MARKS_MIN) return null;
  const back = frame.clone().invert();
  return { ...found, marks: found.marks.map((p) => new THREE.Vector3(...p).applyMatrix4(back).toArray() as Vec3) };
}
