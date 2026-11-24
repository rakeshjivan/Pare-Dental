import { describe, expect, it } from "vitest";
import {
  splitByLabel, centroidOf, toothFrame, moveMatrix, applyMatrix, applyMove, isMoved,
  buildSmile, capturedShare, hasMovedTeeth, averageNormal, CAPTURED, SYNTHESISED, NO_MOVE,
  type ToothFrame, type SmileResult, type ToothMove,
} from "@/lib/smileGuide";

/** Build 128 (Rakesh): Smile Guide's pipeline core - segment, lift, rigid-move, reconcile, with an honest
 * captured-vs-synthesised provenance mask. These lock the deterministic geometry; extendNeck and
 * closeSmallMeshHoles are covered by their own suites. */

const tri = (...pts: number[]) => pts; // 9 floats = one triangle

function sampleScan() {
  const scan = [
    ...tri(0, 0, 0, 1, 0, 0, 0, 1, 0), // gum A
    ...tri(1, 0, 0, 1, 1, 0, 0, 1, 0), // gum B
    ...tri(0, 0, 1, 1, 0, 1, 0, 1, 1), // tooth 11
    ...tri(2, 0, 1, 3, 0, 1, 2, 1, 1), // tooth 21
  ];
  const labels = [0, 0, 11, 21];
  return { scan: Float32Array.from(scan), labels: Uint8Array.from(labels) };
}

describe("splitByLabel", () => {
  it("partitions triangles by FDI, label 0 to gum", () => {
    const { scan, labels } = sampleScan();
    const { gum, teeth } = splitByLabel(scan, labels);
    expect(gum.length).toBe(18); // 2 triangles
    expect([...teeth.keys()].sort((a, b) => a - b)).toEqual([11, 21]);
    expect(teeth.get(11)!.length).toBe(9);
    expect(teeth.get(21)!.length).toBe(9);
  });
});

describe("averageNormal", () => {
  it("is the outward face normal for a CCW triangle (XY plane -> +Z)", () => {
    const n = averageNormal(tri(0, 0, 0, 1, 0, 0, 0, 1, 0));
    expect(n[0]).toBeCloseTo(0);
    expect(n[1]).toBeCloseTo(0);
    expect(n[2]).toBeCloseTo(1);
  });
});

describe("centroidOf", () => {
  it("averages the corners", () => {
    const c = centroidOf(tri(0, 0, 0, 3, 0, 0, 0, 3, 0));
    expect(c[0]).toBeCloseTo(1);
    expect(c[1]).toBeCloseTo(1);
    expect(c[2]).toBeCloseTo(0);
  });
});

describe("moveMatrix / applyMatrix", () => {
  const frame: ToothFrame = { origin: [0, 0, 0], up: [0, 0, 1], out: [1, 0, 0] };

  it("translates in world axes", () => {
    const m = moveMatrix(frame, { translate: [1, 2, 3] });
    const out = applyMatrix([0, 0, 0], m);
    expect([...out]).toEqual([1, 2, 3]);
  });

  it("rotates about the long axis in place (out -> mesial at +90 deg)", () => {
    const m = moveMatrix(frame, { rotateUpDeg: 90 });
    const out = applyMatrix([1, 0, 0], m); // the labial point swings to the mesial axis
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(1);
    expect(out[2]).toBeCloseTo(0);
  });

  it("rotation about origin leaves the origin fixed", () => {
    const m = moveMatrix(frame, { rotateUpDeg: 37, rotateOutDeg: 12 });
    const out = applyMatrix([0, 0, 0], m);
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(0);
    expect(out[2]).toBeCloseTo(0);
  });
});

describe("isMoved", () => {
  it("is false for identity and zero translate, true for any real change", () => {
    expect(isMoved(NO_MOVE)).toBe(false);
    expect(isMoved({ translate: [0, 0, 0] })).toBe(false);
    expect(isMoved({ translate: [0, 0, 1] })).toBe(true);
    expect(isMoved({ rotateUpDeg: 5 })).toBe(true);
    expect(isMoved({ rotateMesialDeg: -2 })).toBe(true);
  });
});

describe("applyMove", () => {
  it("leaves an unmoved tooth where it was", () => {
    const { scan, labels } = sampleScan();
    const tooth = splitByLabel(scan, labels).teeth.get(11)!;
    const frame = toothFrame(tooth);
    const same = applyMove(tooth, frame, NO_MOVE);
    for (let i = 0; i < tooth.length; i += 1) expect(same[i]).toBeCloseTo(tooth[i]);
  });

  it("shifts a translated tooth by exactly the translation", () => {
    const { scan, labels } = sampleScan();
    const tooth = splitByLabel(scan, labels).teeth.get(11)!;
    const frame = toothFrame(tooth);
    const moved = applyMove(tooth, frame, { translate: [0, 0, 5] });
    for (let i = 0; i + 2 < tooth.length; i += 3) expect(moved[i + 2]).toBeCloseTo(tooth[i + 2] + 5);
  });
});

describe("buildSmile", () => {
  it("assembles a result with provenance for every triangle and both teeth present", () => {
    const { scan, labels } = sampleScan();
    const result = buildSmile(scan, labels, new Map(), { emergence: false });
    const triangles = Math.floor(result.soup.length / 9);
    expect(result.provenance.length).toBe(triangles);
    expect([...result.teeth.keys()].sort((a, b) => a - b)).toEqual([11, 21]);
    expect(hasMovedTeeth(result)).toBe(false);
  });

  it("flags a moved tooth and keeps a captured crown", () => {
    const { scan, labels } = sampleScan();
    const moves = new Map<number, ToothMove>([[11, { translate: [0, 0, 4] }]]);
    const result = buildSmile(scan, labels, moves, { emergence: false });
    expect(hasMovedTeeth(result)).toBe(true);
    expect(result.teeth.get(11)!.moved).toBe(true);
    expect(result.teeth.get(21)!.moved).toBe(false);
    // a pure translate with emergence off adds nothing synthesised from the teeth
    expect(result.provenance).toContain(CAPTURED);
  });
});

describe("capturedShare / honesty mask", () => {
  it("computes the captured share from the mask", () => {
    const fake: SmileResult = {
      soup: new Float32Array(0),
      provenance: Uint8Array.from([CAPTURED, CAPTURED, SYNTHESISED, CAPTURED]),
      teeth: new Map([[11, { frame: { origin: [0, 0, 0], up: [0, 0, 1], out: [1, 0, 0] }, moved: true, triangles: 1 }]]),
    };
    expect(capturedShare(fake)).toBeCloseTo(0.75);
    expect(hasMovedTeeth(fake)).toBe(true);
  });
});
