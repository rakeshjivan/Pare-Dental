/**
 * Build 311 (Rakesh: "getting ultimate control of the tooth is tricky ... after a change is made to a part of the
 * tooth it seems to recalculate and fix up the tooth to accommodate, and not lose anatomy" - "seriously investigate
 * the deformation engine"): a tooth shaped by handles.
 *
 * The idea (the same as the moving / elastic / fixed areas other dental CAD describes): some spots on the tooth are
 * handles. A handle that is pulled takes the surface round it along; a handle that is held keeps the surface round
 * it where it is; everything between them is elastic - it follows whichever handles are near, by a share that
 * falls away smoothly over the surface itself (round the tooth, not through it). Because that share varies slowly,
 * the tooth's own detail - its lobes, ridges and line angles - rides along unchanged: the tooth is re-formed, not
 * dented.
 *
 * How: for each handle, a weight at every corner of the tooth - 1 at the handle, 0 at every other handle, and
 * between them the smoothest spread there is over the surface (a harmonic function: each corner the average of its
 * neighbours, found by conjugate gradients), then eased at both ends so the surface leaves a handle and meets a
 * held one without a crease. The weights are found once for a tooth and its set of handles; after that any pull of
 * any handle is a sum - instant, and exactly undone by taking the same sum off.
 *
 * Build 312 (Rakesh, of a side that came out hollow and then flat: "no straight, you can see the 3 dimensional
 * curve of the tooth"): the stiff spread. The smoothest spread above behaves like a stretched membrane - it comes
 * to a point at a handle and runs nearly straight between two - so a side pulled by it loses its fullness. The stiff
 * spread behaves like a bent sheet of spring steel instead (the least bending, not the least stretching: each
 * corner's difference from its neighbours is itself as even as it can be). It leaves a handle level, with no
 * point and no crease, and carries the pull out in a full curve - so the tooth's own bulge rides on a gently
 * curved move and stays a bulge.
 *
 * Written here from the mathematics (harmonic and biharmonic coordinates on a mesh; the conjugate gradient method);
 * no code taken.
 */

export type HandleMesh = { points: Float64Array; triangles: Uint32Array };
/** A handle: where it is (mm, the tooth's own coordinates) and how far round it the surface is wholly its own. */
export type Handle = { id: string; at: [number, number, number]; reach: number };
export type HandleWeights = { ids: string[]; /** For handle k, corner v: weights[k][v]. */ weights: Float32Array[]; rounds: number };

/** Each corner's neighbours with an edge weight (1 / length: near neighbours count more), as flat lists. */
function edges(mesh: HandleMesh): { start: Uint32Array; other: Uint32Array; weight: Float64Array; total: Float64Array } {
  const n = mesh.points.length / 3, t = mesh.triangles, p = mesh.points;
  const seen = new Set<number>();
  const pairs: number[] = [];
  for (let i = 0; i + 2 < t.length; i += 3) {
    for (let k = 0; k < 3; k += 1) {
      const a = t[i + k], b = t[i + ((k + 1) % 3)];
      const lo = Math.min(a, b), hi = Math.max(a, b), key = lo * n + hi;
      if (lo === hi || seen.has(key)) continue;
      seen.add(key);
      pairs.push(lo, hi);
    }
  }
  const count = new Uint32Array(n + 1);
  for (let i = 0; i < pairs.length; i += 1) count[pairs[i] + 1] += 1;
  for (let v = 0; v < n; v += 1) count[v + 1] += count[v];
  const start = count.slice(), fill = count.slice(0, n);
  const other = new Uint32Array(pairs.length), weight = new Float64Array(pairs.length), total = new Float64Array(n);
  for (let i = 0; i < pairs.length; i += 2) {
    const a = pairs[i], b = pairs[i + 1];
    const w = 1 / Math.max(1e-6, Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]));
    other[fill[a]] = b; weight[fill[a]] = w; fill[a] += 1;
    other[fill[b]] = a; weight[fill[b]] = w; fill[b] += 1;
    total[a] += w; total[b] += w;
  }
  return { start, other, weight, total };
}

const ease = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/**
 * The weights of each handle over the mesh. A corner within a handle's reach is that handle's (weight 1 for it, 0
 * for the others; where two reaches overlap, the nearer handle's). `tolerance`: how close the spread is brought to
 * the smoothest (the largest change left in any weight).
 */
