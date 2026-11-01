"use client";

/**
 * Build 79: the wax-up landmarks - each click on the view marks a point (page pixels); the view can
 * still be turned and zoomed as with the trim line (right or middle button, wheel). Esc gives up.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { passToView } from "./DentalTrimOverlay";

export function WaxupPointOverlay({ hint, onPick, onCancel, onUndo }: { hint: string; onPick: (x: number, y: number) => void; onCancel: () => void; /** Build 105: Backspace takes back the last point. */ onUndo?: () => void }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHost(document.querySelector<HTMLElement>(".workplane-plane"));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      } else if (event.key === "Backspace" && onUndo) {
        event.preventDefault();
        event.stopPropagation();
        onUndo();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel, onUndo]);
  if (!host) return null;
  return createPortal(
    <div
      className="dental-trim-overlay waxup-point-overlay"
      role="application"
      aria-label={hint}
      onWheel={passToView.wheel}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (passToView.pointerDown(event)) return;
        if (event.button !== 0) return;
        event.preventDefault();
        onPick(event.clientX, event.clientY);
      }}
    >
      <p className="dental-trim-hint">{hint}</p>
    </div>,
    host,
  );
}

/** The nearest triangle of `world` (a soup) the ray meets, as the point it meets it at; null if none. */
export function rayHit(world: ArrayLike<number>, origin: [number, number, number], direction: [number, number, number]): [number, number, number] | null {
  let best = Infinity;
  const [ox, oy, oz] = origin, [dx, dy, dz] = direction;
  for (let t = 0; t + 8 < world.length; t += 9) {
    const ax = world[t], ay = world[t + 1], az = world[t + 2];
    const e1x = world[t + 3] - ax, e1y = world[t + 4] - ay, e1z = world[t + 5] - az;
    const e2x = world[t + 6] - ax, e2y = world[t + 7] - ay, e2z = world[t + 8] - az;
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const sx = ox - ax, sy = oy - ay, sz = oz - az;
    const u = (sx * px + sy * py + sz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const distance = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (distance > 1e-6 && distance < best) best = distance;
  }
  return Number.isFinite(best) ? [ox + dx * best, oy + dy * best, oz + dz * best] : null;
}

/** A small diamond (octahedron) at each point, as a soup - landmarks drawn with the view's highlight. */
export function markerTriangles(points: Array<[number, number, number]>, size = 0.6): Float32Array {
  const out: number[] = [];
  const axes: Array<[number, number, number]> = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (const [x, y, z] of points) {
    const corner = (axis: number, sign: number): [number, number, number] => [x + axes[axis][0] * sign * size, y + axes[axis][1] * sign * size, z + axes[axis][2] * sign * size];
    for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
      const a = corner(0, sx), b = corner(1, sy), c = corner(2, sz);
      // Outward: flip the winding on odd octants.
      if (sx * sy * sz > 0) out.push(...a, ...b, ...c);
      else out.push(...a, ...c, ...b);
    }
  }
  return Float32Array.from(out);
}

/** Build 107: a soup's triangles filed in a uniform grid of cells, for quick ray look-ups. */
export type RayGrid = { tris: ArrayLike<number>; min: [number, number, number]; cell: number; dims: [number, number, number]; starts: Uint32Array; items: Uint32Array };

