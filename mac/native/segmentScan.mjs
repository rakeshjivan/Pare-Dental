/*
 * Build 129 (Rakesh): tooth segmentation that runs in the desktop app's own Node server, not the browser - so it
 * has the memory and the time to do it properly on the full-resolution scan. No packages (Node stdlib only), to
 * match serve.mjs. It turns a scan into per-triangle FDI labels, which Wax-up Studio feeds to marginFromLabels
 * for automatic gingival margins, and Smile Guide uses as its teeth.
 *
 * Method (validated against a ball-integrated mean-curvature reference): the gingival margin and the contacts
 * between teeth are grooves - concave folds that run around each crown. Per shared edge, the signed dihedral
 * angle times the edge length is a discrete mean-curvature contribution (concave positive); summed to the
 * vertices and integrated over a small ball, it lights up the grooves. The surface is split into the basins the
 * grooves enclose; the one huge basin (palate + gum) and small fragments are dropped; tooth-sized basins are the
 * crowns, numbered by their place in the arch.
 */

/** Parse a binary or ASCII STL into a flat triangle soup (9 floats per triangle). */
export function parseStl(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  // ASCII?
  const head = new TextDecoder().decode(u8.subarray(0, 256)).trim().toLowerCase();
  if (head.startsWith("solid") && !looksBinary(u8)) return parseAsciiStl(new TextDecoder().decode(u8));
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const n = dv.getUint32(80, true);
  const out = new Float32Array(n * 9);
  let p = 84;
  for (let i = 0; i < n; i += 1) {
    p += 12; // skip normal
    for (let k = 0; k < 9; k += 1) { out[i * 9 + k] = dv.getFloat32(p, true); p += 4; }
    p += 2; // attribute byte count
  }
  return out;
}
function looksBinary(u8) {
  if (u8.length < 84) return false;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const n = dv.getUint32(80, true);
  return u8.length === 84 + n * 50;
}
function parseAsciiStl(text) {
  const nums = [];
  const re = /vertex\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)/g;
  let m;
  while ((m = re.exec(text))) { nums.push(+m[1], +m[2], +m[3]); }
  return Float32Array.from(nums);
}

/** Weld a soup into indexed vertices/faces (quantised at 0.1 micron), face order preserved. */
function weld(soup) {
  const map = new Map();
  const v = [];
  const f = new Int32Array((soup.length / 9) * 3);
  const q = 1e4; // 0.1 micron if mm
  let fi = 0;
  for (let i = 0; i + 2 < soup.length; i += 3) {
    const x = soup[i], y = soup[i + 1], z = soup[i + 2];
    const key = `${Math.round(x * q)},${Math.round(y * q)},${Math.round(z * q)}`;
    let id = map.get(key);
    if (id === undefined) { id = v.length / 3; v.push(x, y, z); map.set(key, id); }
    f[fi++] = id;
  }
  return { v: Float64Array.from(v), f };
}

