/**
 * Build 306 (Rakesh: "the ideal would be for the scan and wax-up tooth to be blended so it is a smooth transition to
 * the gum ... no steps or tears, ledges ... it needs to end up looking like the wax tooth is the patient's own
 * tooth"): wax flowed into the join.
 *
 * A wax tooth joined to the model (a union) meets the gum, and any of the patient's tooth standing out of it, at a
 * sharp crease or a step. A technician runs a little wax into that corner. So does this: wherever the tooth's
 * surface and the model's come together, the corner between them is filled - a fillet, deepest (BLEND_REACH / 4)
 * right in the crease and thinning to nothing along both surfaces within about BLEND_REACH of it. It only ever adds:
 * no corner of the scan or of the tooth is moved, the gum beyond the fillet is as scanned.
 *
 * How: both solids as distance fields on a fine grid round the tooth, their smooth union (the polynomial smooth
 * maximum, Inigo Quilez's "smooth minimum" - a formula, no code taken), and what that has over the plain union, as a
 * solid of its own to be joined on with the tooth.
 */
import type { ManifoldRuntime, ManifoldSolid } from "@/lib/dentalMesh";
import { solidPositions } from "@/lib/dentalMesh";
import { sampler, squaredDistanceTo, voxelise, type Grid } from "@/lib/meshRound";

/** How far apart the two surfaces may be for wax to be run between them, mm - the fillet is a quarter of this deep in a crease. */
export const BLEND_REACH = 1.6;
/** The grid, mm. */
export const BLEND_CELL = 0.12;
/** The fillet is drawn in by this (the grid's uncertainty), so it never stands as a skin on a surface it only runs along, mm. */
export const BLEND_INSET = 0.05;
/** The most cells of a tooth's grid (a coarser grid beyond). */
const BLEND_CELLS = 4_000_000;

/** A solid's signed distance at each cell centre, mm: positive inside. */
function signed(inside: Uint8Array, grid: Grid): Float32Array {
  const { nx, ny, nz, h } = grid;
  const outside = new Uint8Array(inside.length);
  for (let i = 0; i < inside.length; i += 1) outside[i] = inside[i] ? 0 : 1;
  const toOut = squaredDistanceTo(outside, nx, ny, nz), toIn = squaredDistanceTo(inside, nx, ny, nz);
  const field = new Float32Array(inside.length);
  // A cell's centre is half a cell from the face between it and the other kind.
  for (let i = 0; i < field.length; i += 1) field[i] = inside[i] ? (Math.sqrt(toOut[i]) - 0.5) * h : -(Math.sqrt(toIn[i]) - 0.5) * h;
  return field;
}

/** The field evened over each cell and its six neighbours (the cells' staircase taken off). */
function evened(field: Float32Array, grid: Grid): Float32Array {
  const { nx, ny, nz } = grid, out = new Float32Array(field.length), sx = 1, sy = nx, sz = nx * ny;
  for (let z = 0; z < nz; z += 1) for (let y = 0; y < ny; y += 1) for (let x = 0; x < nx; x += 1) {
    const i = (z * ny + y) * nx + x;
    if (x === 0 || y === 0 || z === 0 || x === nx - 1 || y === ny - 1 || z === nz - 1) { out[i] = field[i]; continue; }
    out[i] = (2 * field[i] + field[i - sx] + field[i + sx] + field[i - sy] + field[i + sy] + field[i - sz] + field[i + sz]) / 8;
  }
  return out;
}

/**
 * The wax to run into the join of `tooth` and `model` - a solid to be joined on with the tooth, or null when the two
 * do not come together (or it cannot be made). The caller frees it.
 */
export function waxBlend(runtime: ManifoldRuntime, model: ManifoldSolid, tooth: ManifoldSolid, reach = BLEND_REACH): ManifoldSolid | null {
  if (reach <= 0 || tooth.isEmpty() || model.isEmpty()) return null;
  const box = tooth.boundingBox(), pad = 2 * reach;
  const min = [box.min[0] - pad, box.min[1] - pad, box.min[2] - pad] as [number, number, number];
  const size = [box.max[0] - box.min[0] + 2 * pad, box.max[1] - box.min[1] + 2 * pad, box.max[2] - box.min[2] + 2 * pad] as [number, number, number];
  let local: ManifoldSolid | null = null, room: ManifoldSolid | null = null;
  try {
    room = runtime.Manifold.cube(size, false).translate(min);
    local = runtime.Manifold.intersection(model, room);
    if (local.isEmpty()) return null;
    const h = Math.max(BLEND_CELL, Math.cbrt((size[0] * size[1] * size[2]) / BLEND_CELLS));
    const grid: Grid = { nx: Math.ceil(size[0] / h), ny: Math.ceil(size[1] / h), nz: Math.ceil(size[2] / h), h, origin: min };
    const a = evened(signed(voxelise(solidPositions(tooth), grid), grid), grid);
    const b = evened(signed(voxelise(solidPositions(local), grid), grid), grid);
    // The smooth union's surplus over the plain one, only where both surfaces are within reach.
    const field = new Float32Array(a.length);
    let any = false;
    for (let i = 0; i < field.length; i += 1) {
      const p = a[i], q = b[i];
      const near = reach - Math.max(Math.abs(p), Math.abs(q));
      if (near <= 0) { field[i] = -1; continue; }
      const t = Math.max(reach - Math.abs(p - q), 0) / reach;
      const value = Math.min(Math.max(p, q) + (t * t * reach) / 4 - BLEND_INSET, near);
      field[i] = value;
      // Wax there is only where neither solid is.
      if (value > 0 && p < 0 && q < 0) any = true;
    }
    if (!any) return null;
    const bounds = { min, max: [min[0] + grid.nx * h, min[1] + grid.ny * h, min[2] + grid.nz * h] as [number, number, number] };
    const made = runtime.Manifold.levelSet(sampler(field, grid, -1), bounds, h, 0);
    if (made.isEmpty() || made.status() !== "NoError") { made.delete(); return null; }
    return made;
  } catch {
    return null;
  } finally {
    try { local?.delete(); } catch { /* gone */ }
    try { room?.delete(); } catch { /* gone */ }
  }
}