export function handleWeights(mesh: HandleMesh, handles: Handle[], tolerance = 1e-4, stiff = false): HandleWeights {
  const n = mesh.points.length / 3, p = mesh.points;
  const { start, other, weight, total } = edges(mesh);
  // Which handle holds each corner (-1: free).
  const held = new Int32Array(n).fill(-1);
  for (let v = 0; v < n; v += 1) {
    let best = Infinity;
    handles.forEach((handle, k) => {
      const d = Math.hypot(p[v * 3] - handle.at[0], p[v * 3 + 1] - handle.at[1], p[v * 3 + 2] - handle.at[2]);
      if (d <= handle.reach && d < best) { best = d; held[v] = k; }
    });
  }
  // A handle whose reach holds no corner takes the corner nearest it.
  handles.forEach((handle, k) => {
    if (held.includes(k)) return;
    let near = -1, best = Infinity;
    for (let v = 0; v < n; v += 1) { const d = Math.hypot(p[v * 3] - handle.at[0], p[v * 3 + 1] - handle.at[1], p[v * 3 + 2] - handle.at[2]); if (d < best && held[v] < 0) { best = d; near = v; } }
    if (near >= 0) held[near] = k;
  });
  const free: number[] = [];
  for (let v = 0; v < n; v += 1) if (held[v] < 0) free.push(v);
  const slot = new Int32Array(n).fill(-1);
  free.forEach((v, i) => { slot[v] = i; });
  const m = free.length;
  // A x for the free corners: (sum of edge weights) x_v - sum over free neighbours of w x_u.
  const apply = (x: Float64Array, out: Float64Array) => {
    for (let i = 0; i < m; i += 1) {
      const v = free[i];
      let sum = total[v] * x[i];
      for (let e = start[v]; e < start[v + 1]; e += 1) { const j = slot[other[e]]; if (j >= 0) sum -= weight[e] * x[j]; }
      out[i] = sum;
    }
  };
  if (stiff) return stiffWeights(n, handles, held, free, slot, { start, other, weight, total }, tolerance);
  const weights: Float32Array[] = [];
  let rounds = 0;
  const x = new Float64Array(m), r = new Float64Array(m), z = new Float64Array(m), d = new Float64Array(m), q = new Float64Array(m);
  handles.forEach((_, k) => {
    // b: what the held corners of this handle send to their free neighbours.
    x.fill(0);
    for (let i = 0; i < m; i += 1) {
      const v = free[i];
      let sum = 0;
      for (let e = start[v]; e < start[v + 1]; e += 1) if (held[other[e]] === k) sum += weight[e];
      r[i] = sum;
    }
    // Conjugate gradients, each corner scaled by its own weight (Jacobi).
    let rz = 0;
    for (let i = 0; i < m; i += 1) { z[i] = r[i] / total[free[i]]; d[i] = z[i]; rz += r[i] * z[i]; }
    for (let round = 0; round < 4000 && rz > 1e-30; round += 1) {
      apply(d, q);
      let dq = 0;
      for (let i = 0; i < m; i += 1) dq += d[i] * q[i];
      if (!(dq > 0)) break;
      const alpha = rz / dq;
      let most = 0;
      for (let i = 0; i < m; i += 1) { const step = alpha * d[i]; x[i] += step; r[i] -= alpha * q[i]; if (Math.abs(step) > most) most = Math.abs(step); }
      rounds += 1;
      if (most < tolerance) break;
      let next = 0;
      for (let i = 0; i < m; i += 1) { z[i] = r[i] / total[free[i]]; next += r[i] * z[i]; }
      const beta = next / rz;
      rz = next;
      for (let i = 0; i < m; i += 1) d[i] = z[i] + beta * d[i];
    }
    const w = new Float32Array(n);
    for (let v = 0; v < n; v += 1) w[v] = held[v] === k ? 1 : held[v] >= 0 ? 0 : ease(x[slot[v]]);
    weights.push(w);
  });
  return { ids: handles.map((handle) => handle.id), weights, rounds };
}

/**
 * The stiff spread: for each handle the weights w (1 on it, 0 on the others) whose unevenness - at every corner,
 * its difference from the average of its neighbours - is as small as can be over the whole tooth, handles'
 * corners included (which is what keeps the surface level where it leaves a handle). That is least squares:
 * (Lf' Lf) x = -Lf' Lh h, with L the difference-from-neighbours of every corner, split into its free and its held
 * columns; solved by conjugate gradients, each corner scaled by its own diagonal.
 */
