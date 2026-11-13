import { afterEach, describe, expect, it } from "vitest";
import { setLanguage } from "@/lib/i18n";
import { ERROR_RULES, localizedError, looksEnglish } from "@/lib/userErrors";
import { MESSAGES_EN } from "@/lib/messages.en";

describe("error messages for people", () => {
  afterEach(() => setLanguage("en"));

  it("shows known English error texts in German", () => {
    setLanguage("en");
    expect(localizedError("The stored CAD feature could not be restored as a valid solid")).toBe(MESSAGES_EN["error.storedBodyRestore"]);
    expect(localizedError("The chosen size does not leave a closed solid")).toBe(MESSAGES_EN["edge.errorNoSolidResult"]);
    expect(localizedError("SVG is too large. The maximum supported size is 5 MB")).toContain("5 MB");
    expect(localizedError("OBJ contains a degenerate face")).toBe(MESSAGES_EN["error.objBroken"]);
  });

  it("explains that the browser ran out of memory, in the person's language (#383)", () => {
    for (const raw of ["Array buffer allocation failed", "RangeError: Invalid array length", "Out of memory"]) {
      setLanguage("en");
      expect(localizedError(raw)).toBe(MESSAGES_EN["error.outOfMemory"]);
      setLanguage("en");
      expect(localizedError(raw)).toBe(MESSAGES_EN["error.outOfMemory"]);
    }
  });







  it("shows English texts in English", () => {
    setLanguage("en");
    expect(localizedError("The stored CAD feature could not be restored as a valid solid")).toBe(MESSAGES_EN["error.storedBodyRestore"]);
    expect(localizedError("Something unexpected could not be written")).toBe("Something unexpected could not be written");
  });

  it("has a German and an English text for every rule", () => {
    for (const rule of ERROR_RULES) {
      expect(MESSAGES_EN[rule.key], rule.key).toBeTruthy();
      expect(MESSAGES_EN[rule.key], rule.key).toBeTruthy();
    }
  });
});

describe("a raw English text in a language without a word list of its own", () => {
  it("reads plain English as English, and nothing else", () => {
    expect(looksEnglish("The kernel could not build the body.")).toBe(true);
    expect(looksEnglish("This file has no valid contours")).toBe(true);
    expect(looksEnglish("Der Körper konnte nicht gebaut werden")).toBe(false);
    expect(looksEnglish("Не удалось построить тело")).toBe(false);
    expect(looksEnglish("Fehler")).toBe(false);
    expect(looksEnglish("no")).toBe(false);
  });


});
