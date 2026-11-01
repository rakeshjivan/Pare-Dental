/**
 * Build 106: the arch line - the curve through the incisal edges of the front teeth to the canine tips
 * (and on through the premolars' cusp tips when they are marked), found from the dentist's landmarks,
 * and the wax-up teeth laid along it. Each tooth is only moved and turned (never stretched): centrals
 * either side of the midline, each tooth's mesial contact on its neighbour's distal one, its incisal edge
 * on the curve, its labial face square to it. A narrow arch so turns the teeth more against each other
 * than a broad one, as a technician sets them.
 *
 * Two curves, in the occlusal plane (x across the arch, y forward):
 *  - "follow" (the default): a smooth curve (Catmull-Rom) through the marks themselves, side by side from
 *    the midline - an asymmetric arch, or a canine set deliberately, is followed; past the last mark it
 *    runs straight on (the posterior segment straightens, it does not keep curving in).
 *  - "smooth": a parabola symmetric about the midline, y = c - k x^2, fitted to the marks by least squares,
 *    so one tooth out of line is smoothed over rather than copied.
 * Each tooth keeps its own height (the smile design's edge line), tip and torque; only its turn about the
 * occlusal plane's normal and its place change.
 */
import * as THREE from "three";

type Vec3 = [number, number, number];

export type ArchLine = {
  /** The midline point on the plane, where the centrals meet. */
  centre: Vec3;
  /** Across the arch (towards the patient's left), forward (labial), and the plane's normal (towards the incisal edges). */
  across: Vec3;
  forward: Vec3;
  normal: Vec3;
  /** y = c - k x^2 (the smooth curve). */
  c: number;
  k: number;
  /** The marks in the plane (x across, y forward, from the centre), for the curve that follows them. */
  points: Array<{ fdi: number; x: number; y: number }>;
};

export type ArchTooth = {
  id: string;
  fdi: number;
  /** Mesio-distal width, mm. */
  width: number;
  /** The tooth's frame in the scene: the middle of its incisal edge, and unit directions. */
  origin: Vec3;
  mesial: Vec3;
  out: Vec3;
  up: Vec3;
};

export type ArchLayOptions = {
  /** Scales the curvature (1 = the patient's arch line; less is broader, more is narrower). */
  curve?: number;
  /** Moves the whole line labially, mm. */
  forward?: number;
  /** The line as far forward, on average, as the teeth stand now (default true). */
  keepDepth?: boolean;
  /** The curve through the marks (default) or the smooth symmetric one. */
  follow?: boolean;
};

const v = (a: Vec3) => new THREE.Vector3(a[0], a[1], a[2]);
const left = (fdi: number) => { const q = Math.floor(fdi / 10); return q === 2 || q === 3; };

/**
 * The arch line through the incisal points (FDI -> point, scene coordinates). `up` is roughly the teeth's
 * incisal direction (their frames' up, averaged); `outward` roughly labial. Null with fewer than three
 * points or no spread across the arch.
 */