function stiffWeights(n: number, handles: Handle[], held: Int32Array, free: number[], slot: Int32Array, graph: ReturnType<typeof edges>, tolerance: number): HandleWeights {
  const { start, other, weight, total } = graph;
  const m = free.length;
  // L y for every corner, y given on all corners.
  const lap = (y: Float64Array, out: Float64Array) => {
    for (let v = 0; v < n; v += 1) {
      let sum = 0;
      for (let e = start[v]; e < start[v + 1]; e += 1) sum += weight[e] * y[other[e]];
      out[v] = y[v] - sum / total[v];
    }
  };
  // L' y (L is not symmetric once each row is divided by its own total).
  const lapT = (y: Float64Array, out: Float64Array) => {
    for (let v = 0; v < n; v += 1) out[v] = y[v];
    for (let v = 0; v < n; v += 1) { const share = y[v] / total[v]; for (let e = start[v]; e < start[v + 1]; e += 1) out[other[e]] -= weight[e] * share; }
  };
  // The diagonal of Lf' Lf: for free corner u, 1 + the sum over its neighbours v of (w / total_v) squared.
  const scale = new Float64Array(m);
  for (let i = 0; i < m; i += 1) scale[i] = 1;
  for (let v = 0; v < n; v += 1) for (let e = start[v]; e < start[v + 1]; e += 1) { const j = slot[other[e]]; if (j >= 0) scale[j] += (weight[e] / total[v]) ** 2; }
  const full = new Float64Array(n), mid = new Float64Array(n), back = new Float64Array(n);
  const apply = (x: Float64Array, out: Float64Array) => {
    full.fill(0);
    for (let i = 0; i < m; i += 1) full[free[i]] = x[i];
    lap(full, mid); lapT(mid, back);
    for (let i = 0; i < m; i += 1) out[i] = back[free[i]];
  };
  const weights: Float32Array[] = [];
  let rounds = 0;
  const x = new Float64Array(m), r = new Float64Array(m), z = new Float64Array(m), d = new Float64Array(m), q = new Float64Array(m);
  handles.forEach((_, k) => {
    x.fill(0);
    full.fill(0);
    for (let v = 0; v < n; v += 1) if (held[v] === k) full[v] = 1;
    lap(full, mid); lapT(mid, back);
    let rz = 0;
    for (let i = 0; i < m; i += 1) { r[i] = -back[free[i]]; z[i] = r[i] / scale[i]; d[i] = z[i]; rz += r[i] * z[i]; }
    let calm = 0;
    for (let round = 0; round < 20000 && rz > 1e-30; round += 1) {
      apply(d, q);
      let dq = 0;
      for (let i = 0; i < m; i += 1) dq += d[i] * q[i];
      if (!(dq > 0)) break;
      const alpha = rz / dq;
      let most = 0;
      for (let i = 0; i < m; i += 1) { const step = alpha * d[i]; x[i] += step; r[i] -= alpha * q[i]; if (Math.abs(step) > most) most = Math.abs(step); }
      rounds += 1;
      // A stiff spread settles slowly and unevenly: stop only once the steps have stayed small for a while.
      calm = most < tolerance ? calm + 1 : 0;
      if (calm >= 20) break;
      let next = 0;
      for (let i = 0; i < m; i += 1) { z[i] = r[i] / scale[i]; next += r[i] * z[i]; }
      const beta = next / rz;
      rz = next;
      for (let i = 0; i < m; i += 1) d[i] = z[i] + beta * d[i];
    }
    const w = new Float32Array(n);
    // A bent sheet may spring a little past its ends (under 0, over 1); the share is kept as found, not eased.
    for (let v = 0; v < n; v += 1) w[v] = held[v] === k ? 1 : held[v] >= 0 ? 0 : x[slot[v]];
    weights.push(w);
  });
  return { ids: handles.map((handle) => handle.id), weights, rounds };
}

/** The mesh's corners with the handles pulled: each corner moved by the sum of its weights times the pulls (mm). A handle with no pull is held. */
export function pullHandles(points: ArrayLike<number>, found: HandleWeights, pulls: Readonly<Record<string, readonly [number, number, number] | undefined>>, back = false): Float64Array {
  const out = Float64Array.from(points as ArrayLike<number>);
  const sign = back ? -1 : 1;
  found.ids.forEach((id, k) => {
    const pull = pulls[id];
    if (!pull || (!pull[0] && !pull[1] && !pull[2])) return;
    const w = found.weights[k];
    for (let v = 0; v < w.length; v += 1) {
      const share = w[v] * sign;
      if (!share) continue;
      out[v * 3] += share * pull[0]; out[v * 3 + 1] += share * pull[1]; out[v * 3 + 2] += share * pull[2];
    }
  });
  return out;
}
