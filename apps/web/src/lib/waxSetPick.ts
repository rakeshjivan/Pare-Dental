/**
 * Build 299 (Rakesh: "selecting the right set of wax-up teeth is critical ... is there an algorithm we can use to
 * help auto-select the best set"): which library set fits an arch with the least change to its teeth.
 *
 * Laid on the marks (lib/waxSmileSet), each tooth is made as wide as the space between its two contacts and as long
 * as from its gingival margin to its designed edge. A set whose teeth already have those proportions is hardly
 * changed; one that has not has its anatomy pulled about. So a set is scored by what the laying would do to it:
 * - form: how far each tooth's width-to-length proportion is changed (wider than long, or longer than wide);
 * - widths: how unevenly the six teeth are scaled across (a set whose laterals are too wide for these centrals);
 * - reach: how far a tooth's length would have to go past what the laying allows (its neck left short of the gum,
 *   or its edge beyond the design).
 * The lowest score fits best. It says nothing of which form suits the face - that stays the dentist's choice.
 */
import * as THREE from "three";
import { librarySet } from "@/lib/dentalWaxup";
import { SET_BURY, SET_DEFAULTS, SET_LENGTHEN_MAX, SET_STRETCH, restFrames } from "@/lib/waxSmileSet";

type Vec3 = [number, number, number];

/** A set's six front teeth, from one canine to the other: widths and lengths (mm), each edge's level from the centrals' (mm, + incisal), and how upright each stands (1 = along the set's vertical). */
export type SetDims = { widths: number[]; lengths: number[]; drops: number[]; upright: number[] };

/** The arch's six spaces, from the patient's right canine to the left: widths between the contacts (mm), and from each gingival margin to the level of the centrals' edge (mm; null where the margin was not read); how much longer the set starts (mm). */
export type ArchRoom = { widths: number[]; rooms: Array<number | null>; longer: number };

export type SetScore = { score: number; form: number; widths: number; reach: number };

const ORDER: Array<[kind: "central" | "lateral" | "canine", side: -1 | 1, fdi: number]> = [
  ["canine", -1, 13], ["lateral", -1, 12], ["central", -1, 11], ["central", 1, 21], ["lateral", 1, 22], ["canine", 1, 23],
];

/** A set's dimensions read from its shells (as loaded); null when it has not the six front teeth. */
export function setDims(shells: Float32Array[]): SetDims | null {
  let set;
  try { set = librarySet("set", shells); } catch { return null; }
  const teeth = ORDER.map(([kind, side, fdi]) => { const tooth = set.teeth.find((t) => t.kind === kind && t.side === side); return tooth ? { fdi, soup: tooth.positions } : null; });
  if (teeth.some((t) => !t)) return null;
  // In the set's own frame the incisal edges are up (+z) and the front is at -y.
  const frames = restFrames(teeth as Array<{ fdi: number; soup: Float32Array }>, [0, 0, 1], [0, -1, 0]);
  const read = ORDER.map(([, , fdi]) => frames.get(fdi));
  if (read.some((f) => !f)) return null;
  const all = read as Array<NonNullable<(typeof read)[number]>>;
  const central = (all[2].frame.origin[2] + all[3].frame.origin[2]) / 2;
  return {
    widths: all.map((f) => f.width),
    lengths: all.map((f) => f.length),
    drops: all.map((f) => f.frame.origin[2] - central),
    upright: all.map((f) => Math.max(0.5, Math.abs(f.frame.up[2]))),
  };
}

/**
 * The arch's room from the nine marks (seven contacts from the patient's right, then the canine tips) and the
 * gingival margins read on the scan (lib/waxSmileSet crownMargins: each margin's level along `up`, and the centrals'
 * crown length). `up` points to the incisal edges.
 */
