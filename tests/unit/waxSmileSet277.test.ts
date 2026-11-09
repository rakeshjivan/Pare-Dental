import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { affineBetween, CANINE_TIP, layoutSmileSet, SET_DEFAULTS, type SetAnchors, type SetTooth } from "@/lib/waxSmileSet";
import type { ToothKind } from "@/lib/dentalWaxup";

/** Build 277: the six front teeth set out together from whole-set controls. Synthetic teeth only. */
type V = [number, number, number];
const kinds: Record<number, ToothKind> = { 1: "central", 2: "lateral", 3: "canine" };
const widths: Record<number, number> = { 1: 8.6, 2: 6.8, 3: 7.6 };
const lengths: Record<number, number> = { 1: 10.5, 2: 9, 3: 10 };
// Rest poses as dropped: somewhere in front, a little crooked, x across (patient's left +), y labial, z incisal.
function restTeeth(): SetTooth[] {
  const out: SetTooth[] = [];
  for (const q of [1, 2]) for (const n of [1, 2, 3]) {
    const s = q === 2 ? 1 : -1;
    const a = (s * (n - 1) * 25 + 3) * (Math.PI / 180);
    const mesial: V = [-s * Math.cos(a), Math.sin(a) * s, 0];
    out.push({ id: `t${q}${n}`, fdi: q * 10 + n, kind: kinds[n], width: widths[n], length: lengths[n], frame: { origin: [s * (n * 7 - 3), 2 - n * 3, 0.4 * n], mesial, out: [0, 1, 0], up: [0, 0, 1] } });
  }
  return out;
}
const anchors: SetAnchors = { midline: [0, 0, 0], canines: [[-17, -9, -1], [17, -9, -1]], up: [0, 0, 1], out: [0, 1, 0] };
const at = (m: THREE.Matrix4, p: V) => new THREE.Vector3(...p).applyMatrix4(m);
const ends = (t: SetTooth, m: THREE.Matrix4) => {
  const o = new THREE.Vector3(...t.frame.origin), d = new THREE.Vector3(...t.frame.mesial).normalize().multiplyScalar(t.width / 2);
  return { mesial: o.clone().add(d).applyMatrix4(m), distal: o.clone().sub(d).applyMatrix4(m), edge: o.applyMatrix4(m) };
};

