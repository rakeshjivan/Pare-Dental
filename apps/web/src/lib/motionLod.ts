/**
 * Build 319 (Rakesh: "look at lag in a very concentrated fashion to eliminate it on all steps ... particularly when
 * the scans are both on screen. Here I think is where a lower res version of the scan that looks the same would be
 * ideal"): a large mesh drawn light while something moves, and whole again as soon as it is still.
 *
 * Two arch scans are about a million triangles, and every frame of a move - the view turned, a tooth dragged - draws
 * all of them again. A scan with a fifth of its triangles, shaded smooth, cannot be told from the whole one while it
 * is moving; standing still the whole scan is drawn, so what the dentist looks at closely is never the light one.
 *
 * Only what is drawn changes. Marking, trimming, the brushes and the models all work from the scan itself.
 */
import * as THREE from "three";
import { computeImportedBoundsTree, smoothNormals } from "@/lib/importedMeshDisplay";
import { simplifyTrianglePositions } from "@/lib/meshSimplify";

/** A mesh of at least this many triangles is drawn light while moving. */
export const MOTION_LOD_FROM = 150_000;
/** The light mesh's share of the whole one's triangles, and the fewest it is given. */
export const MOTION_LOD_SHARE = 0.2;
export const MOTION_LOD_LEAST = 60_000;
/** How long after the last movement the whole mesh comes back, ms. */
export const MOTION_LOD_SETTLE_MS = 260;

const lights = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry | "making" | null>();
let making = false;

/** Whether a geometry is one to draw light: a large plain triangle list with no colours of its own. */
function large(geometry: THREE.BufferGeometry | undefined): geometry is THREE.BufferGeometry {
  if (!geometry || geometry.getIndex() || geometry.getAttribute("color")) return false;
  const position = geometry.getAttribute("position");
  return Boolean(position && !("isInterleavedBufferAttribute" in position) && position.count / 3 >= MOTION_LOD_FROM);
}

/** The light geometry for a whole one: made here, once, in the same place and with smooth shading. */
async function make(full: THREE.BufferGeometry): Promise<THREE.BufferGeometry | null> {
  const position = full.getAttribute("position");
  const triangles = position.count / 3;
  const made = await simplifyTrianglePositions(position.array as Float32Array, Math.max(MOTION_LOD_LEAST, Math.round(triangles * MOTION_LOD_SHARE)));
  if (made.triangleCount < 4 || made.triangleCount > triangles * 0.8) return null;
  const positions = Float32Array.from(made.positions);
  const light = new THREE.BufferGeometry();
  light.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  light.setAttribute("normal", new THREE.BufferAttribute(smoothNormals(positions), 3));
  light.boundingBox = full.boundingBox?.clone() ?? null;
  light.boundingSphere = full.boundingSphere?.clone() ?? null;
  if (!light.boundingBox) light.computeBoundingBox();
  if (!light.boundingSphere) light.computeBoundingSphere();
  computeImportedBoundsTree(light);
  // Shared and kept, as the whole mesh's geometry is: the scene never disposes it.
  light.userData.cached = true;
  light.userData.motionLight = true;
  return light;
}

/** Sees to it that the large meshes under `root` have their light geometry (made one at a time, when nothing moves). */
export function prepareMotionLod(root: THREE.Object3D, done?: () => void) {
  if (making) return;
  let next: THREE.BufferGeometry | null = null;
  root.traverse((object) => {
    const geometry = (object as THREE.Mesh).isMesh ? (object as THREE.Mesh).geometry : undefined;
    if (!next && object.visible && large(geometry) && !geometry.userData.motionLight && lights.get(geometry) === undefined) next = geometry;
  });
  const full = next as THREE.BufferGeometry | null;
  if (!full) return;
  making = true;
  lights.set(full, "making");
  const run = () => {
    void make(full).then((light) => lights.set(full, light), () => lights.set(full, null)).finally(() => { making = false; done?.(); });
  };
  if (typeof window !== "undefined" && "requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 1500 }); else setTimeout(run, 200);
}

/**
 * Draws the large meshes under `root` light (`moving`) or whole. Returns whether any mesh changed. A mesh whose
 * geometry was given anew since it was made light is left as it now is.
 */
export function applyMotionLod(root: THREE.Object3D, moving: boolean): boolean {
  let changed = false;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const was = mesh.userData.lodFull as THREE.BufferGeometry | undefined, lit = mesh.userData.lodLight as THREE.BufferGeometry | undefined;
    if (was) {
      if (mesh.geometry !== lit) { delete mesh.userData.lodFull; delete mesh.userData.lodLight; return; }
      if (!moving) { mesh.geometry = was; delete mesh.userData.lodFull; delete mesh.userData.lodLight; changed = true; }
      return;
    }
    if (!moving || !large(mesh.geometry)) return;
    const light = lights.get(mesh.geometry);
    if (!light || light === "making") return;
    mesh.userData.lodFull = mesh.geometry;
    mesh.userData.lodLight = light;
    mesh.geometry = light;
    changed = true;
  });
  return changed;
}

/** For the checks: each large mesh under `root` - its triangles, and its light copy's (0: none yet, -1: none could be made). */
export function describeMotionLod(root: THREE.Object3D): Array<{ triangles: number; light: number; drawnLight: boolean; indexed: boolean; coloured: boolean }> {
  const out: Array<{ triangles: number; light: number; drawnLight: boolean; indexed: boolean; coloured: boolean }> = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const full = (mesh.userData.lodFull as THREE.BufferGeometry | undefined) ?? mesh.geometry;
    const position = full?.getAttribute("position");
    const count = full?.getIndex() ? (full.getIndex()!.count / 3) : (position ? position.count / 3 : 0);
    if (count < MOTION_LOD_FROM) return;
    const light = lights.get(full);
    out.push({ triangles: count, light: light && light !== "making" ? light.getAttribute("position").count / 3 : light === null ? -1 : 0, drawnLight: Boolean(mesh.userData.lodFull), indexed: Boolean(full.getIndex()), coloured: Boolean(full.getAttribute("color")) });
  });
  return out;
}
