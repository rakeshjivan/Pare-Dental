/**
 * Build 312 (Rakesh: "after a change is made to a part of the tooth it seems to recalculate and fix up the tooth to
 * accommodate, and not lose anatomy" - and, of a flared side that came out hollow and then flat: "no straight, you
 * can see the 3 dimensional curve of the tooth"): a tooth shaped by handles, as a bend of the space the tooth is in.
 *
 * Some spots are handles. A handle that is pulled goes exactly where it is pulled; a handle that is held stays
 * exactly where it is; everywhere else moves by the gentlest bend of space that does both - the one a sheet of
 * spring steel pinned at the handles would take: no point or crease at a handle, no straight run between two, and no
 * more bending anywhere than the handles ask for. Because the bend is gentle and the tooth's own detail is small, the
 * detail - lobes, ridges, line angles, the fullness of a side - rides along on it unchanged.
 *
 * Why space and not the surface (lib/toothHandles spreads the same idea over the mesh): the move of a point depends
 * only on where the point is. So it needs no mesh (a tooth is drawn from loose triangles), nothing is worked out in
 * advance (a few handles: a few numbers to solve for, in well under a millisecond), any spot can become a handle at
 * any time, and a change can be read back from the tooth it made (lib/waxToothEdit uneditTooth), which the brushes
 * rely on.
 *
 * How: the move at x is  sum over handles of c_i |x - h_i|^3  +  a straight part (a shift and a shear),  with the
 * c_i and the straight part chosen so the move at each handle is its pull (zero if held). |r|^3 is the kernel whose
 * interpolant bends least (the triharmonic spline); the straight part is what costs no bending at all.
 *
 * Written here from the mathematics (radial basis interpolation with a polynomial part; Gaussian elimination); no
 * code taken.
 */

export type Vec3 = readonly [number, number, number];
/** A handle: where it is, and how far it is pulled (mm; nothing, or all zero: held where it is). */
export type SpaceHandle = { at: Vec3; pull?: Vec3 };
export type SpaceBend = { handles: Vec3[]; /** Per handle, the three weights of its kernel. */ c: Float64Array; /** The straight part: 4 rows (1, x, y, z) of 3. */ a: Float64Array };

/** Solves M x = b in place (M n x n by rows, b n x 3) by elimination with the largest pivot of each column; false if M has no answer. */
function solve(M: Float64Array, b: Float64Array, n: number): boolean {
  for (let col = 0; col < n; col += 1) {
    let best = col, most = Math.abs(M[col * n + col]);
    for (let row = col + 1; row < n; row += 1) { const size = Math.abs(M[row * n + col]); if (size > most) { most = size; best = row; } }
    if (most < 1e-12) return false;
    if (best !== col) {
      for (let k = 0; k < n; k += 1) { const keep = M[col * n + k]; M[col * n + k] = M[best * n + k]; M[best * n + k] = keep; }
      for (let k = 0; k < 3; k += 1) { const keep = b[col * 3 + k]; b[col * 3 + k] = b[best * 3 + k]; b[best * 3 + k] = keep; }
    }
    for (let row = col + 1; row < n; row += 1) {
      const by = M[row * n + col] / M[col * n + col];
      if (!by) continue;
      for (let k = col; k < n; k += 1) M[row * n + k] -= by * M[col * n + k];
      for (let k = 0; k < 3; k += 1) b[row * 3 + k] -= by * b[col * 3 + k];
    }
  }
  for (let row = n - 1; row >= 0; row -= 1) {
    for (let k = 0; k < 3; k += 1) {
      let sum = b[row * 3 + k];
      for (let col = row + 1; col < n; col += 1) sum -= M[row * n + col] * b[col * 3 + k];
      b[row * 3 + k] = sum / M[row * n + row];
    }
  }
  return true;
}

/**
 * The bend of space that takes each handle by its pull. With fewer than four handles, or handles all in one plane,
 * a shear is not pinned down by them: the straight part is then only a shift (and with one handle, the whole move is
 * that handle's pull). Null with no handles.
 */
export function bendSpace(handles: readonly SpaceHandle[]): SpaceBend | null {
  const k = handles.length;
  if (!k) return null;
  const at = handles.map((handle) => handle.at);
  const build = (straight: 4 | 1) => {
    const n = k + straight, M = new Float64Array(n * n), b = new Float64Array(n * 3);
    for (let i = 0; i < k; i += 1) {
      for (let j = 0; j < k; j += 1) { const r = Math.hypot(at[i][0] - at[j][0], at[i][1] - at[j][1], at[i][2] - at[j][2]); M[i * n + j] = r * r * r; }
      const row = [1, at[i][0], at[i][1], at[i][2]];
      for (let s = 0; s < straight; s += 1) { M[i * n + k + s] = row[s]; M[(k + s) * n + i] = row[s]; }
      const pull = handles[i].pull;
      if (pull) { b[i * 3] = pull[0]; b[i * 3 + 1] = pull[1]; b[i * 3 + 2] = pull[2]; }
    }
    if (!solve(M, b, n)) return null;
    const a = new Float64Array(12);
    a.set(b.subarray(k * 3, (k + straight) * 3));
    return { handles: at.map((p) => [p[0], p[1], p[2]] as Vec3), c: b.slice(0, k * 3), a };
  };
  return (k >= 4 ? build(4) : null) ?? build(1);
}

/** The move of the point (x, y, z) under a bend, written into `out` (3 numbers). */
export function bendAt(bend: SpaceBend, x: number, y: number, z: number, out: Float64Array | number[]): void {
  const { handles, c, a } = bend;
  let dx = a[0] + a[3] * x + a[6] * y + a[9] * z, dy = a[1] + a[4] * x + a[7] * y + a[10] * z, dz = a[2] + a[5] * x + a[8] * y + a[11] * z;
  for (let i = 0; i < handles.length; i += 1) {
    const h = handles[i], r = Math.hypot(x - h[0], y - h[1], z - h[2]), r3 = r * r * r;
    dx += c[i * 3] * r3; dy += c[i * 3 + 1] * r3; dz += c[i * 3 + 2] * r3;
  }
  out[0] = dx; out[1] = dy; out[2] = dz;
}

/** Points (x, y, z, x, y, z ...) moved by a bend. */
export function bendPoints(points: ArrayLike<number>, bend: SpaceBend | null): Float64Array {
  const out = Float64Array.from(points as ArrayLike<number>);
  if (!bend) return out;
  const move = [0, 0, 0];
  for (let i = 0; i + 2 < out.length; i += 3) { bendAt(bend, out[i], out[i + 1], out[i + 2], move); out[i] += move[0]; out[i + 1] += move[1]; out[i + 2] += move[2]; }
  return out;
}
