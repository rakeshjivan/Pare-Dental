import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { affineBetween, CANINE_TIP, crownMargins, labialProfile, layoutSmileSet, restFrames, SET_BURY, SET_CLEAR, SET_DEFAULTS, SET_LENGTHEN_MAX, SET_TORQUE_MAX, FACE_STEP, type SetAnchors, type SetTooth } from "@/lib/waxSmileSet";
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

describe("restFrames", () => {
  // Two boxes standing at an angle, as a set turns its laterals along the arch: the lateral's mesial points at the central.
  const box = (cx: number, cy: number, turn: number, w: number) => {
    const pts: number[] = [];
    for (const a of [-w / 2, w / 2]) for (const b of [0, 2]) for (const z of [-9, 0]) {
      pts.push(cx + a * Math.cos(turn) - b * Math.sin(turn), cy + a * Math.sin(turn) + b * Math.cos(turn) - 2, z);
    }
    return pts;
  };
  it("reads each tooth's mesial towards its mesial neighbour, its width along it and its length", () => {
    const f = restFrames([{ fdi: 11, soup: box(-4, 0, 0, 8) }, { fdi: 21, soup: box(4, 0, 0, 8) }, { fdi: 12, soup: box(-10, -2, -0.4, 6) }], [0, 0, 1], [0, -1, 0]);
    const lateral = f.get(12)!;
    expect(lateral.frame.mesial[0]).toBeGreaterThan(0.85);
    expect(lateral.frame.out[1]).toBeLessThan(0);
    expect(lateral.length).toBeCloseTo(9, 5);
    expect(f.get(11)!.frame.mesial[0]).toBeCloseTo(1, 5);
    expect(f.get(11)!.width).toBeCloseTo(8, 5);
  });
  it("reads the labial face down the tooth: how far behind its most labial point, at each step from the edge (build 286)", () => {
    // A tooth (labial towards -y) whose face falls back 0.2 mm for each mm from the edge towards the neck.
    const pts: number[] = [];
    for (let x = -4; x <= 4; x += 0.5) for (let d = 0; d <= 10; d += 0.25) pts.push(x, 0.2 * d, -d, x, 5, -d);
    const face = restFrames([{ fdi: 11, soup: pts }, { fdi: 21, soup: pts.map((value, i) => (i % 3 === 0 ? value + 9 : value)) }], [0, 0, 1], [0, -1, 0]).get(11)!.face;
    expect(face.length).toBe(Math.ceil(10 / FACE_STEP) + 1);
    expect(face[0]).toBeCloseTo(0, 5);
    // (The most labial corner within each step: up to half a step nearer the edge.)
    expect(Math.abs(face[Math.round(5 / FACE_STEP)] + 1)).toBeLessThan(0.1);
    expect(Math.abs(face[face.length - 1] + 2)).toBeLessThan(0.1);
  });
});

describe("standing clear of the patient's teeth", () => {
  it("lays the set at least SET_CLEAR in front of the most labial point, fullness on top", () => {
    const teeth = (() => {
      const out: SetTooth[] = [];
      for (const q of [1, 2]) for (const n of [1, 2, 3]) {
        const s = q === 2 ? 1 : -1;
        out.push({ id: `t${q}${n}`, fdi: q * 10 + n, kind: n === 1 ? "central" : n === 2 ? "lateral" : "canine", width: [0, 8.6, 6.8, 7.6][n], length: 10, frame: { origin: [s * n * 7, 0, 0], mesial: [-s, 0, 0], out: [0, 1, 0], up: [0, 0, 1] } });
      }
      return out;
    })();
    // A patient's arch: crowns along y = 2 - 0.03 x^2 (labial of the canine-tip curve).
    const pts: number[] = [];
    for (let x = -20; x <= 20; x += 0.25) for (const h of [-6, -3, 0]) pts.push(x, 2 - 0.03 * x * x, h);
    const base = { midline: [0, 0, 0] as V, canines: [[-17, -9, -1], [17, -9, -1]] as [V, V], up: [0, 0, 1] as V, out: [0, 1, 0] as V };
    const labial = labialProfile(pts, base);
    expect(labial.length).toBeGreaterThan(50);
    for (const fullness of [0, 0.5]) {
      const lay = layoutSmileSet(teeth, { ...base, labial }, { ...SET_DEFAULTS, fullness })!;
      for (const t of teeth) {
        const o = new THREE.Vector3(...t.frame.origin).applyMatrix4(lay.matrices.get(t.id)!);
        // The labial face at the incisal middle stands in front of the patient's surface there.
        expect(o.y - (2 - 0.03 * o.x * o.x)).toBeGreaterThan(SET_CLEAR + fullness - 0.35);
      }
    }
  });
});

