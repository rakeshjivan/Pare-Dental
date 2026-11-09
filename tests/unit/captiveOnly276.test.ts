import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dentalSettings } from "@/lib/dentalSettingsCode";

/** Build 276 (Rakesh): the passive hinge is no longer offered - every articulated pair has the captive hinge. */
describe("captive hinge only", () => {
  const ortho = { baseStyle: "ortho" as const, hinge: true, keepPalate: false, inside: "open" as const, infill: "honeycomb" as const, layout: "occlusion" as const, build: 276 };

  it("stamps the captive hinge, even for a case saved with the passive one", () => {
    expect(dentalSettings({ ...ortho, hingeStyle: "standard" }).code).toContain("snap");
    expect(dentalSettings({ ...ortho, hingeStyle: "standard" }).parts).not.toContain("Standard hinge");
    expect(dentalSettings({ ...ortho, hingeStyle: "snap" }).code).toBe(dentalSettings({ ...ortho, hingeStyle: "standard" }).code);
  });

  it("offers no choice of hinge in the Model Builder", () => {
    const panel = readFileSync("apps/web/src/components/workplane/DentalStudioPanel.tsx", "utf8");
    expect(panel).not.toContain('"studio.hingeStandard"');
    expect(panel).not.toContain('"studio.chooseHinge"');
  });

  it("makes every articulated pair with the snap hinge", () => {
    const model = readFileSync("apps/web/src/lib/dentalModel.ts", "utf8");
    expect(model).toContain("...(options.smoothBase ? { snap: { grip: options.snapGrip } } : {})");
  });
});
