import { LANGUAGE_INFO, type Language } from "@/lib/i18n";
import type { ShapeKind } from "@/types/layerling";

/**
 * The chapters of the user guide (docs/guide) by what they are about, with the
 * file name each language gave them. The pages are static files next to the
 * program, so a link is a plain path. A test compares this table with the
 * chapters on disk - a chapter renamed there without a change here would leave
 * every question mark pointing nowhere.
 */
export const GUIDE_CHAPTERS = {
  start: { en: "getting-started" },
  view: { en: "view-and-workplane" },
  shapes: { en: "shapes" },
  select: { en: "select-and-arrange" },
  solids: { en: "solids-and-holes" },
  edges: { en: "edges-and-hollowing" },
  sketches: { en: "sketches" },
  text: { en: "text" },
  threads: { en: "threads-and-mechanics" },
  measuring: { en: "measuring-and-notes" },
  printing: { en: "printing" },
  files: { en: "files-and-saving" },
  shortcuts: { en: "shortcuts" },
  ai: { en: "ai-with-mcp" },
  tablet: { en: "tablet-and-touch" },
  offline: { en: "offline-and-install" },
  // Fork (build 64): Dental Studio has a chapter of its own (English only, as the guide is).
  dental: { en: "dental-studio" },
} as const satisfies Record<string, { en: string } & Partial<Record<Language, string>>>;

export type GuideChapter = keyof typeof GUIDE_CHAPTERS;

/**
 * Sections inside a chapter that a question mark jumps to directly: the chapter
 * and the id each language's heading gets (slugify in build-guide.mjs). The
 * same test checks every id against the headings on disk.
 */