export function fitArchLine(points: Record<number, Vec3>, up: Vec3, outward: Vec3): ArchLine | null {
  const entries = Object.entries(points).map(([fdi, p]) => ({ fdi: Number(fdi), p: v(p) }));
  if (entries.length < 3) return null;
  const normal = v(up).normalize();
  const rightSide = entries.filter((e) => !left(e.fdi)), leftSide = entries.filter((e) => left(e.fdi));
  if (!rightSide.length || !leftSide.length) return null;
  const mean = (list: typeof entries) => list.reduce((acc, e) => acc.add(e.p), new THREE.Vector3()).divideScalar(list.length);
  const across = mean(leftSide).sub(mean(rightSide));
  across.addScaledVector(normal, -across.dot(normal));
  if (across.length() < 1e-6) return null;
  across.normalize();
  const forward = new THREE.Vector3().crossVectors(normal, across).normalize();
  if (forward.dot(v(outward)) < 0) forward.negate();
  // The midline: between the centrals if both are marked, else the middle of the points.
  const centrals = entries.filter((e) => e.fdi % 10 === 1);
  const mid = centrals.length === 2 ? mean(centrals) : mean(entries);
  // Coordinates in the plane through `mid` (heights dropped).
  const planar = entries.map((e) => { const d = e.p.clone().sub(mid); return { fdi: e.fdi, x: d.dot(across), y: d.dot(forward) }; });
  // Least squares for y = c - k x^2: unknowns c and k.
  let s1 = 0, sx2 = 0, sx4 = 0, sy = 0, syx2 = 0;
  for (const { x, y } of planar) {
    const x2 = x * x;
    s1 += 1; sx2 += x2; sx4 += x2 * x2; sy += y; syx2 += y * x2;
  }
  const det = s1 * sx4 - sx2 * sx2;
  if (Math.abs(det) < 1e-9) return null;
  const c = (sy * sx4 - syx2 * sx2) / det;
  const k = -(s1 * syx2 - sx2 * sy) / det;
  return { centre: mid.toArray() as Vec3, across: across.toArray() as Vec3, forward: forward.toArray() as Vec3, normal: normal.toArray() as Vec3, c, k: Math.max(0.004, k), points: planar };
}

/** A curve in the plane from the midline outwards (one side), sampled densely: x grows away from the midline on the right side (negative x) as on the left. */
type Path = THREE.Vector2[];

const SAMPLE = 0.25;
const REACH = 70;

/** The smooth curve for one side (s = +1 left, -1 right). */
function parabolaPath(c: number, k: number, s: number): Path {
  const out: Path = [];
  for (let x = 0; x <= REACH; x += SAMPLE) out.push(new THREE.Vector2(s * x, c - k * x * x));
  return out;
}

/** Catmull-Rom (centripetal) through the control points, then straight on past the last one. */
function followPath(controls: THREE.Vector2[]): Path {
  const pts = controls;
  const out: Path = [pts[0].clone()];
  if (pts.length < 2) return out;
  const pad = [pts[0].clone().multiplyScalar(2).sub(pts[1]), ...pts, pts[pts.length - 1].clone().multiplyScalar(2).sub(pts[pts.length - 2])];
  for (let i = 1; i < pad.length - 2; i += 1) {
    const p0 = pad[i - 1], p1 = pad[i], p2 = pad[i + 1], p3 = pad[i + 2];
    const steps = Math.max(2, Math.ceil(p1.distanceTo(p2) / SAMPLE));
    for (let j = 1; j <= steps; j += 1) {
      const t = j / steps, t2 = t * t, t3 = t2 * t;
      out.push(new THREE.Vector2(
        0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      ));
    }
  }
  // Straight on past the last mark, along the last stretch's direction.
  const a = out[Math.max(0, out.length - 1 - Math.round(3 / SAMPLE))], b = out[out.length - 1];
  const dir = b.clone().sub(a);
  if (dir.length() > 1e-6) {
    dir.normalize();
    for (let d = SAMPLE; d <= REACH; d += SAMPLE) out.push(b.clone().addScaledVector(dir, d));
  }
  return out;
}

/** The point on the path, walking on from `from` (an index and point on it), whose straight-line distance from `from` is `chord`. */
function stepAlong(path: Path, from: { i: number; p: THREE.Vector2 }, chord: number): { i: number; p: THREE.Vector2 } {
  for (let i = Math.max(1, from.i + 1); i < path.length; i += 1) {
    if (path[i].distanceTo(from.p) < chord) continue;
    // Between path[i - 1] (nearer than chord) and path[i]: bisect for the exact distance.
    let lo = 0, hi = 1;
    const a = path[i - 1].distanceTo(from.p) < chord ? path[i - 1] : from.p, b = path[i];
    for (let n = 0; n < 30; n += 1) {
      const m = (lo + hi) / 2;
      if (a.clone().lerp(b, m).distanceTo(from.p) < chord) lo = m; else hi = m;
    }
    return { i: i - 1, p: a.clone().lerp(b, (lo + hi) / 2) };
  }
  const last = path[path.length - 1];
  return { i: path.length - 1, p: last.clone() };
}

