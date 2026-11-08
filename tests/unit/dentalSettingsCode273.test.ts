import { describe, expect, it } from "vitest";
import { dentalSettings, readSettingsCode, settingsHeader, SETTINGS_NOTICE } from "@/lib/dentalSettingsCode";

const ortho = { baseStyle: "ortho" as const, hinge: true, hingeStyle: "snap" as const, baseHeight: "tall" as const, keepPalate: false, midlineMark: [0, 1, 2] as [number, number, number], inside: "open" as const, infill: "honeycomb" as const, layout: "occlusion" as const, build: 273 };

describe("Build 273: the settings a pair of models was made with", () => {
  it("names the choices, in words and as a short code", () => {
    const { code, parts } = dentalSettings(ortho);
    expect(code).toBe("b273 ortho snap tall mid comb occ");
    expect(parts).toEqual(["Build 273", "Ortho base", "Snap hinge", "Tall", "Midline marked", "Honeycomb"]);
    expect(dentalSettings({ ...ortho, hinge: false, baseHeight: "standard", midlineMark: undefined, inside: "solid" }).code).toBe("b273 ortho solid occ");
  });

  it("goes in the STL header after the notice, 80 bytes, and reads back", () => {
    const header = settingsHeader(dentalSettings(ortho).code);
    expect(header.length).toBe(80);
    const buffer = new ArrayBuffer(84);
    new Uint8Array(buffer).set(header);
    expect(new TextDecoder().decode(header).startsWith(SETTINGS_NOTICE)).toBe(true);
    expect(readSettingsCode(buffer)).toBe("b273 ortho snap tall mid comb occ");
  });

  it("drops words from the end, never the middle, when they do not fit", () => {
    const long = Array.from({ length: 20 }, (_, i) => `word${i}`).join(" ");
    const read = readSettingsCode(settingsHeader(long).buffer as ArrayBuffer) ?? "";
    expect(long.startsWith(read)).toBe(true);
    expect(read.length).toBeGreaterThan(30);
  });

  it("keeps nothing about the patient: no label or point", () => {
    const { code, parts } = dentalSettings({ ...ortho, label: "TEST LABEL" } as typeof ortho);
    expect(`${code} ${parts.join(" ")}`).not.toMatch(/TEST|LABEL|0,1,2/);
  });
  it("says no height for an aligner base, which has only one", () => {
    const { code, parts } = dentalSettings({ ...ortho, baseStyle: "follow", baseHeight: "low" });
    expect(code).not.toMatch(/\blow\b|\btall\b/);
    expect(parts).not.toContain("Low");
  });
});
