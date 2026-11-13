import { describe, expect, it } from "vitest";
import { GUIDE_DEFAULTS, guideFrame, guideLines, markedArc, toothCaliper, type GuideAnchors } from "@/lib/waxGuides";

type V = [number, number, number];
/**
 * An upper arch as marked, in a scene where the incisal is at -z (teeth hanging down), the front at -y and the
 * patient's right at -x: seven contacts round a parabola at the edge level, canine tips 1 mm gingival of it,
 * six gum marks 10.5 mm up (the laterals' 1 mm short).
 */
const arch = (): GuideAnchors => {
  const y = (x: number) => 0.03 * x * x - 10;
  const xs = [-19, -12, -8.5, 0, 8.5, 12, 19];
  const contacts = xs.map((x) => [x, y(x), 0] as V);
  const mids = [-15.5, -10.2, -4.2, 4.2, 10.2, 15.5];
  const gum = mids.map((x, i) => [x, y(x) + 0.5, i === 1 || i === 4 ? 9.5 : 10.5] as V);
  return { midline: [0, -10, 0], canines: [[-15.5, y(15.5), 1], [15.5, y(15.5), 1]], up: [0, 0, -1], out: [0, -1, 0], contacts, gum };
};
const line = (anchors: GuideAnchors, set = GUIDE_DEFAULTS, key: string) => guideLines(anchors, set).find((one) => one.key === key)!.points;

describe("the Design step's guide lines (build 331)", () => {
  it("lays its frame from the marks: across towards the patient's left, up towards the incisal", () => {
    const frame = guideFrame(arch())!;
    expect(frame.across[0]).toBeCloseTo(1, 6);
    expect(frame.up[2]).toBeCloseTo(-1, 6);
    // An up that points at the gum is turned round by the gum marks.
    expect(guideFrame({ ...arch(), up: [0, 0, 1] })!.up[2]).toBeCloseTo(-1, 6);
  });

  it("draws the midline upright through the marked midline, from past the edge to past the gum", () => {
    const [a, b] = line(arch(), GUIDE_DEFAULTS, "midline");
    expect(a[0]).toBeCloseTo(0, 6); expect(b[0]).toBeCloseTo(0, 6);
    expect(a[2]).toBeLessThan(-2); expect(b[2]).toBeGreaterThan(12);
  });

  it("moves the midline with its slider, towards the patient's left for plus", () => {
    const [a, b] = line(arch(), { ...GUIDE_DEFAULTS, midline: 1.5 }, "midline");
    expect(a[0]).toBeCloseTo(1.5, 6); expect(b[0]).toBeCloseTo(1.5, 6);
  });

  it("runs the incisal curve level through the midline and through the canine tips as marked", () => {
    expect(markedArc(arch())).toBeCloseTo(1, 6);
    const run = line(arch(), GUIDE_DEFAULTS, "incisal");
    const at = (x: number) => run.reduce((best, p) => (Math.abs(p[0] - x) < Math.abs(best[0] - x) ? p : best));
    expect(at(0)[2]).toBeCloseTo(0, 6);
    // At a canine tip (15.5 across) the curve has fallen away by the marked 1 mm, towards the gum (+z here).
    const run2 = run.filter((p) => Math.abs(Math.abs(p[0]) - 15.5) < 1.2);
    expect(run2.length).toBeGreaterThan(0);
    for (const p of run2) expect(p[2]).toBeCloseTo((p[0] / 15.5) ** 2, 6);
    // It follows the arch as the contacts were marked.
    expect(run[0][0]).toBeCloseTo(-19, 6); expect(run[run.length - 1][0]).toBeCloseTo(19, 6);
  });

  it("moves the incisal curve and changes its depth with their sliders", () => {
    const longer = line(arch(), { ...GUIDE_DEFAULTS, incisal: 1, arc: 0 }, "incisal");
    for (const p of longer) expect(p[2]).toBeCloseTo(-1, 6);
  });

  it("runs the zenith line straight from one canine's gum mark to the other's, the laterals' marks short of it", () => {
    const run = line(arch(), GUIDE_DEFAULTS, "zenith");
    for (const p of run) expect(p[2]).toBeCloseTo(10.5, 6);
    const moved = line(arch(), { ...GUIDE_DEFAULTS, zenith: 1 }, "zenith");
    for (const p of moved) expect(p[2]).toBeCloseTo(9.5, 6);
  });

  it("leaves the zenith line out where the canines have no gum mark, and still draws the others", () => {
    const anchors = arch();
    anchors.gum![0] = null;
    expect(guideLines(anchors, GUIDE_DEFAULTS).map((one) => one.key)).toEqual(["midline", "incisal"]);
  });
});

describe("a tooth measured as with a caliper (build 331)", () => {
  // A block 8.6 wide (mesial along x), 7 thick, from its edge at z = 0 to z = 12 (incisal at -z): corners only.
  const corners: number[] = [];
  for (const x of [-4.3, 4.3]) for (const y of [-7, 0]) for (const z of [0, 12]) corners.push(x, y, z);
  const frame = { origin: [0, 0, 0], mesial: [1, 0, 0], up: [0, 0, -1], out: [0, 1, 0] };

  it("reads the width, the length to the tooth's own end, and their proportion", () => {
    const c = toothCaliper(corners, frame)!;
    expect(c.width).toBeCloseTo(8.6, 6);
    expect(c.length).toBeCloseTo(12, 6);
    expect(c.ratio).toBeCloseTo(71.67, 1);
  });

  it("with a gum mark the length is the crown's, from the edge to the mark", () => {
    const c = toothCaliper(corners, frame, [0, 0, 10.75])!;
    expect(c.length).toBeCloseTo(10.75, 6);
    expect(c.ratio).toBeCloseTo(80, 6);
    // The spans drawn: across the width, and from the edge to the gum mark's level.
    expect(Math.abs(c.span[1][0] - c.span[0][0])).toBeCloseTo(8.6, 6);
    expect(c.edge[2]).toBeCloseTo(0, 6); expect(c.neck[2]).toBeCloseTo(10.75, 6);
  });

  it("a gum mark that is not on the tooth is not used, and nothing is said of no tooth at all", () => {
    expect(toothCaliper(corners, frame, [0, 0, -5])!.length).toBeCloseTo(12, 6);
    expect(toothCaliper([], frame)).toBeNull();
  });
});

describe("each guide line hidden on its own (build 332)", () => {
  it("leaves out only the lines unticked", () => {
    expect(guideLines(arch(), { ...GUIDE_DEFAULTS, hide: { zenith: true } }).map((one) => one.key)).toEqual(["midline", "incisal"]);
    expect(guideLines(arch(), { ...GUIDE_DEFAULTS, hide: { midline: true, incisal: true } }).map((one) => one.key)).toEqual(["zenith"]);
    expect(guideLines(arch(), { ...GUIDE_DEFAULTS, hide: { caliper: true } }).map((one) => one.key)).toEqual(["midline", "incisal", "zenith"]);
  });
});