describe("a tooth widened on its own", () => {
  it("pushes its distal neighbours along the arch on that side only", () => {
    const teeth = restTeeth();
    const base = layoutSmileSet(teeth, anchors, { ...SET_DEFAULTS, centralWidth: 8.5 })!;
    const wide = layoutSmileSet(teeth, anchors, { ...SET_DEFAULTS, centralWidth: 8.5 }, new Map([["t12", { mesial: 0.5, distal: 0.5 }]]))!;
    const x = (lay: typeof base, id: string, fdi: number) => new THREE.Vector3(...teeth.find((t) => t.fdi === fdi)!.frame.origin).applyMatrix4(lay.matrices.get(id)!).x;
    // 12 (patient's right, -x) moves distally by about the mesial share, 13 by about the whole 1 mm.
    expect(x(base, "t12", 12) - x(wide, "t12", 12)).toBeGreaterThan(0.3);
    expect(x(base, "t13", 13) - x(wide, "t13", 13)).toBeGreaterThan(0.7);
    // The other side is untouched.
    expect(x(wide, "t23", 23)).toBeCloseTo(x(base, "t23", 23), 6);
    expect(x(wide, "t11", 11)).toBeCloseTo(x(base, "t11", 11), 6);
  });
});

describe("snapped to the marks (build 278, step 2)", () => {
  const teeth = restTeeth();
  // Marks from the patient's right (-x): 13 distal ... 23 distal, on an arch y = -0.03 x^2, edges at z 0; canine tips at z 0.8.
  const xs = [-19, -13, -7.5, 0, 8, 13.5, 19.5];
  const contacts = xs.map((x) => [x, -0.03 * x * x, 0] as V);
  const marked: SetAnchors = { midline: [0, 0, 0], canines: [[-16, -7.7, 0.8], [16.5, -8.2, 0.8]], up: [0, 0, 1], out: [0, 1, 0], contacts };
  const lay = layoutSmileSet(teeth, marked, SET_DEFAULTS)!;
  const byFdi = new Map(teeth.map((t) => [t.fdi, t]));

  it("puts each tooth's mesial and distal ends on its two marked contacts (occlusal view), width only", () => {
    const pairs: Record<number, [number, number]> = { 13: [1, 0], 12: [2, 1], 11: [3, 2], 21: [3, 4], 22: [4, 5], 23: [5, 6] };
    for (const [fdi, [m, d]] of Object.entries(pairs)) {
      const t = byFdi.get(Number(fdi))!, e = ends(t, lay.matrices.get(t.id)!);
      expect(Math.hypot(e.mesial.x - contacts[m][0], e.mesial.y - contacts[m][1])).toBeLessThan(0.05 + 0); // on the contact (labial offset 0: no patient surface given)
      expect(Math.hypot(e.distal.x - contacts[d][0], e.distal.y - contacts[d][1])).toBeLessThan(0.05);
      // Length kept: the incisal middle to the cervical, as the library tooth.
      const m4 = lay.matrices.get(t.id)!;
      const cervical = new THREE.Vector3(t.frame.origin[0], t.frame.origin[1], t.frame.origin[2] - t.length).applyMatrix4(m4);
      expect(e.edge.distanceTo(cervical)).toBeCloseTo(t.length, 4);
      expect(m4.determinant()).toBeGreaterThan(0);
    }
    expect(lay.matrices.size).toBe(6);
  });

  it("sets the centrals at the midline mark's level, the canines at their tip marks, the laterals half way on the set's own steps", () => {
    const z = (fdi: number) => ends(byFdi.get(fdi)!, lay.matrices.get(byFdi.get(fdi)!.id)!).edge.z;
    expect(z(11)).toBeCloseTo(0, 5);
    expect(z(21)).toBeCloseTo(0, 5);
    expect(z(13)).toBeCloseTo(0.8, 5);
    expect(z(23)).toBeCloseTo(0.8, 5);
    // The set's own lateral step (0.8 - 0.4 above the centrals at rest) plus half the canine's correction (0.8 - 0.8).
    expect(z(12)).toBeCloseTo(0.4, 5);
  });

  it("starts the whole set longer when the canine tips marked say the patient's centrals are worn short (build 281)", () => {
    const worn: SetAnchors = { ...marked, canines: [[-16, -7.7, 2.8], [16.5, -8.2, 2.8]] };
    const fit = layoutSmileSet(teeth, worn, SET_DEFAULTS)!;
    const z = (fdi: number) => ends(byFdi.get(fdi)!, fit.matrices.get(byFdi.get(fdi)!.id)!).edge.z;
    expect(z(11)).toBeCloseTo(2, 5);
    expect(z(13)).toBeCloseTo(2.8, 5);
    expect(z(12)).toBeCloseTo(2.4, 5);
    // Canines marked short of the set's: never shorter than the patient's centrals.
    const short = layoutSmileSet(teeth, { ...marked, canines: [[-16, -7.7, -1], [16.5, -8.2, -1]] }, SET_DEFAULTS)!;
    expect(ends(byFdi.get(11)!, short.matrices.get(byFdi.get(11)!.id)!).edge.z).toBeCloseTo(0, 5);
  });

  it("keeps the set's own design: each tooth only turned about the vertical (its tip and torque as the library's)", () => {
    // A library lateral tipped and torqued: its up not straight up.
    const tipped = teeth.map((t) => (t.fdi === 12 ? { ...t, frame: { ...t.frame, up: [0.15, 0.1, 0.983] as V } } : t));
    const fit = layoutSmileSet(tipped, marked, SET_DEFAULTS)!;
    const t = tipped.find((x) => x.fdi === 12)!;
    const upAfter = new THREE.Vector3(...t.frame.up).transformDirection(fit.matrices.get(t.id)!);
    // The angle from the vertical is kept (turning about the vertical cannot change it).
    expect(upAfter.z).toBeCloseTo(new THREE.Vector3(...t.frame.up).normalize().z, 2);
  });

  it("keeps the teeth labial of the patient's surface", () => {
    const labial = contacts.map((p) => [p[0], p[1] + 1.2, -2] as V);
    const clear = layoutSmileSet(teeth, { ...marked, labial }, SET_DEFAULTS)!;
    const t = byFdi.get(11)!;
    expect(ends(t, clear.matrices.get(t.id)!).edge.y - ends(t, lay.matrices.get(t.id)!).edge.y).toBeGreaterThan(1.2);
  });
});

