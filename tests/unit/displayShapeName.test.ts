import { afterEach, describe, expect, it } from "vitest";
import { setLanguage } from "@/lib/i18n";
import { displayShapeName, renamedShapeName } from "@/lib/shapeCatalog";

describe("displayShapeName", () => {
  afterEach(() => setLanguage("en", false));



  it("leaves a name somebody typed alone", () => {
    setLanguage("en", false);
    expect(displayShapeName({ name: "Deckel", kind: "box" })).toBe("Deckel");
    // "Box" on a cylinder is not the catalogue name for it, so it was chosen.
    expect(displayShapeName({ name: "Box", kind: "cylinder" })).toBe("Box");
  });

  it("switches back with the language", () => {
    setLanguage("en", false);
    expect(displayShapeName({ name: "Sketch extrusion", kind: "mesh" })).toBe("Sketch body");
    expect(displayShapeName({ name: "Box", kind: "box" })).toBe("Box");
  });
});

describe("renamedShapeName", () => {
  afterEach(() => setLanguage("en", false));

  it("stores a new name, trimmed", () => {
    expect(renamedShapeName({ name: "Box", kind: "box" }, "  Lid  ")).toBe("Lid");
    expect(renamedShapeName({ name: "Lid", kind: "box" }, "Base")).toBe("Base");
  });

  it("changes nothing when the shown name is confirmed as it is", () => {
    expect(renamedShapeName({ name: "Lid", kind: "box" }, "Lid")).toBeUndefined();
    expect(renamedShapeName({ name: "Lid", kind: "box" }, " Lid ")).toBeUndefined();
  });



  it("clears the name when the field is emptied, which shows the default again", () => {
    const shape = { name: "Lid", kind: "box" as const };
    expect(renamedShapeName(shape, "   ")).toBe("");
    expect(displayShapeName({ ...shape, name: "" })).toBe("Box");
  });
});