function segmentLabels(soup, opts = {}) {
  const radius = opts.radius ?? 1.0;
  const groove = opts.groove ?? 0.30;
  const minArea = opts.minArea ?? 10;
  const maxArea = opts.maxArea ?? 320;
  const arch = opts.arch ?? "upper";
  const T = Math.floor(soup.length / 9);
  if (T < 8) return { fdi: new Uint8Array(T), teeth: [] };
  const { v, f } = weld(soup);
  const V = v.length / 3, nf = f.length / 3;

  // face normals + vertex normals
  const fn = new Float64Array(nf * 3);
  for (let t = 0; t < nf; t += 1) {
    const a = f[t * 3] * 3, b = f[t * 3 + 1] * 3, c = f[t * 3 + 2] * 3;
    const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
    const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
    fn[t * 3] = uy * wz - uz * wy; fn[t * 3 + 1] = uz * wx - ux * wz; fn[t * 3 + 2] = ux * wy - uy * wx;
  }
  // vertex adjacency (CSR) + edges with their two faces
  const nbSet = Array.from({ length: V }, () => new Set());
  const edgeMap = new Map();
  const edges = []; // [va, vb, faceA, faceB]
  for (let t = 0; t < nf; t += 1) {
    const vi = [f[t * 3], f[t * 3 + 1], f[t * 3 + 2]];
    for (let i = 0; i < 3; i += 1) {
      const a = vi[i], b = vi[(i + 1) % 3];
      nbSet[a].add(b); nbSet[b].add(a);
      const key = a < b ? a * 4294967296 + b : b * 4294967296 + a;
      const prev = edgeMap.get(key);
      if (prev === undefined) edgeMap.set(key, { e: edges.length, t });
      else { edges.push([a, b, t, prev.t]); }
      if (prev !== undefined) edgeMap.delete(key);
    }
  }
  const start = new Int32Array(V + 1);
  for (let i = 0; i < V; i += 1) start[i + 1] = start[i] + nbSet[i].size;
  const nb = new Int32Array(start[V]);
  for (let i = 0; i < V; i += 1) { let k = start[i]; for (const j of nbSet[i]) nb[k++] = j; }

  // raw per-vertex mean-curvature contribution from incident edges (signed dihedral x length)
  const raw = new Float64Array(V);
  for (const [a, b, ta, tb] of edges) {
    const ax = v[a * 3], ay = v[a * 3 + 1], az = v[a * 3 + 2];
    const len = Math.hypot(v[b * 3] - ax, v[b * 3 + 1] - ay, v[b * 3 + 2] - az);
    // angle between face normals
    let n1x = fn[ta * 3], n1y = fn[ta * 3 + 1], n1z = fn[ta * 3 + 2]; let l1 = Math.hypot(n1x, n1y, n1z) || 1; n1x /= l1; n1y /= l1; n1z /= l1;
    let n2x = fn[tb * 3], n2y = fn[tb * 3 + 1], n2z = fn[tb * 3 + 2]; let l2 = Math.hypot(n2x, n2y, n2z) || 1; n2x /= l2; n2y /= l2; n2z /= l2;
    const dot = Math.max(-1, Math.min(1, n1x * n2x + n1y * n2y + n1z * n2z));
    const angle = Math.acos(dot);
    // concave sign: neighbour face centroid above this face's plane -> concave
    const ca = centroid(v, f, ta), cb = centroid(v, f, tb);
    const sign = (n1x * (cb[0] - ca[0]) + n1y * (cb[1] - ca[1]) + n1z * (cb[2] - ca[2])) > 0 ? 1 : -1;
    const c = sign * angle * len * 0.5;
    raw[a] += c; raw[b] += c;
  }
  // integrate over a ball of `radius` (BFS)
  const curv = new Float64Array(V);
  const seen = new Int32Array(V).fill(-1);
  const queue = new Int32Array(4096);
  const r2 = radius * radius;
  for (let i = 0; i < V; i += 1) {
    let head = 0, tail = 0, sum = 0;
    queue[tail++] = i; seen[i] = i;
    const ix = v[i * 3], iy = v[i * 3 + 1], iz = v[i * 3 + 2];
    while (head < tail) {
      const u = queue[head++]; sum += raw[u];
      for (let k = start[u]; k < start[u + 1]; k += 1) {
        const w = nb[k];
        if (seen[w] === i) continue;
        const dx = v[w * 3] - ix, dy = v[w * 3 + 1] - iy, dz = v[w * 3 + 2] - iz;
        if (dx * dx + dy * dy + dz * dz > r2) continue;
        seen[w] = i; if (tail < queue.length) queue[tail++] = w;
      }
    }
    curv[i] = sum;
  }
  const up = averageNormal(soup);
  // margin threshold: the most concave share of vertices are the grooves (gingival margin + contacts).
  const srt = Float64Array.from(curv).sort();
  const marginThr = srt[Math.min(srt.length - 1, Math.floor((1 - groove) * srt.length))];
  const area = new Float64Array(nf);
  for (let t = 0; t < nf; t += 1) area[t] = triArea(v, f, t);

  // face adjacency (CSR) with a per-crossing barrier flag (true when the shared edge is a margin groove).
  const degree = new Int32Array(nf);
  for (const [, , ta, tb] of edges) { degree[ta] += 1; degree[tb] += 1; }
  const fstart = new Int32Array(nf + 1);
  for (let i = 0; i < nf; i += 1) fstart[i + 1] = fstart[i] + degree[i];
  const fnb = new Int32Array(fstart[nf]);
  const fbar = new Uint8Array(fstart[nf]);
  const fcur = fstart.slice(0, nf);
  for (const [a, b, ta, tb] of edges) {
    const barrier = (curv[a] + curv[b]) * 0.5 >= marginThr ? 1 : 0;
    fnb[fcur[ta]] = tb; fbar[fcur[ta]] = barrier; fcur[ta] += 1;
    fnb[fcur[tb]] = ta; fbar[fcur[tb]] = barrier; fcur[tb] += 1;
  }

  // per-face barrier height = how much of a margin groove the face sits on (watershed elevation).
  const faceCurv = new Float64Array(nf);
  for (let t = 0; t < nf; t += 1) faceCurv[t] = Math.max(curv[f[t * 3]], curv[f[t * 3 + 1]], curv[f[t * 3 + 2]]);

  // markers by non-max suppression over a ~Rm ball: tooth = occlusal-height maxima, gum = height minima.
  const Rm = opts.markerRadius ?? 3.5, rm2 = Rm * Rm;
  const h = new Float64Array(V);
  for (let i = 0; i < V; i += 1) h[i] = v[i * 3] * up[0] + v[i * 3 + 1] * up[1] + v[i * 3 + 2] * up[2];
  const seen2 = new Int32Array(V).fill(-1), q2 = new Int32Array(V);
  const vface = new Int32Array(V).fill(-1);
  for (let t = 0; t < nf; t += 1) for (let j = 0; j < 3; j += 1) { const vv = f[t * 3 + j]; if (vface[vv] < 0) vface[vv] = t; }
  const extrema = (beats) => {
    const faces = [], used = new Set();
    for (let i = 0; i < V; i += 1) {
      let head = 0, tail = 0, ok = 1; q2[tail++] = i; seen2[i] = i;
      const ix = v[i * 3], iy = v[i * 3 + 1], iz = v[i * 3 + 2];
      while (head < tail && ok) {
        const u = q2[head++];
        for (let k = start[u]; k < start[u + 1]; k += 1) {
          const w = nb[k]; if (seen2[w] === i) continue;
          const dx = v[w * 3] - ix, dy = v[w * 3 + 1] - iy, dz = v[w * 3 + 2] - iz;
          if (dx * dx + dy * dy + dz * dz > rm2) continue;
          seen2[w] = i; if (beats(h[w], h[i])) { ok = 0; break; } if (tail < q2.length) q2[tail++] = w;
        }
      }
      if (ok) { const tf = vface[i]; if (tf >= 0 && !used.has(tf)) { used.add(tf); faces.push(tf); } }
    }
    return faces;
  };
  const toothMarks = extrema((hw, hi) => hw > hi + 1e-6);
  const gumMarks = extrema((hw, hi) => hw < hi - 1e-6);

  // priority-flood watershed: basins grow from markers in increasing barrier height and meet at the margin ridges,
  // so each crown fills right down to the gumline and neighbours separate exactly at their contact.
  const label = new Int32Array(nf).fill(-1);
  const hc = [], hf = [], hl = [];
  const swap = (a, b) => { const c = hc[a]; hc[a] = hc[b]; hc[b] = c; const g = hf[a]; hf[a] = hf[b]; hf[b] = g; const m = hl[a]; hl[a] = hl[b]; hl[b] = m; };
  const push = (c, ff, l) => { let i = hc.length; hc.push(c); hf.push(ff); hl.push(l); while (i > 0) { const p = (i - 1) >> 1; if (hc[p] <= hc[i]) break; swap(p, i); i = p; } };
  const pop = () => { const n = hc.length - 1; swap(0, n); const c = hc.pop(), ff = hf.pop(), l = hl.pop(); let i = 0; while (true) { let s = i; const L = 2 * i + 1, R = 2 * i + 2; if (L <= n - 1 && hc[L] < hc[s]) s = L; if (R <= n - 1 && hc[R] < hc[s]) s = R; if (s === i) break; swap(s, i); i = s; } return [c, ff, l]; };
  let next = 1;
  const markerC = new Map();
  for (const t of toothMarks) { const id = next++; markerC.set(id, centroid(v, f, t)); push(faceCurv[t], t, id); }
  for (const t of gumMarks) push(faceCurv[t], t, 0);
  while (hc.length) {
    const [c, ff, l] = pop();
    if (label[ff] !== -1) continue;
    label[ff] = l;
    for (let k = fstart[ff]; k < fstart[ff + 1]; k += 1) { const w = fnb[k]; if (label[w] === -1) push(Math.max(c, faceCurv[w]), w, l); }
  }

  // merge basins of the same tooth: cusp markers whose basins share a long non-margin border (not a real contact).
  const lp = new Int32Array(next); for (let i = 0; i < next; i += 1) lp[i] = i;
  const lf = (x) => { let r = x; while (lp[r] !== r) r = lp[r]; while (lp[x] !== r) { const n = lp[x]; lp[x] = r; x = n; } return r; };
  // Merge basins whose markers sit within one tooth of each other - cusps of a single molar (~3-4 mm apart) -
  // while neighbouring teeth (~5-8 mm) stay separate. Only merge pairs that actually share a border.
  const adjacent = new Set();
  for (const [, , ta, tb] of edges) { const la = label[ta], lb = label[tb]; if (la > 0 && lb > 0 && la !== lb) adjacent.add(la < lb ? la * 100000 + lb : lb * 100000 + la); }
  const mergeDist = opts.mergeDist ?? 4.5, md2 = mergeDist * mergeDist;
  const ids = [...markerC.keys()];
  for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) {
    const A = markerC.get(ids[i]), B = markerC.get(ids[j]);
    const la = Math.min(ids[i], ids[j]), lb = Math.max(ids[i], ids[j]);
    if (!adjacent.has(la * 100000 + lb)) continue;
    const dx = A[0] - B[0], dy = A[1] - B[1], dz = A[2] - B[2];
    if (dx * dx + dy * dy + dz * dz < md2) { const ra = lf(ids[i]), rb = lf(ids[j]); if (ra !== rb) lp[ra] = rb; }
  }
  for (let t = 0; t < nf; t += 1) if (label[t] > 0) label[t] = lf(label[t]);

  // keep tooth-sized basins; number them round the arch.
  const regionArea = new Map();
  for (let t = 0; t < nf; t += 1) { const l = label[t]; if (l > 0) regionArea.set(l, (regionArea.get(l) ?? 0) + area[t]); }
  const rootSet = new Set([...regionArea.entries()].filter(([, a]) => a >= minArea && a <= maxArea).map(([l]) => l));
  const acc = new Map();
  for (let t = 0; t < nf; t += 1) {
    const r = label[t]; if (!rootSet.has(r)) continue;
    const o = t * 9, bx = (soup[o] + soup[o + 3] + soup[o + 6]) / 3, by = (soup[o + 1] + soup[o + 4] + soup[o + 7]) / 3, bz = (soup[o + 2] + soup[o + 5] + soup[o + 8]) / 3;
    const s = acc.get(r) ?? { x: 0, y: 0, z: 0, a: 0 }; s.x += bx * area[t]; s.y += by * area[t]; s.z += bz * area[t]; s.a += area[t]; acc.set(r, s);
  }
  const roots = [...acc.keys()];
  const cen = [0, 0, 0]; let aw = 0;
  for (const s of acc.values()) { cen[0] += s.x; cen[1] += s.y; cen[2] += s.z; aw += s.a; }
  if (aw > 0) { cen[0] /= aw; cen[1] /= aw; cen[2] /= aw; }
  let ex = Math.abs(up[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0];
  const d = ex[0] * up[0] + ex[1] * up[1] + ex[2] * up[2];
  let e1 = [ex[0] - d * up[0], ex[1] - d * up[1], ex[2] - d * up[2]]; const e1l = Math.hypot(...e1) || 1; e1 = e1.map((x) => x / e1l);
  const e2 = [up[1] * e1[2] - up[2] * e1[1], up[2] * e1[0] - up[0] * e1[2], up[0] * e1[1] - up[1] * e1[0]];
  const ordered = roots.map((r) => { const s = acc.get(r); const cx = s.x / s.a - cen[0], cy = s.y / s.a - cen[1], cz = s.z / s.a - cen[2]; return { r, ang: Math.atan2(cx * e2[0] + cy * e2[1] + cz * e2[2], cx * e1[0] + cy * e1[1] + cz * e1[2]) }; }).sort((a, b) => a.ang - b.ang);
  // FDI across the arch: left side 21..27 / right 11..17 is overkill for a label - use sequential 1..N (the margin
  // code only needs each tooth a distinct number). Quadrant/FDI mapping can come later if needed.
  const idOf = new Map(); ordered.forEach((o, i) => idOf.set(o.r, Math.min(250, i + 1)));
  void arch;
  const fdi = new Uint8Array(T);
  for (let t = 0; t < nf && t < T; t += 1) { const id = idOf.get(label[t]); if (id) fdi[t] = id; }
  const teeth = ordered.map((o) => { const s = acc.get(o.r); return { id: idOf.get(o.r), centre: [s.x / s.a, s.y / s.a, s.z / s.a], area: s.a }; });
  return { fdi, teeth };
}