export function rayGrid(tris: ArrayLike<number>, cell = 1.5): RayGrid {
  const count = Math.floor(tris.length / 9);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count * 9; i += 3) for (let k = 0; k < 3; k += 1) { const v = tris[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
  if (!count) return { tris, min: [0, 0, 0], cell, dims: [1, 1, 1], starts: new Uint32Array(2), items: new Uint32Array(0) };
  // Not more than about 2M cells, however big the soup.
  let size = cell;
  while ((Math.ceil((max[0] - min[0]) / size) + 1) * (Math.ceil((max[1] - min[1]) / size) + 1) * (Math.ceil((max[2] - min[2]) / size) + 1) > 2e6) size *= 1.5;
  const dims: [number, number, number] = [0, 1, 2].map((k) => Math.max(1, Math.ceil((max[k] - min[k]) / size) + 1)) as [number, number, number];
  const cellRange = (t: number, k: number) => {
    const a = tris[t * 9 + k], b = tris[t * 9 + 3 + k], c = tris[t * 9 + 6 + k];
    const lo = Math.floor((Math.min(a, b, c) - min[k]) / size), hi = Math.floor((Math.max(a, b, c) - min[k]) / size);
    return [Math.max(0, lo), Math.min(dims[k] - 1, hi)];
  };
  const counts = new Uint32Array(dims[0] * dims[1] * dims[2] + 1);
  const each = (t: number, visit: (index: number) => void) => {
    const [x0, x1] = cellRange(t, 0), [y0, y1] = cellRange(t, 1), [z0, z1] = cellRange(t, 2);
    for (let x = x0; x <= x1; x += 1) for (let y = y0; y <= y1; y += 1) for (let z = z0; z <= z1; z += 1) visit((x * dims[1] + y) * dims[2] + z);
  };
  for (let t = 0; t < count; t += 1) each(t, (index) => { counts[index + 1] += 1; });
  for (let i = 1; i < counts.length; i += 1) counts[i] += counts[i - 1];
  const starts = counts.slice();
  const fill = counts.slice();
  const items = new Uint32Array(starts[starts.length - 1]);
  for (let t = 0; t < count; t += 1) each(t, (index) => { items[fill[index]] = t; fill[index] += 1; });
  return { tris, min, cell: size, dims, starts, items };
}

/** rayHit through a grid: the cells along the ray in order (3D DDA), stopping at the first cell holding a hit. */
export function rayHitGrid(grid: RayGrid, origin: [number, number, number], direction: [number, number, number]): [number, number, number] | null {
  const { tris, min, cell, dims, starts, items } = grid;
  const max = [0, 1, 2].map((k) => min[k] + dims[k] * cell);
  // Where the ray enters and leaves the grid's box.
  let t0 = 0, t1 = Infinity;
  for (let k = 0; k < 3; k += 1) {
    if (Math.abs(direction[k]) < 1e-12) { if (origin[k] < min[k] || origin[k] > max[k]) return null; continue; }
    let a = (min[k] - origin[k]) / direction[k], b = (max[k] - origin[k]) / direction[k];
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
  }
  if (t0 > t1) return null;
  const start = [0, 1, 2].map((k) => origin[k] + direction[k] * (t0 + 1e-6));
  const at = [0, 1, 2].map((k) => Math.min(dims[k] - 1, Math.max(0, Math.floor((start[k] - min[k]) / cell))));
  const step = [0, 1, 2].map((k) => (direction[k] > 0 ? 1 : -1));
  const next = [0, 1, 2].map((k) => (Math.abs(direction[k]) < 1e-12 ? Infinity : (min[k] + (at[k] + (step[k] > 0 ? 1 : 0)) * cell - origin[k]) / direction[k]));
  const delta = [0, 1, 2].map((k) => (Math.abs(direction[k]) < 1e-12 ? Infinity : cell / Math.abs(direction[k])));
  const seen = new Set<number>();
  const [ox, oy, oz] = origin, [dx, dy, dz] = direction;
  let best = Infinity;
  for (let guard = 0; guard < 100000; guard += 1) {
    const index = (at[0] * dims[1] + at[1]) * dims[2] + at[2];
    for (let i = starts[index]; i < starts[index + 1]; i += 1) {
      const tri = items[i];
      if (seen.has(tri)) continue;
      seen.add(tri);
      const t = tri * 9;
      const ax = tris[t], ay = tris[t + 1], az = tris[t + 2];
      const e1x = tris[t + 3] - ax, e1y = tris[t + 4] - ay, e1z = tris[t + 5] - az;
      const e2x = tris[t + 6] - ax, e2y = tris[t + 7] - ay, e2z = tris[t + 8] - az;
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det;
      const sx = ox - ax, sy = oy - ay, sz = oz - az;
      const u = (sx * px + sy * py + sz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      const distance = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (distance > 1e-6 && distance < best) best = distance;
    }
    // A hit no further than this cell's far side is the nearest there is.
    const exit = Math.min(next[0], next[1], next[2]);
    if (best <= exit) break;
    const k = next[0] <= next[1] && next[0] <= next[2] ? 0 : next[1] <= next[2] ? 1 : 2;
    at[k] += step[k];
    if (at[k] < 0 || at[k] >= dims[k] || next[k] > t1 + cell) break;
    next[k] += delta[k];
  }
  return Number.isFinite(best) ? [ox + dx * best, oy + dy * best, oz + dz * best] : null;
}