export function archRoom(contacts: Vec3[], up: Vec3, margins: Array<number | null> | undefined, crown: number | null | undefined, ratio = SET_DEFAULTS.ratio): ArchRoom | null {
  if (contacts.length < 7) return null;
  const u = new THREE.Vector3(...up).normalize();
  const flat = (p: Vec3) => { const q = new THREE.Vector3(...p); return q.addScaledVector(u, -q.dot(u)); };
  const widths = [0, 1, 2, 3, 4, 5].map((i) => flat(contacts[i]).distanceTo(flat(contacts[i + 1])));
  if (widths.some((w) => w < 1)) return null;
  const edge = new THREE.Vector3(...contacts[3]).dot(u);
  const centralWide = (widths[2] + widths[3]) / 2;
  const longer = crown ? Math.min(SET_LENGTHEN_MAX, Math.max(0, centralWide / ratio - crown)) : 0;
  return { widths, rooms: [0, 1, 2, 3, 4, 5].map((i) => { const m = margins?.[i]; return m === null || m === undefined ? null : edge - m; }), longer };
}

/** What laying the set on the arch would do to it - the lower the better (0: nothing changed but its size). */
export function scoreSet(dims: SetDims, room: ArchRoom): SetScore {
  const across = dims.widths.map((w, i) => Math.log(room.widths[i] / Math.max(0.5, w)));
  const mean = across.reduce((s, x) => s + x, 0) / across.length;
  let form = 0, reach = 0;
  for (let i = 0; i < 6; i += 1) {
    const r = room.rooms[i];
    // With no margin read the tooth keeps its own proportion (as the laying leaves it).
    if (r === null) { form += Math.abs(across[i] - mean); continue; }
    const want = (r + room.longer + dims.drops[i] + SET_BURY) / dims.upright[i] / Math.max(1, dims.lengths[i]);
    const stretch = Math.min(SET_STRETCH[1], Math.max(SET_STRETCH[0], want));
    form += Math.abs(Math.log(stretch) - across[i]);
    reach += Math.abs(Math.log(Math.max(0.2, want) / stretch));
  }
  form /= 6; reach /= 6;
  const widths = Math.sqrt(across.reduce((s, x) => s + (x - mean) * (x - mean), 0) / across.length);
  return { score: form + widths + 2 * reach, form, widths, reach };
}

/** The sets in order of fit, the best first. */
export function rankSets(sets: Array<{ id: string; dims: SetDims }>, room: ArchRoom): Array<{ id: string } & SetScore> {
  return sets.map((set) => ({ id: set.id, ...scoreSet(set.dims, room) })).sort((a, b) => a.score - b.score);
}

/**
 * `up` (towards the incisal edges) and `out` (labial at the midline) from the marks alone: up square to the plane of the seven contacts, on the side the
 * canine tips stand (a tip is incisal of the contacts beside it).
 */
export function frameFromMarks(marks: Vec3[]): { up: Vec3; out: Vec3 } | null {
  if (marks.length < 9) return null;
  const pts = marks.slice(0, 7).map((p) => new THREE.Vector3(...p));
  const c = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(pts.length);
  // The contacts lie along an arc: its chord and its sagitta span their plane.
  const chord = pts[6].clone().sub(pts[0]).normalize();
  const sag = pts[3].clone().sub(pts[0].clone().add(pts[6]).multiplyScalar(0.5));
  sag.addScaledVector(chord, -sag.dot(chord));
  if (sag.length() < 1e-3) return null;
  sag.normalize();
  const n = new THREE.Vector3().crossVectors(chord, sag).normalize();
  const tips = new THREE.Vector3(...marks[7]).add(new THREE.Vector3(...marks[8])).multiplyScalar(0.5).sub(c).dot(n)
    - (pts[0].clone().add(pts[1]).add(pts[5]).add(pts[6]).multiplyScalar(0.25).sub(c).dot(n));
  if (tips < 0) n.negate();
  return { up: n.toArray() as Vec3, out: sag.toArray() as Vec3 };
}