describe("from the gum line to the edge (build 286)", () => {
  const teeth = restTeeth();
  const xs = [-19, -13, -7.5, 0, 8, 13.5, 19.5];
  const contacts = xs.map((x) => [x, -0.03 * x * x, 0] as V);
  const marked: SetAnchors = { midline: [0, 0, 0], canines: [[-16, -7.7, 0.8], [16.5, -8.2, 0.8]], up: [0, 0, 1], out: [0, 1, 0], contacts };
  const byFdi = new Map(teeth.map((t) => [t.fdi, t]));
  const cervicalZ = (lay: NonNullable<ReturnType<typeof layoutSmileSet>>, fdi: number) => { const t = byFdi.get(fdi)!; return new THREE.Vector3(t.frame.origin[0], t.frame.origin[1], t.frame.origin[2] - t.length).applyMatrix4(lay.matrices.get(t.id)!).z; };
  const edgeZ = (lay: NonNullable<ReturnType<typeof layoutSmileSet>>, fdi: number) => ends(byFdi.get(fdi)!, lay.matrices.get(byFdi.get(fdi)!.id)!).edge.z;

  it("makes each tooth as long as from its gingival margin to its edge, and keeps the neck there when the edge is taken longer", () => {
    // Margins 12 mm gumwards of the centrals' edges (11 a little higher); none read for 23.
    const margins = [-11, -10, -12, -12.5, -10, null];
    const lay = layoutSmileSet(teeth, { ...marked, margins }, SET_DEFAULTS)!;
    expect(cervicalZ(lay, 11)).toBeCloseTo(-12 - SET_BURY, 4);
    expect(cervicalZ(lay, 21)).toBeCloseTo(-12.5 - SET_BURY, 4);
    expect(cervicalZ(lay, 12)).toBeCloseTo(-10 - SET_BURY, 4);
    // No margin read: the library's length.
    expect(edgeZ(lay, 23) - cervicalZ(lay, 23)).toBeCloseTo(byFdi.get(23)!.length, 4);
    // The edges are where they were without the margins.
    const plain = layoutSmileSet(teeth, marked, SET_DEFAULTS)!;
    for (const fdi of [13, 12, 11, 21, 22, 23]) expect(edgeZ(lay, fdi)).toBeCloseTo(edgeZ(plain, fdi), 5);
    // Longer by 2.5: the edge moves, the neck stays.
    const longer = layoutSmileSet(teeth, { ...marked, margins }, { ...SET_DEFAULTS, length: 2.5 })!;
    expect(edgeZ(longer, 11)).toBeCloseTo(edgeZ(lay, 11) + 2.5, 5);
    expect(cervicalZ(longer, 11)).toBeCloseTo(cervicalZ(lay, 11), 4);
    expect(lay.centralLength).toBeCloseTo(12 + SET_BURY, 4);
  });

  it("starts at a central of the usual proportion where the patient's are short for their width", () => {
    // The centrals as marked (contact to contact, seen from the occlusal), standing only 7 mm: their width over 78% wanted.
    const wide = (Math.hypot(contacts[3][0] - contacts[2][0], contacts[3][1] - contacts[2][1]) + Math.hypot(contacts[4][0] - contacts[3][0], contacts[4][1] - contacts[3][1])) / 2;
    const worn = layoutSmileSet(teeth, { ...marked, crown: 7 }, SET_DEFAULTS)!;
    expect(wide / 0.78 - 7).toBeGreaterThan(2);
    expect(edgeZ(worn, 11)).toBeCloseTo(wide / 0.78 - 7, 4);
    // The canines and laterals go with them (the set's smile line kept).
    expect(edgeZ(worn, 13) - edgeZ(worn, 11)).toBeCloseTo(0.8, 4);
    // Never by more than SET_LENGTHEN_MAX, and not at all for centrals long enough already.
    expect(edgeZ(layoutSmileSet(teeth, { ...marked, crown: 3 }, SET_DEFAULTS)!, 11)).toBeCloseTo(SET_LENGTHEN_MAX, 5);
    expect(edgeZ(layoutSmileSet(teeth, { ...marked, crown: 11 }, SET_DEFAULTS)!, 11)).toBeCloseTo(0, 5);
  });
});