function centroid(v, f, t) { const a = f[t * 3] * 3, b = f[t * 3 + 1] * 3, c = f[t * 3 + 2] * 3; return [(v[a] + v[b] + v[c]) / 3, (v[a + 1] + v[b + 1] + v[c + 1]) / 3, (v[a + 2] + v[b + 2] + v[c + 2]) / 3]; }
function triArea(v, f, t) { const a = f[t * 3] * 3, b = f[t * 3 + 1] * 3, c = f[t * 3 + 2] * 3; const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2]; const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2]; const px = uy * wz - uz * wy, py = uz * wx - ux * wz, pz = ux * wy - uy * wx; return 0.5 * Math.hypot(px, py, pz); }
function averageNormal(soup) { let x = 0, y = 0, z = 0; for (let i = 0; i + 8 < soup.length; i += 9) { const ux = soup[i + 3] - soup[i], uy = soup[i + 4] - soup[i + 1], uz = soup[i + 5] - soup[i + 2]; const wx = soup[i + 6] - soup[i], wy = soup[i + 7] - soup[i + 1], wz = soup[i + 8] - soup[i + 2]; x += uy * wz - uz * wy; y += uz * wx - ux * wz; z += ux * wy - uy * wx; } const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; }

export { segmentLabels, weld, triArea, averageNormal };