/**
 * The paths for the two sides, `shift` mm further forward, curvature scaled by `curve` (depth from the
 * midline point scaled).
 */
function sidePaths(line: ArchLine, follow: boolean, curve: number, shift: number): { left: Path; right: Path } {
  const scale = (path: Path) => {
    const y0 = path[0].y;
    return path.map((p) => new THREE.Vector2(p.x, y0 + (p.y - y0) * curve + shift));
  };
  if (!follow || line.points.length < 3) return { left: scale(parabolaPath(line.c, line.k, 1)), right: scale(parabolaPath(line.c, line.k, -1)) };
  // The midline point: where the smooth curve crosses it (between the centrals), then each side's marks in
  // tooth order from the midline.
  const mid = new THREE.Vector2(0, line.c);
  const side = (isLeft: boolean) => {
    const marks = line.points.filter((p) => left(p.fdi) === isLeft).sort((a, b) => (a.fdi % 10) - (b.fdi % 10)).map((p) => new THREE.Vector2(p.x, p.y));
    // A mark on the wrong side of the midline (a crossed central) is left out of that side's run.
    const run = marks.filter((p) => (isLeft ? p.x > 0.2 : p.x < -0.2));
    return run.length ? followPath([mid, ...run]) : parabolaPath(line.c, line.k, isLeft ? 1 : -1);
  };
  return { left: scale(side(true)), right: scale(side(false)) };
}

/**
 * Where each tooth goes on the arch line: a rigid move for each (scene coordinates), by its id. Teeth are
 * set out from the midline in order on each side.
 */
export function layOnArchLine(teeth: ArchTooth[], line: ArchLine, options: ArchLayOptions = {}): Map<string, THREE.Matrix4> {
  const curve = Math.max(0.2, options.curve ?? 1), shift = options.forward ?? 0;
  const follow = options.follow !== false;
  const centre = v(line.centre), across = v(line.across), forward = v(line.forward), normal = v(line.normal);
  const lay = (offset: number) => {
    const paths = sidePaths(line, follow, curve, offset);
    const out = new Map<string, THREE.Matrix4>();
    for (const isLeft of [true, false]) {
      const path = isLeft ? paths.left : paths.right;
      const side = teeth.filter((tooth) => left(tooth.fdi) === isLeft).sort((a, b) => (a.fdi % 10) - (b.fdi % 10));
      let at = { i: 0, p: path[0].clone() };
      for (const tooth of side) {
        const w = Math.max(1, tooth.width);
        const distal = stepAlong(path, at, w);
        // The incisal middle: on the curve, halfway along the tooth.
        const middle = stepAlong(path, at, w / 2);
        const mesial2 = at.p.clone().sub(distal.p).normalize();
        const origin = v(tooth.origin);
        const height = origin.clone().sub(centre).dot(normal);
        const mesialNow = v(tooth.mesial);
        const nowAngle = Math.atan2(mesialNow.dot(forward), mesialNow.dot(across));
        const wantAngle = Math.atan2(mesial2.y, mesial2.x);
        const turn = new THREE.Matrix4().makeRotationAxis(normal, wantAngle - nowAngle);
        const target = centre.clone().addScaledVector(across, middle.p.x).addScaledVector(forward, middle.p.y).addScaledVector(normal, height);
        out.set(tooth.id, new THREE.Matrix4().makeTranslation(target.x, target.y, target.z)
          .multiply(turn)
          .multiply(new THREE.Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z)));
        at = distal;
      }
    }
    return out;
  };
  // keepDepth: the line as far forward, on average, as the teeth stand now - the shape from the
  // patient's marks, the place from the wax (which stands clear of the patient's teeth).
  if (options.keepDepth !== false && teeth.length) {
    const first = lay(0);
    let now = 0, laid = 0;
    for (const tooth of teeth) {
      now += v(tooth.origin).sub(centre).dot(forward);
      laid += v(tooth.origin).applyMatrix4(first.get(tooth.id)!).sub(centre).dot(forward);
    }
    return lay((now - laid) / teeth.length + shift);
  }
  return lay(shift);
}