describe("crownMargins (build 286)", () => {
  // A row of crowns along x, labial +y, incisal +z (edges at z 0): each rounded out from its edge to its margin, where
  // the gum takes over and swells on. Centrals' margins 9 mm from the edge, the laterals' 7.5, the canines' 10.
  const xs = [-24, -16, -9, 0, 9, 16, 24];
  const crown = [10, 7.5, 9, 9, 7.5, 10];
  const scan: number[] = [];
  for (let tooth = 0; tooth < 6; tooth += 1) {
    for (let x = xs[tooth] + 0.2; x < xs[tooth + 1]; x += 0.3) for (let d = 0; d <= 16; d += 0.15) {
      const L = crown[tooth];
      const y = d <= L ? 0.9 * Math.sin((Math.PI * d) / L) : 0.35 * (d - L);
      scan.push(x, y, -d);
    }
  }
  const contacts = xs.map((x) => [x, 0, -1] as V);
  const found = crownMargins(scan, { contacts, up: [0, 0, 1], out: [0, 1, 0] });

  it("finds each tooth's margin at the crease where its crown meets the gum", () => {
    found.margins.forEach((level, tooth) => {
      expect(level).not.toBeNull();
      expect(Math.abs(level! + crown[tooth])).toBeLessThan(0.6);
    });
  });

  it("takes a reading far from the others as a misreading: that tooth stands as the middle of the six does (build 293)", () => {
    // A fold across 21's crown reads as its gum line at 5.5 mm - where the other central's is at 9.
    const odd: number[] = [];
    for (let tooth = 0; tooth < 6; tooth += 1) {
      const L = tooth === 3 ? 5.5 : crown[tooth];
      for (let x = xs[tooth] + 0.2; x < xs[tooth + 1]; x += 0.3) for (let d = 0; d <= 16; d += 0.15) odd.push(x, d <= L ? 0.9 * Math.sin((Math.PI * d) / L) : 0.35 * (d - L), -d);
    }
    const got = crownMargins(odd, { contacts, up: [0, 0, 1], out: [0, 1, 0] });
    // The six as centrals: 10.5, 8.7, 9, 5.5 (the odd one), 8.7, 10.5 - the middle about 8.9; 21 takes it.
    expect(Math.abs(got.margins[3]! + 8.9)).toBeLessThan(0.7);
    expect(Math.abs(got.margins[2]! + 9)).toBeLessThan(0.6);
  });

  it("reads how long the centrals stand, and nothing without the contacts", () => {
    expect(Math.abs(found.crown! - 9)).toBeLessThan(0.6);
    expect(crownMargins(scan, { up: [0, 0, 1], out: [0, 1, 0] })).toEqual({ margins: [null, null, null, null, null, null], crown: null });
  });
});