export const GUIDE_SECTIONS = {
  sectionView: { chapter: "view", en: "looking-inside-the-section-view" },
  viewCube: { chapter: "view", en: "the-view-cube" },
  cameraBar: { chapter: "view", en: "the-camera-bar" },
  gridAndSnapping: { chapter: "view", en: "grid-and-snapping" },
  colorCard: { chapter: "shapes", en: "choosing-colours" },
  shapeSettings: { chapter: "shapes", en: "the-shape-s-settings" },
  wrapCylinder: { chapter: "shapes", en: "wrapping-around-a-cylinder" },
  textFill: { chapter: "text", en: "outline-silhouette-and-wider" },
  textLayers: { chapter: "text", en: "layers-and-name-tags" },
  iconTag: { chapter: "text", en: "icon-tags" },
  qrCode: { chapter: "text", en: "qr-codes" },
  myShapes: { chapter: "shapes", en: "custom-shapes" },
  objectList: { chapter: "select", en: "the-object-list" },
  pattern: { chapter: "select", en: "patterns-row-grid-and-circle" },
  holePattern: { chapter: "select", en: "hole-pattern-on-a-face" },
  faceTool: { chapter: "select", en: "pushing-a-face-out-or-in" },
  scaleByPercent: { chapter: "select", en: "scaling-by-percent" },
  selectionProperties: { chapter: "select", en: "changing-several-parts-at-once" },
  historyView: { chapter: "select", en: "looking-back-the-history-view" },
  grouping: { chapter: "solids", en: "grouping" },
  bundling: { chapter: "solids", en: "bundling" },
  intersection: { chapter: "solids", en: "intersection" },
  splitting: { chapter: "solids", en: "splitting" },
  edgeTreatment: { chapter: "edges", en: "chamfering-and-filleting-edges" },
  hollowing: { chapter: "edges", en: "hollowing-bodies" },
  offset: { chapter: "edges", en: "offsetting-bodies" },
  cutOut: { chapter: "solids", en: "cutting-one-body-out-of-another" },
  flexi: { chapter: "threads", en: "flexi-joints" },
  lid: { chapter: "edges", en: "a-lid-for-an-open-body" },
  vase: { chapter: "shapes", en: "a-vase" },
  ports: { chapter: "threads", en: "port-openings" },
  deleteFace: { chapter: "edges", en: "deleting-faces" },
  threads: { chapter: "threads", en: "threads" },
  gears: { chapter: "threads", en: "gears" },
  springs: { chapter: "threads", en: "springs" },
  bentTubes: { chapter: "threads", en: "bent-tubes" },
  loft: { chapter: "threads", en: "loft" },
  gridfinity: { chapter: "threads", en: "gridfinity" },
  hinge: { chapter: "threads", en: "hinge" },
  knurl: { chapter: "threads", en: "knurling" },
  dovetail: { chapter: "threads", en: "dovetail" },
  teardrop: { chapter: "threads", en: "teardrop-hole" },
  screwHoles: { chapter: "threads", en: "counterbore-and-countersink" },
  ruler: { chapter: "measuring", en: "the-ruler" },
  printer: { chapter: "printing", en: "choosing-your-printer" },
  designFolders: { chapter: "files", en: "folders-for-your-designs" },
  backingUp: { chapter: "files", en: "backing-up-and-passing-on" },
  exporting: { chapter: "files", en: "exporting" },
  importing: { chapter: "files", en: "importing" },
  simplifyMesh: { chapter: "files", en: "simplifying-an-imported-mesh" },
  tapeMeasure: { chapter: "measuring", en: "the-tape-measure" },
  notes: { chapter: "measuring", en: "notes" },
  sketchCorners: { chapter: "sketches", en: "rounding-or-chamfering-corners" },
  sketchImage: { chapter: "sketches", en: "a-picture-as-template" },
  sketchStroke: { chapter: "sketches", en: "building-as-a-stroke" },
  customFonts: { chapter: "text", en: "your-own-fonts" },
  sketchFill: { chapter: "sketches", en: "fill-and-silhouette" },
  sketchDrawing: { chapter: "sketches", en: "drawing" },
  sketchSweep: { chapter: "sketches", en: "sweeping-along-a-path" },
  sketchToBody: { chapter: "sketches", en: "making-a-body-from-it" },
  addShape: { chapter: "shapes", en: "adding-a-shape" },
  rotating: { chapter: "select", en: "rotating-and-setting-the-pivot" },
  selecting: { chapter: "select", en: "selecting" },
  layFlat: { chapter: "select", en: "laying-flat-on-a-face" },
  referencePoints: { chapter: "measuring", en: "reference-points" },
  addingText: { chapter: "text", en: "adding-text" },
  sketchMirror: { chapter: "sketches", en: "mirroring" },
  sketchCurve: { chapter: "sketches", en: "curving-a-straight-side" },
  // Fork (build 26): Pare 3D's own tools.
  blend: { chapter: "solids", en: "blend" },
  readyParts: { chapter: "shapes", en: "ready-made-parts" },
  // Fork (build 33).
  hull: { chapter: "solids", en: "hull-wrapping-parts-in-one-body" },
  fitCheck: { chapter: "printing", en: "fit-check-overlaps-and-tight-gaps" },
  meshRound: { chapter: "files", en: "rounding-a-mesh" },
  meshSculpt: { chapter: "files", en: "sculpting-a-mesh" },
  // Fork (build 55).
  texture: { chapter: "files", en: "surface-textures" },
  dentalModel: { chapter: "dental", en: "the-short-way" },
  surfaceText: { chapter: "text", en: "text-on-any-surface" },
  parameters: { chapter: "measuring", en: "parameters-named-sizes" },
  draft: { chapter: "edges", en: "draft-angle" },
  makeFromPhoto: { chapter: "shapes", en: "making-from-a-photo-or-a-pattern" },
  spaceOut: { chapter: "select", en: "spacing-parts-out" },
  printCheck: { chapter: "printing", en: "ready-to-print" },
  printFit: { chapter: "printing", en: "holes-that-fit" },
  commandSearch: { chapter: "shortcuts", en: "command-search" },
  interactiveHelp: { chapter: "shortcuts", en: "interactive-help" },
  whatsNew: { chapter: "start", en: "new-since-your-last-visit" },
} as const satisfies Record<string, { chapter: GuideChapter; en: string } & Partial<Record<Language, string>>>;

export type GuideSection = keyof typeof GUIDE_SECTIONS;