describe("layoutSmileSet", () => {
  const teeth = restTeeth();
  const byId = new Map(teeth.map((t) => [t.fdi, t]));

  it("sets the two sides as mirror images, the centrals meeting at the midline", () => {
    const lay = layoutSmileSet(teeth, anchors, SET_DEFAULTS)!;
    for (const n of [1, 2, 3]) {
      const r = ends(byId.get(10 + n)!, lay.matrices.get(`t1${n}`)!).edge, l = ends(byId.get(20 + n)!, lay.matrices.get(`t2${n}`)!).edge;
      expect(r.x).toBeCloseTo(-l.x, 5);
      expect(r.y).toBeCloseTo(l.y, 5);
      expect(r.z).toBeCloseTo(l.z, 5);
    }
    expect(ends(byId.get(11)!, lay.matrices.get("t11")!).mesial.distanceTo(ends(byId.get(21)!, lay.matrices.get("t21")!).mesial)).toBeLessThan(1e-4);
  });

  it("keeps every neighbour in contact", () => {
    const lay = layoutSmileSet(teeth, anchors, { ...SET_DEFAULTS, red: 0.75, curve: 1.3, centralWidth: 9 })!;
    for (const q of [1, 2]) for (const n of [1, 2]) {
      const a = ends(byId.get(q * 10 + n)!, lay.matrices.get(`t${q}${n}`)!), b = ends(byId.get(q * 10 + n + 1)!, lay.matrices.get(`t${q}${n + 1}`)!);
      // In the occlusal plane (the lateral's and canine's edges stand short of the central's on purpose).
      expect(Math.hypot(a.distal.x - b.mesial.x, a.distal.y - b.mesial.y)).toBeLessThan(0.02);
    }
  });

  it("puts the centrals' edge at the anchor plus the length, laterals and canines short by the step and the arc", () => {
    const lay = layoutSmileSet(teeth, anchors, { ...SET_DEFAULTS, length: 1.2, lateralStep: 0.6, arc: 1.4 })!;
    expect(ends(byId.get(11)!, lay.matrices.get("t11")!).edge.z).toBeCloseTo(1.2, 5);
    expect(ends(byId.get(12)!, lay.matrices.get("t12")!).edge.z).toBeCloseTo(0.6, 5);
    expect(ends(byId.get(13)!, lay.matrices.get("t13")!).edge.z).toBeCloseTo(-0.2, 5);
  });

  it("gives the central the width and width/length asked for, and keeps its edge where it is when made longer", () => {
    const lay = layoutSmileSet(teeth, anchors, { ...SET_DEFAULTS, centralWidth: 8.8, ratio: 0.8 })!;
    const t = byId.get(11)!, m = lay.matrices.get("t11")!;
    const e = ends(t, m);
    expect(e.mesial.distanceTo(e.distal)).toBeCloseTo(8.8, 3);
    const cervical = at(m, [t.frame.origin[0], t.frame.origin[1], t.frame.origin[2] - t.length]);
    expect(e.edge.distanceTo(cervical)).toBeCloseTo(8.8 / 0.8, 3);
    expect(lay.centralLength).toBeCloseTo(11, 5);
  });

  it("keeps the apparent widths near the RED asked for", () => {
    for (const red of [0.65, 0.7, 0.75]) {
      const lay = layoutSmileSet(teeth, anchors, { ...SET_DEFAULTS, red, centralWidth: 8.5 })!;
      expect(lay.apparent.get("t12")! / lay.apparent.get("t11")!).toBeCloseTo(red, 1);
    }
  });

  it("fits the set between the canine tips when no width is given", () => {
    const lay = layoutSmileSet(teeth, anchors, SET_DEFAULTS)!;
    const tip = ends(byId.get(23)!, lay.matrices.get("t23")!);
    // The canine tip (CANINE_TIP of its width from the mesial end) on the anchor's span across.
    const tipX = tip.mesial.x + (tip.distal.x - tip.mesial.x) * CANINE_TIP;
    expect(Math.abs(tipX - 17)).toBeLessThan(0.3);
  });

  it("moves the midline and cants the plane as one, and goes back exactly", () => {
    const base = layoutSmileSet(teeth, anchors, SET_DEFAULTS)!;
    const moved = layoutSmileSet(teeth, anchors, { ...SET_DEFAULTS, midline: 1, cant: 2 })!;
    const e = (lay: typeof base, fdi: number, q: number, n: number) => ends(byId.get(fdi)!, lay.matrices.get(`t${q}${n}`)!).edge;
    expect(e(moved, 11, 1, 1).x - e(base, 11, 1, 1).x).toBeGreaterThan(0.9);
    expect(Math.sign(e(moved, 23, 2, 3).z - e(base, 23, 2, 3).z)).toBe(-Math.sign(e(moved, 13, 1, 3).z - e(base, 13, 1, 3).z));
    const back = layoutSmileSet(teeth, anchors, SET_DEFAULTS)!;
    for (const [id, m] of base.matrices) expect(back.matrices.get(id)!.equals(m)).toBe(true);
  });

  it("moves the whole curve labially with fullness, and makes no tooth a mirror image of itself", () => {
    const base = layoutSmileSet(teeth, anchors, SET_DEFAULTS)!;
    const full = layoutSmileSet(teeth, anchors, { ...SET_DEFAULTS, fullness: 0.8 })!;
    expect(ends(byId.get(21)!, full.matrices.get("t21")!).edge.y - ends(byId.get(21)!, base.matrices.get("t21")!).edge.y).toBeCloseTo(0.8, 5);
    for (const m of full.matrices.values()) expect(m.determinant()).toBeGreaterThan(0);
  });

  it("keeps each tooth on its own side and unmirrored on an upper arch (incisal pointing down the face)", () => {
    // Flip the scene upside down about the y axis: x -> -x, z -> -z (the patient's left now at -x, incisal down).
    const flip = (p: V): V => [-p[0], p[1], -p[2]];
    const upper = teeth.map((t) => ({ ...t, frame: { origin: flip(t.frame.origin), mesial: flip(t.frame.mesial), out: flip(t.frame.out), up: flip(t.frame.up) } }));
    const a: SetAnchors = { midline: [0, 0, 0], canines: [flip(anchors.canines[0]), flip(anchors.canines[1])], up: [0, 0, -1], out: [0, 1, 0] };
    const lay = layoutSmileSet(upper, a, SET_DEFAULTS)!;
    for (const t of upper) {
      const m = lay.matrices.get(t.id)!;
      expect(m.determinant()).toBeGreaterThan(0);
      const edge = new THREE.Vector3(...t.frame.origin).applyMatrix4(m);
      // Left-quadrant teeth stay at -x (the patient's left in this flipped scene).
      expect(Math.sign(edge.x)).toBe(Math.floor(t.fdi / 10) === 2 ? -1 : 1);
    }
  });

  it("gives no layout when the canines coincide", () => {
    expect(layoutSmileSet(teeth, { ...anchors, canines: [[0, -9, 0], [0, -9, 0]] }, SET_DEFAULTS)).toBeNull();
  });
});

describe("affineBetween", () => {
  // Spread in 3D (each axis its own frequency, so the corners are not all on one plane).
  const soup = new Float32Array(Array.from({ length: 300 }, (_, i) => Math.sin(Math.floor(i / 3) * [1.3, 2.9, 0.7][i % 3] + i % 3) * 5));
  it("finds a move, turn and size exactly", () => {
    const m = new THREE.Matrix4().makeTranslation(1, -2, 0.5).multiply(new THREE.Matrix4().makeRotationZ(0.3)).multiply(new THREE.Matrix4().makeScale(1.1, 1, 0.9));
    const after = soup.slice();
    const p = new THREE.Vector3();
    for (let i = 0; i < after.length; i += 3) { p.set(after[i], after[i + 1], after[i + 2]).applyMatrix4(m); after[i] = p.x; after[i + 1] = p.y; after[i + 2] = p.z; }
    const fit = affineBetween(soup, after)!;
    expect(fit.miss).toBeLessThan(1e-4);
    for (let i = 0; i < 16; i += 1) expect(fit.matrix.elements[i]).toBeCloseTo(m.elements[i], 4);
  });
  it("misses by the sculpted amount when a corner is moved on its own", () => {
    const after = soup.slice();
    after[30] += 0.5;
    expect(affineBetween(soup, after)!.miss).toBeGreaterThan(0.3);
  });
});