describe("the face laid against the patient's crown (build 286)", () => {
  // Each tooth's labial face falls away from its most labial point towards the neck: 0.18 mm for each mm of height.
  const face = (length: number) => Array.from({ length: Math.ceil(length / FACE_STEP) + 1 }, (_, k) => -0.18 * k * FACE_STEP);
  const teeth = restTeeth().map((tooth) => ({ ...tooth, face: face(tooth.length) }));
  const xs = [-19, -13, -7.5, 0, 8, 13.5, 19.5];
  const contacts = xs.map((x) => [x, -0.03 * x * x, 0] as V);
  const margins = [-9, -8, -9, -9, -8, -9];
  // The patient's crowns: flat labial faces 1 mm in front of the contacts' arch from the edge to the gum line, the
  // gum above standing 3 mm further out still (which no tooth has to cover).
  const labial: V[] = [];
  for (let x = -18; x <= 18; x += 0.5) for (let h = 0; h >= -12; h -= 1) labial.push([x, -0.03 * x * x + (h < -9.4 ? 4 : 1), h]);
  const marked: SetAnchors = { midline: [0, 0, 0], canines: [[-16, -7.7, 0.8], [16.5, -8.2, 0.8]], up: [0, 0, 1], out: [0, 1, 0], contacts, margins, labial };
  const lay = layoutSmileSet(teeth, marked, SET_DEFAULTS)!;
  const central = teeth.find((tooth) => tooth.fdi === 11)!;
  const m = lay.matrices.get(central.id)!;
  // Where the central's face stands (labially, y) at a level, after the layout: its rest face point at that depth, moved.
  const faceAt = (depth: number) => {
    const o = central.frame.origin, scale = (9 + SET_BURY) / central.length;
    return new THREE.Vector3(o[0], o[1] - 0.18 * (depth / scale), o[2] - depth / scale).applyMatrix4(m);
  };

  const faceAtOf = (laid: NonNullable<ReturnType<typeof layoutSmileSet>>) => new THREE.Vector3(...central.frame.origin).applyMatrix4(laid.matrices.get(central.id)!).y;

  it("covers the crown by SET_CLEAR from the edge to the gum line, by turning the neck out rather than the whole tooth", () => {
    const edge = faceAt(0);
    for (const depth of [1, 3, 5, 7, 8]) {
      const at = faceAt(depth);
      // The patient's face there: 1 mm in front of the arch at the tooth's middle (x about -3.7, the arch at y -0.4).
      expect(at.y).toBeGreaterThan(-0.03 * at.x * at.x + 1 + SET_CLEAR - 0.25);
    }
    // Turned: the neck stands further out against the edge than the library face alone would have it.
    expect(faceAt(8).y - edge.y).toBeGreaterThan(-0.18 * 8 * (central.length / (9 + SET_BURY)) + 0.3);
    // And the edge is not pushed far in front of the patient's: within a millimetre of SET_CLEAR.
    // (The patient's face here is flat right across, where a tooth's own falls back at its sides: a little further out for that.)
    expect(edge.y).toBeLessThan(-0.03 * edge.x * edge.x + 1 + SET_CLEAR + 1.6);
    expect(m.determinant()).toBeGreaterThan(0);
  });

  it("stands clear of a patient's tooth that sticks out at one side only (turned in the arch) (build 288)", () => {
    // 11's distal third standing 1.5 mm further labial than the rest of it, from the edge to the gum line.
    const turned: V[] = labial.map((p) => (p[0] < -5.5 && p[0] > -7.5 && p[2] > -9.4 ? [p[0], p[1] + 1.5, p[2]] as V : p));
    const plain = faceAtOf(layoutSmileSet(teeth, marked, SET_DEFAULTS)!), out = faceAtOf(layoutSmileSet(teeth, { ...marked, labial: turned }, SET_DEFAULTS)!);
    expect(out - plain).toBeGreaterThan(0.25);
  });

  it("never turns a tooth further than SET_TORQUE_MAX, and not at all when its face already covers", () => {
    // A face that does not fall away: nothing to turn for.
    const flatFaced = restTeeth().map((tooth) => ({ ...tooth, face: face(tooth.length).map(() => 0) }));
    const plain = layoutSmileSet(flatFaced, marked, SET_DEFAULTS)!;
    const t11 = flatFaced.find((tooth) => tooth.fdi === 11)!;
    const o = t11.frame.origin;
    const top = new THREE.Vector3(...o).applyMatrix4(plain.matrices.get(t11.id)!), low = new THREE.Vector3(o[0], o[1], o[2] - 5).applyMatrix4(plain.matrices.get(t11.id)!);
    expect(Math.abs(low.y - top.y)).toBeLessThan(0.02);
    // A face falling away steeply: turned to the limit and no further.
    const steep = restTeeth().map((tooth) => ({ ...tooth, face: face(tooth.length).map((x) => x * 4) }));
    const turned = layoutSmileSet(steep, marked, SET_DEFAULTS)!;
    const s11 = steep.find((tooth) => tooth.fdi === 11)!;
    const a = new THREE.Vector3(...s11.frame.origin).applyMatrix4(turned.matrices.get(s11.id)!), b = new THREE.Vector3(s11.frame.origin[0], s11.frame.origin[1], s11.frame.origin[2] - 5).applyMatrix4(turned.matrices.get(s11.id)!);
    const angle = (Math.atan2(Math.hypot(b.x - a.x, b.y - a.y), Math.abs(b.z - a.z)) * 180) / Math.PI;
    expect(angle).toBeLessThan(SET_TORQUE_MAX + 0.5);
    expect(angle).toBeGreaterThan(SET_TORQUE_MAX - 1.5);
  });
});