/** The address of a chapter or one of its sections, or of the guide's overview when neither is named. */
export function guideHref(requested: Language, chapter?: GuideChapter, section?: GuideSection): string {
  // Fork (Pare 3D build 26): the guide is English only, whatever language the program is in.
  void requested;
  const language: Language = "en";
  const directory = LANGUAGE_INFO[language].guideDir;
  const target = section ? GUIDE_SECTIONS[section] : null;
  const page = target?.chapter ?? chapter;
  if (!page) return `/${directory}/index.html`;
  // A language without names of its own in the tables above names its chapters like the English
  // ones, and a chapter it has not translated shows the English text under that same name.
  const chapterSlug = (GUIDE_CHAPTERS[page] as { en: string } & Partial<Record<Language, string>>)[language] ?? GUIDE_CHAPTERS[page].en;
  const anchor = target ? (target as { en: string } & Partial<Record<Language, string>>)[language] ?? target.en : null;
  return `/${directory}/${chapterSlug}.html${anchor ? `#${anchor}` : ""}`;
}

/**
 * Where in its chapter a shape is explained - the heading its question mark
 * jumps to. Text and sketches have a chapter of their own and open its top.
 */
type GuideShape = {
  kind: ShapeKind;
  groupedShapes?: readonly unknown[];
  groupOperation?: string;
  sketchProfile?: unknown;
  sketchOperation?: string;
  importedMesh?: { sourceFormat?: string };
  layeredText?: boolean;
  layeredIcon?: boolean;
  qrCode?: unknown;
};

export function guideSectionForShape(shape: GuideShape): GuideSection | undefined {
  // A name tag (#215) is a bundle, but its panel is explained with the text.
  if (shape.layeredText && shape.groupedShapes?.length) return "textLayers";
  // An icon tag is a bundle too; its card is explained next to the name tag.
  if (shape.layeredIcon && shape.groupedShapes?.length) return "iconTag";
  // A QR code (#553), alone or on its plate, is explained with the texts and tags.
  if (shape.qrCode) return "qrCode";
  if (shape.groupedShapes?.length) {
    if (shape.groupOperation === "bundle") return "bundling";
    if (shape.groupOperation === "intersection" || shape.groupOperation === "loft") return "intersection";
    return "grouping";
  }
  // A body made from a sketch, or a file brought in, is explained where it was made.
  // An extruded one shows its fill in the properties (#197); a revolved one, how it was made.
  if (shape.sketchProfile) return shape.sketchOperation === "revolve" ? "sketchToBody" : shape.sketchOperation === "sweep" ? "sketchSweep" : "sketchFill";
  if (shape.kind === "mesh" && shape.importedMesh && shape.importedMesh.sourceFormat !== "json") return "importing";
  switch (shape.kind) {
    case "text":
      return "addingText";
    case "sketch":
    case "scribble":
      return "sketchToBody";
    case "thread":
      return "threads";
    case "gear":
    case "hirth":
      return "gears";
    case "spring":
      return "springs";
    case "bentTube":
      return "bentTubes";
    case "loft":
      return "loft";
    case "vase":
      return "vase";
    case "honeycomb":
      // No longer a shape of its own: the hole pattern tool took its place (#223).
      return "holePattern";
    case "gridfinity":
      return "gridfinity";
    case "hinge":
      return "hinge";
    case "knurl":
      return "knurl";
    case "dovetail":
      return "dovetail";
    case "teardrop":
      return "teardrop";
    case "port":
      return "ports";
    case "counterbore":
    case "countersink":
    case "doubleCountersink":
      return "screwHoles";
    case "ruler":
      return "ruler";
    default:
      return "shapeSettings";
  }
}

/** Which chapter explains a shape - the one its question mark opens. */
export function guideChapterForShape(shape: GuideShape): GuideChapter {
  // The chapter always matches the section the question mark jumps to.
  const section = guideSectionForShape(shape);
  if (section) return GUIDE_SECTIONS[section].chapter;
  if (shape.groupedShapes?.length) return "solids";
  switch (shape.kind) {
    case "text":
      return "text";
    case "thread":
    case "spring":
    case "gear":
    case "hirth":
    case "bentTube":
    case "loft":
    case "gridfinity":
    case "hinge":
    case "knurl":
    case "dovetail":
    case "teardrop":
    case "port":
    case "counterbore":
    case "countersink":
    case "doubleCountersink":
      return "threads";
    case "ruler":
      return "measuring";
    case "sketch":
    case "scribble":
      return "sketches";
    default:
      return "shapes";
  }
}
