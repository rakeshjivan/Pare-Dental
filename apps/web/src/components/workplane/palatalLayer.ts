/**
 * Build 118: the library tooth's palatal shown whole, with the patient's scan as it is.
 *
 * With the library palatal (lib/waxPalatal), Make presses the patient's palatal standing beyond a wax tooth onto it.
 * The view does not change the scan to show that. Each wax tooth carries a second drawing of its own geometry
 * that draws only its palatal faces (not its cervical cap, nothing on its labial side) and wins the depth test against
 * whatever lies up to PALATAL_REACH in front of it - the scan's palatal that Make will press away. Anything further in
 * front (the other arch, a tooth beyond the reach) still hides it. It shares the tooth's geometry and follows its
 * transform, so it moves with the tooth as it is dragged, at no cost.
 */
import * as THREE from "three";
import { localToWorld } from "@/lib/scanFrame";
import { moveFrame } from "@/lib/dentalWaxup";
import { PALATAL_FACING, PALATAL_REACH } from "@/lib/waxPalatal";
import type { WorkplaneShape } from "@/types/layerling";

/** On while Wax-up Studio shows the library palatal (set by the editor through window.layerlingPalatalXray). */
export const palatalLayerOn = { value: false };

const VERTEX_HEAD = `
uniform float uPalReach;
uniform vec3 uPalOrigin;
uniform vec3 uPalOut;
uniform vec3 uPalUp;
varying vec3 vPalW;
varying vec3 vPalN;
varying vec3 vPalOrigin;
varying vec3 vPalOut;
varying vec3 vPalUp;
`;
const VERTEX_TAIL = `
  vPalW = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vPalN = normalize(mat3(modelMatrix) * objectNormal);
  vPalOrigin = (modelMatrix * vec4(uPalOrigin, 1.0)).xyz;
  vPalOut = normalize(mat3(modelMatrix) * uPalOut);
  vPalUp = normalize(mat3(modelMatrix) * uPalUp);
  vec4 palBiased = mvPosition;
  vec3 palToCamera = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(-palBiased.xyz);
  palBiased.xyz += palToCamera * uPalReach;
  gl_Position = projectionMatrix * palBiased;
`;
const FRAGMENT_HEAD = `
uniform bool uPalOn;
uniform float uPalFacing;
uniform float uPalU0;
varying vec3 vPalW;
varying vec3 vPalN;
varying vec3 vPalOrigin;
varying vec3 vPalOut;
varying vec3 vPalUp;
`;
const FRAGMENT_START = `
  if (!uPalOn) discard;
  vec3 palN = normalize(vPalN);
  if (-dot(palN, vPalOut) <= uPalFacing) discard;
  if (dot(palN, vPalUp) < -0.6) discard;
  if (dot(vPalW - vPalOrigin, vPalUp) < uPalU0) discard;
`;

/** Adds the palatal layer under each mesh of a wax tooth's object (just built, not yet in the scene). */
export function addPalatalLayer(group: THREE.Group, shape: WorkplaneShape) {
  const toWorld = shape.waxTooth ? localToWorld(shape) : null;
  if (!toWorld) return;
  const f = moveFrame(shape.waxTooth!.frame, toWorld);
  group.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  group.traverse((child) => { const mesh = child as THREE.Mesh; if (mesh.isMesh && !mesh.userData.palatalLayer) meshes.push(mesh); });
  for (const mesh of meshes) {
    const source = mesh.material;
    if (Array.isArray(source) || !(source instanceof THREE.MeshStandardMaterial)) continue;
    // The tooth's frame in the mesh's own coordinates (as built), so the layer follows the tooth wherever it goes.
    const back = mesh.matrixWorld.clone().invert();
    const origin = new THREE.Vector3(...f.origin).applyMatrix4(back);
    const out = new THREE.Vector3(...f.out).transformDirection(back);
    const up = new THREE.Vector3(...f.up).transformDirection(back);
    // How far towards the root the tooth reaches from its frame's origin (world mm, along up).
    const positions = mesh.geometry.getAttribute("position");
    if (!positions) continue;
    const upWorld = new THREE.Vector3(...f.up).normalize(), originWorld = new THREE.Vector3(...f.origin), p = new THREE.Vector3();
    let u0 = Infinity;
    for (let i = 0; i < positions.count; i += 1) {
      p.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
      u0 = Math.min(u0, p.sub(originWorld).dot(upWorld));
    }
    if (!Number.isFinite(u0)) continue;
    const material = source.clone();
    material.side = THREE.FrontSide;
    material.transparent = false;
    material.opacity = 1;
    // Rakesh (build 281): written to the depth buffer, so the tooth's own palatal faces hide one another in the
    // right order - without it the last drawn won, and from the palate the tooth looked like an open shell.
    material.depthWrite = true;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uPalOn = { get value() { return palatalLayerOn.value; } } as unknown as THREE.IUniform;
      shader.uniforms.uPalReach = { value: PALATAL_REACH };
      shader.uniforms.uPalFacing = { value: PALATAL_FACING };
      shader.uniforms.uPalU0 = { value: u0 + 0.2 };
      shader.uniforms.uPalOrigin = { value: origin };
      shader.uniforms.uPalOut = { value: out };
      shader.uniforms.uPalUp = { value: up };
      shader.vertexShader = VERTEX_HEAD + shader.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>\n${VERTEX_TAIL}`);
      shader.fragmentShader = FRAGMENT_HEAD + shader.fragmentShader.replace("void main() {", `void main() {\n${FRAGMENT_START}`);
    };
    material.customProgramCacheKey = () => "pare-palatal-layer";
    const layer = new THREE.Mesh(mesh.geometry, material);
    layer.userData.palatalLayer = true;
    layer.renderOrder = 3;
    layer.raycast = () => {};
    // Not drawn at all while off.
    layer.visible = palatalLayerOn.value;
    mesh.add(layer);
  }
}

/** Turns the layers on or off (each drawn only while on). */
export function setPalatalLayers(scene: THREE.Object3D, on: boolean) {
  palatalLayerOn.value = on;
  scene.traverse((child) => { if (child.userData.palatalLayer) child.visible = on; });
}
