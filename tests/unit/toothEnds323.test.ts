import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { idealArch, layoutSmileSet, restFrames, SET_DEFAULTS, type SetTooth, type Vec3 } from "@/lib/waxSmileSet";
import { decodeToothSet } from "@/lib/toothLibrary";
import { librarySet } from "@/lib/dentalWaxup";

/**
 * Build 323: the wax teeth carry their own contacts (where each touches its neighbours in the set), and a set laid on
 * the marks has those contacts on the marked contacts - not the two ends of each tooth's outline, which stood the
 * centrals and laterals 10 to 25 degrees off.
 */
const ORDER: Array<["central" | "lateral" | "canine", -1 | 1, number]> = [["canine", -1, 13], ["lateral", -1, 12], ["central", -1, 11], ["central", 1, 21], ["lateral", 1, 22], ["canine", 1, 23]];
function setTeeth(id: string) {
  const manifest = JSON.parse(readFileSync("apps/web/public/libraries/pare/manifest.json", "utf8"));
  const entry = manifest.sets.find((s: { id: string }) => s.id === id);
  const buf = readFileSync("apps/web/public/libraries/pare/" + entry.file);
  const set = librarySet("set", decodeToothSet(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
  return ORDER.map(([kind, side, fdi]) => ({ fdi, soup: set.teeth.find((t) => t.kind === kind && t.side === side)!.positions as Float32Array }));
}
const UP: Vec3 = [0, 0, 1], OUT: Vec3 = [0, -1, 0];
const flat = (p: Vec3) => new THREE.Vector2(p[0], p[1]);

describe("the wax teeth's own contacts", () => {
  const teeth = setTeeth("pare-oval-upper-front");
  const frames = restFrames(teeth, UP, OUT);

  it("each front tooth has a mesial and a distal contact, and neighbours share theirs", () => {
    for (const tooth of teeth) expect(frames.get(tooth.fdi)?.ends, String(tooth.fdi)).toBeTruthy();
    for (const [outer, inner] of [[13, 12], [12, 11], [23, 22], [22, 21]]) {
      // The distal tooth's mesial contact and the mesial tooth's distal contact are the same place (within the gap and the band).
      expect(new THREE.Vector3(...frames.get(outer)!.ends!.mesial).distanceTo(new THREE.Vector3(...frames.get(inner)!.ends!.distal))).toBeLessThan(1);
    }
    expect(new THREE.Vector3(...frames.get(11)!.ends!.mesial).distanceTo(new THREE.Vector3(...frames.get(21)!.ends!.mesial))).toBeLessThan(1);
  });

  it("the line between a central's contacts is not the line of its outline", () => {
    const f = frames.get(11)!;
    const run = flat(f.ends!.mesial).sub(flat(f.ends!.distal)).normalize();
    const angle = Math.acos(Math.min(1, run.dot(flat(f.frame.mesial).normalize()))) * 180 / Math.PI;
    expect(angle).toBeGreaterThan(5);
  });

  it("laid on the marks, each tooth's contacts stand on the marked contacts", () => {
    // Marks on an even arch: the set's own contacts, as marks, moved and turned as a patient's arch would be.
    const move = new THREE.Matrix4().makeTranslation(12, -30, 4).multiply(new THREE.Matrix4().makeRotationZ(0.3));
    const at = (p: Vec3) => new THREE.Vector3(...p).applyMatrix4(move).toArray() as Vec3;
    const end = (fdi: number, side: "mesial" | "distal") => frames.get(fdi)!.ends![side];
    const mid = (a: Vec3, b: Vec3) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] as Vec3;
    const contacts = [end(13, "distal"), mid(end(13, "mesial"), end(12, "distal")), mid(end(12, "mesial"), end(11, "distal")), mid(end(11, "mesial"), end(21, "mesial")), mid(end(21, "distal"), end(22, "mesial")), mid(end(22, "distal"), end(23, "mesial")), end(23, "distal")].map(at);
    const dir = (d: Vec3) => new THREE.Vector3(...d).transformDirection(move).toArray() as Vec3;
    const tip = (fdi: number) => at(frames.get(fdi)!.frame.origin);
    const anchors = { midline: contacts[3], canines: [tip(13), tip(23)] as [Vec3, Vec3], up: dir(UP), out: dir(OUT), contacts };
    const worst = (withEnds: boolean) => {
      const list: SetTooth[] = teeth.map((t) => { const f = frames.get(t.fdi)!; return { id: String(t.fdi), fdi: t.fdi, kind: ORDER.find((o) => o[2] === t.fdi)![0], frame: f.frame, width: f.width, length: f.length, face: f.face, ...(withEnds ? { ends: f.ends } : {}) }; });
      const layout = layoutSmileSet(list, anchors, { ...SET_DEFAULTS })!;
      const up = new THREE.Vector3(...anchors.up);
      // The teeth are laid on the even arch through the marks (idealArch), so that is where their contacts belong.
      const even = idealArch(contacts, anchors.up, anchors.out);
      const level = (p: THREE.Vector3) => p.clone().addScaledVector(up, -p.dot(up));
      let most = 0, turn = 0;
      teeth.forEach((t, i) => {
        const m = layout.matrices.get(String(t.fdi))!, f = frames.get(t.fdi)!;
        const mesialAt = new THREE.Vector3(...f.ends!.mesial).applyMatrix4(m), distalAt = new THREE.Vector3(...f.ends!.distal).applyMatrix4(m);
        const left = i >= 3;
        const wantM = new THREE.Vector3(...even[left ? i : i + 1]), wantD = new THREE.Vector3(...even[left ? i + 1 : i]);
        const got = level(mesialAt).sub(level(distalAt)).normalize(), want = level(wantM).sub(level(wantD)).normalize();
        turn = Math.max(turn, Math.acos(Math.min(1, got.dot(want))) * 180 / Math.PI);
        // Along the arch (the labial clearance moves the tooth out, which is not a miss).
        most = Math.max(most, Math.abs(level(mesialAt).sub(level(wantM)).dot(want)), Math.abs(level(distalAt).sub(level(wantD)).dot(want)));
      });
      return { most, turn };
    };
    const now = worst(true), before = worst(false);
    expect(now.turn).toBeLessThan(3);
    expect(now.most).toBeLessThan(0.6);
    expect(before.turn).toBeGreaterThan(8);
  });
});
