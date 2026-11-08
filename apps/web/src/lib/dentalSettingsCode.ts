import type { DentalStudioOptions } from "@/lib/dentalModel";

/**
 * Build 273 (Rakesh: "some kind of metadata in the model, like exif for images, that tells you the settings that were
 * chosen"): the Model Builder's choices behind a pair of models, written two ways -
 * - `code`: short, plain ASCII, for the 80-byte header of each saved STL file (slicers ignore it), after the
 *   laboratory-use notice; read it back with `readSettingsCode`.
 * - `parts`: words for the screen, shown with the made models, so a screenshot carries the settings too.
 * Nothing about the patient goes in: not the label, not the scan's name, not where the midline was marked.
 */

/** What the studio chose, as the models were made. `build`: the app's build number, 0 when not known. */
export type DentalSettingsInput = Pick<DentalStudioOptions, "baseStyle" | "hinge" | "hingeStyle" | "baseHeight" | "keepPalate" | "midlineMark" | "pinPlace" | "incisalPin" | "inside" | "infill" | "layout" | "smooth" | "margin" | "risers"> & { build: number };

const STYLE: Record<DentalStudioOptions["baseStyle"], { code: string; word: string }> = {
  clean: { code: "study", word: "Study base" },
  ortho: { code: "ortho", word: "Ortho base" },
  follow: { code: "aligner", word: "Aligner base" },
  plate: { code: "plate", word: "Plate base" },
  articulator: { code: "artic", word: "Articulator base" },
};

/** The header's notice, kept first - shortened from Build 122's so the settings fit beside it. */
export const SETTINGS_NOTICE = "Pare 3D lab/diagnostic use only";
const HEADER_BYTES = 80;

export function dentalSettings(input: DentalSettingsInput): { code: string; parts: string[] } {
  const style = STYLE[input.baseStyle] ?? { code: input.baseStyle, word: input.baseStyle };
  const codes: string[] = [];
  const parts: string[] = [];
  if (input.build > 0) { codes.push(`b${input.build}`); parts.push(`Build ${input.build}`); }
  codes.push(style.code); parts.push(style.word);
  if (input.hinge) {
    const snap = input.hingeStyle === "snap";
    codes.push(snap ? "snap" : "hinge"); parts.push(snap ? "Snap hinge" : "Standard hinge");
    if (input.incisalPin === false) { codes.push("nopin"); parts.push("No pin"); }
    else if (input.pinPlace === "sides") { codes.push("posts"); parts.push("Side posts"); }
    if (input.risers) { codes.push("risers"); parts.push("Risers"); }
  }
  const height = input.baseHeight ?? "standard";
  if (height !== "standard") { codes.push(height); parts.push(height === "tall" ? "Tall" : "Low"); }
  if (input.keepPalate) { codes.push("palate"); parts.push("Palate kept"); }
  if (input.midlineMark) { codes.push("mid"); parts.push("Midline marked"); }
  codes.push(input.inside === "solid" ? "solid" : input.infill === "none" ? "hollow" : input.infill === "base" ? "comb-base" : "comb");
  parts.push(input.inside === "solid" ? "Solid" : input.infill === "none" ? "Hollow" : input.infill === "base" ? "Honeycomb in base" : "Honeycomb");
  if (input.smooth && input.smooth !== "off") { codes.push(`sm-${input.smooth}`); parts.push(`Smoothing ${input.smooth}`); }
  if (input.margin === "manual") { codes.push("drawn"); parts.push("Margin drawn"); }
  codes.push(input.layout === "occlusion" ? "occ" : "print");
  return { code: codes.join(" "), parts };
}

/** The 80 header bytes: the notice, then as much of the code as fits (it is written most important first), space-padded. */
export function settingsHeader(code: string): Uint8Array {
  let text = `${SETTINGS_NOTICE};`;
  for (const word of code.split(" ")) {
    if (text.length + 1 + word.length > HEADER_BYTES) break;
    text += ` ${word}`;
  }
  return new TextEncoder().encode(text.padEnd(HEADER_BYTES, " "));
}

/** The settings code back out of a saved STL file's header, or null when it has none. */
export function readSettingsCode(buffer: ArrayBuffer): string | null {
  if (buffer.byteLength < HEADER_BYTES) return null;
  const text = new TextDecoder().decode(new Uint8Array(buffer, 0, HEADER_BYTES));
  return text.startsWith(`${SETTINGS_NOTICE};`) ? text.slice(SETTINGS_NOTICE.length + 1).trim() : null;
}
