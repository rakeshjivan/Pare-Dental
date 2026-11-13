"use client";

/**
 * Build 79: Dental Studio's wax-up step - a tooth set from a library set over the scan's anterior
 * teeth, placed from three landmarks, then adjusted tooth by tooth with the usual handles. The wax
 * only ever adds; Make joins it to the model.
 */
import { AlertTriangle, Check, LoaderCircle, Upload } from "lucide-react";
import { WAX_SET_FORM_ORDER, type WaxSetForm } from "@/lib/waxSetForms";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { setWaxMoreDots, waxMoreDots } from "@/components/workplane/WaxToothDirect";
import type { WaxRestrict } from "@/components/workplane/WaxToothDrag";
/** Build 103: a confirmed tooth's colour, by FDI (each tooth its own, as Meshmixer shows them). */
/** Build 105: each library tooth in its own colour while it is being positioned (light; a confirmed tooth takes the stronger colour below). */
/** Build 106: the wax teeth in one colour (the studio's default; each tooth in its own colour is a switch). */
export const WAX_BLUE = "#a8c3ea";
/** Build 287: a wax tooth that is not the one being worked on (one tooth picked): plain, a shade warmer than the scan. */
export const WAX_PLAIN = "#ded6c6";
/** Build 107: Meshmixer's colours for a six-tooth part, tooth by tooth (sampled from its screen): salmon, purple, blue | green, tan; the 23 in yellow, not white, to stand out from the scan. */
export const WAX_TOOTH_COLOURS: Record<number, string> = {
  13: "#e09a88", 12: "#c486d0", 11: "#8fb8d5", 21: "#7ec479", 22: "#c39c70", 23: "#f2d04b",
  14: "#e6b3d9", 15: "#d7d38e", 24: "#a9b8f0", 25: "#f0bb90",
  43: "#e09a88", 42: "#c486d0", 41: "#8fb8d5", 31: "#7ec479", 32: "#c39c70", 33: "#f2d04b",
  44: "#e6b3d9", 45: "#d7d38e", 34: "#a9b8f0", 35: "#f0bb90",
};
/** Build 105: the teeth marked and waxed up unless the dentist chooses others: canine to canine. */
export const defaultMarkTeeth = (slot: "upper" | "lower") => (slot === "upper" ? [13, 12, 11, 21, 22, 23] : [43, 42, 41, 31, 32, 33]);
export const WAX_CONFIRMED_COLOURS: Record<number, string> = { 11: "#e0605a", 21: "#e0605a", 12: "#4f9fd8", 22: "#4f9fd8", 13: "#5bb878", 23: "#5bb878", 31: "#e0605a", 41: "#e0605a", 32: "#4f9fd8", 42: "#4f9fd8", 33: "#5bb878", 43: "#5bb878", 14: "#c98ad6", 24: "#c98ad6", 15: "#e3b04b", 25: "#e3b04b", 34: "#c98ad6", 44: "#c98ad6", 35: "#e3b04b", 45: "#e3b04b" };
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import { CONTACT_STOPS, contactGradient } from "@/lib/biteContacts";
import { t } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages.en";
import { SET_DEFAULTS, SET_RANGES, type SetControls } from "@/lib/waxSmileSet";
import { ARCH_SHAPE, GUIDE_RANGES, type GuidePart, type GuideSet } from "@/lib/waxGuides";
import { EDIT_RANGES, EDIT_SLIDERS, NO_EDIT, type ToothEdit, type EditKey } from "@/lib/waxToothEdit";
import { type SmileCheck, type ToothAdjust, type ToothNudge } from "@/lib/dentalWaxup";
import type { WorkplaneWorkspaceSettings } from "@/types/layerling";

/** How long the wax can make the teeth, mm (negative shortens). */
export const WAX_LENGTHEN = { min: -2, max: 3, step: 0.25 } as const;
/** Wax over the patient's tooth below this, mm, is pointed out. */
export const WAX_THIN = 0.2;

export type WaxupView = {
  slot: "upper" | "lower";
  /** Build 277: the front teeth as one set on the arch - its controls and what they make (null: none for this arch). */
  smileSet?: { marked?: boolean; controls: SetControls; centralWidth: number; centralLength: number; red: number | null } | null;
  /** Build 277 (phase 3): the one front tooth chosen in the set, with its own changes. */
  toothEdit?: { fdi: number; edit: ToothEdit; mirror: boolean; give?: boolean; width: number; length: number; live?: boolean; /** Build 331: the tooth as measured in the view (its crown, from its edge to its gum mark), mm. */ measured?: { width: number; length: number } } | null;
  /** Build 331: the Design step's guide lines on this arch (null: none to show here), and the incisal curve's depth as the canine tips were marked. */
  guideSet?: (GuideSet & { arcMarked: number }) | null;
  /** Build 278 (step 1, Mark): this arch's nine marks (null: not placed), each front tooth's width from them (mm, by FDI), and the arches fully marked. */
  archMarkList?: Array<[number, number, number] | null>;
  /** Build 285: the marks were found on the scan for the dentist to check ("failed": looked for, not made out). */
  archMarksFound?: "found" | "failed";
  archMarkWidths?: Record<number, number>;
  archMarksDone?: Array<"upper" | "lower">;
  archMarkPick?: number | null;
  /** Build 279: each wax tooth's patient tooth standing proud of it (mm), and whether it is cut back flush on the wax-up model. */
  proudTeeth?: Array<{ fdi: number; depth: number; reduce: boolean }>;
  /** Build 107: the dropped set's size, as a share of the library's own (1 = as made). */
  setScale?: number;
  /** Build 107: how much further back (+) or forward (-) the canines stand than as dropped, mm. */
  setCurve?: number;
  /** Build 108: the set chosen for each arch (both arches waxed: one for the upper, one for the lower). */
  setIds?: { upper?: string; lower?: string };
  /** Build 299: each arch's sets in order of fit to its marks (lib/waxSetPick), the best first; absent until worked out. */
  setRank?: Partial<Record<"upper" | "lower", string[]>>;
  /** Build 117: single teeth instead of the whole set, by arch - the teeth to wax (each from the set chosen); absent: the whole set. */
  single?: Partial<Record<"upper" | "lower", number[]>>;
  /** Build 108: the Gum line step - follow the patient's gum, or an even line (each pair's visible crown length at its zenith, mm). */
  gum?: { mode: import("@/lib/waxGum").GumMode; keep: Record<string, number> };
  /** Build 118: the palatal surface on the made model - the library tooth's (the patient's palatal pressed onto it) or the patient's as scanned. */
  palatal?: import("@/lib/waxPalatal").PalatalForm;
  /** Build 108: Open the bite - the opening at the incisors (mm), the hinge once worked out, and whether it is being worked out. */
  bite?: { raise: number; busy: boolean; hinge: import("@/lib/waxOcclusion").BiteHinge | null };
  /** Build 110: Keep & erase - each wax tooth's paint (by its id), and the brush in hand. */
  erase?: Record<string, import("@/lib/waxErase").ToothErase>;
  eraseBrush?: { tool: "keep" | "unkeep" | "erase" | "unerase"; size: number };
  /** Build 111: the palatal (lingual) margin line - on (the second way of working) or off; each tooth's line (studio coordinates, the scan it was drawn on); the line being drawn. */
  marginOn?: boolean;
  margins?: Partial<Record<"upper" | "lower", { scan: string; lines: Record<number, Array<[number, number, number]>> }>>;
  marginPick?: { fdi: number; points: Array<[number, number, number]> } | null;
  /** Build 117: boundary lines drawn on the patient's teeth in Sculpt (studio coordinates, the scan they were drawn on) - wax is kept on a line's incisal side only; and the line being drawn. */
  boundaries?: Partial<Record<"upper" | "lower", { scan: string; lines: Record<number, Array<Array<[number, number, number]>>> }>>;
  boundaryPick?: { fdi: number; points: Array<[number, number, number]> } | null;
  /** Build 117: the wax and opening the last fit was worked out for still hold. */
  biteFitFresh?: boolean;
  /** Build 117: both arches in the case (a bite to fit to). */
  pairForBite?: boolean;
  /** Build 108: wax teeth placed on either arch (changing the bite's opening then asks first). */
  anyWax?: boolean;
  /** Build 108: wax teeth put out of view in Case objects - their buttons cannot pick them. */
  hiddenIds?: string[];
  /** Build 107: Sculpt - the tooth taken up to be moved (double-clicked), else null. */
  /** Build 112: Sculpt - the brush in hand (null: positioning the tooth). */
  sculptTool?: "position" | "scale" | "add" | "remove" | "smooth" | "move";
  /** Build 107: every tooth of the set selected (it moves as one). */
  selectedAll?: boolean;
  /** The tooth set loaded, and how many teeth it has. */
  setName: string | null;
  /** Build 79: the sets that ship with Pare 3D, and the one chosen (null = none, or one loaded from a file). */
  builtIn: Array<{ id: string; name: string; library?: string; credit?: string; preview?: string | null; arch?: "upper" | "lower"; form?: WaxSetForm }>;
  builtInCredit: string | null;
  setId: string | null;
  teeth: number;
  /** Landmarks marked so far (0-3), and the one being clicked now. */
  marked: number;
  picking: number | null;
  lengthen: number;
  /** The central's width over length the plan aims for (0.7-0.9). */
  centralRatio: number;
  /** Canine tips above the centrals' edges, mm; null = the patient's own step when in range. */
  arcDepth: number | null;
  /** The step the last placing used. */
  arcUsed: number | null;
  proportions: "natural" | "library";
  busy: boolean;
  placed: Array<{ id: string; fdi: number; clearance: number | null; width: number; length: number; lengthening: number; extension: number; /** Build 102: the reduction it asks of the patient's tooth, mm. */ reduce?: number }>;
  /** Build 103: Position (the whole library teeth) or adapted to the patient's teeth. */
  stage: "position" | "adapted";
  setMove: WaxSetMove;
  chain: boolean;
  /** Build 103: Wax-up Studio as Meshmixer - the teeth are parts, moved and sculpted where they are, never placed again by themselves. */
  manual: boolean;
  /** Build 103 (exocad): which way a dragged tooth moves, and whether every tooth moves with it. */
  restrict: WaxRestrict;
  moveAll: boolean;
  /** Build 103: the teeth confirmed (FDI): each in its own colour, held where it is until double-clicked. */
  confirmed: number[];
  /** Build 79: also make a model with wax on alternate teeth only (injection moulding, first injection). */
  alternate: boolean;
  selected: string | null;
  /** Build 103: the selected tooth's change from where it was placed (null: not on the patient's teeth). */
  selectedAdjust?: ToothAdjust | null;
  /** Adjusting a tooth adjusts the same tooth on the other side too. */
  mirror: boolean;
  error: string | null;
  /** Build 94: the teeth found on this arch (FDI; agreed = the network's own number), and those chosen for the wax-up. */
  found: Array<{ fdi: number; agreed: boolean }> | null;
  chosen: number[];
  /** Build 105: the teeth to mark and wax up, those marked, those the finder marked (to check), and the point being clicked. */
  markTeeth: number[];
  markedTeeth: number[];
  autoMarked: number[];
  markPick: { fdi: number; point: number } | null;
  /** Build 107: the teeth with their three anchors in, and how many arch dots this arch has (3: set). */
  anchoredTeeth?: number[];
  archDotCount?: number;
  /** Build 105: the scan being waxed drawn see-through. */
  scanSeeThrough: boolean;
  /** Build 106: each wax tooth in its own colour (else all in WAX_BLUE). */
  colourful?: boolean;
  /** Build 106: the teeth laid along the arch line, and its curve (1 = the patient's). */
  archLine?: boolean;
  archCurve?: number;
  /** Build 106: the curve through the marks themselves (true) or the smooth symmetric one. */
  archFollow?: boolean;
  /** Build 106: marks moved since the teeth were last fitted to them. */
  marksChanged?: boolean;
  /** Build 105: the wax teeth's contacts with the opposing arch and each other, as a colour map, and Adapt (exocad's static occlusion clearance). */
  contacts: { on: boolean; busy: boolean; occlusal: number; adapting: boolean; note: string | null; opposing: boolean };
  /** Build 101: the wax-up's own Undo and Redo. */
  canUndo?: boolean;
  canRedo?: boolean;
  /** The teeth shown in colour over the scan. */
  teethShown: boolean;
  /** Build 94: each library tooth fitted to the patient's own (teeth found), or the set laid out by smile design from the landmarks. */
  fit: "teeth" | "smile";
  /** Build 94: the ghost view - how solid the wax is drawn (1 solid; less shows the scan through it). */
  ghost: number;
  /** Build 94: on the patient's teeth, how far towards the smile design (0 the patient's own, 1 the design). */
  ideal: number;
  /** Widths in the smile design: natural steps (null), or the RED proportion. */
  red: number | null;
  /** Build 94: the smile checked after placing (fitted on the teeth found). */
  checks: SmileCheck[] | null;
  /** Build 94: occlusion at the opened bite - shown when both arches are in the studio. */
  occlusion: {
    ready: boolean; busy: boolean;
    raise: number; scheme: "canine" | "group"; guidance: number; bennett: number;
    result: { rest: Array<{ fdi: number; gap: number }>; openings: Array<{ fdi: number; mm: number }>; findings: Array<{ text: string; count: number; nonworking: boolean }>; carved: Array<{ fdi: number; mm: number }>; fitted?: Array<{ fdi: number; mm: number }>; missing: number; lowerPose?: number[]; raise: number; waxKey?: string } | null;
  };
};

export type WaxupActions = {
  /** Build 277: a whole-set control changed. */
  onSmile?: (controls: SetControls) => void;
  /** Build 331: the guide lines changed (null: put back where the marks have them). */
  onGuides?: (patch: Partial<GuideSet> | null) => void;
  /** Build 318: the set's teeth made to cover the patient's teeth (lib/waxCover). */
  onSmileCover?: () => void;
  /** Build 277: one tooth's own changes; and whether its partner across the midline follows. */
  onToothEdit?: (fdi: number, edit: ToothEdit) => void;
  onToothMirror?: (on: boolean) => void;
  /** Build 281: one step of one change on the selected tooth (mm or degrees), on any wax tooth. */
  onToothStep?: (key: EditKey, delta: number) => void;
  /** Build 278: start clicking the marks (at `index`, else the first missing); take back the last; clear them all. */
  onArchMarks?: (index?: number) => void;
  onArchMarkUndo?: () => void;
  onArchMarksClear?: () => void;
  /** Build 285: the nine marks looked for on the scan. */
  onArchMarksFind?: () => void;
  /** Build 279: cut this tooth's scan back flush with the wax on the wax-up model (or not). */
  onReduce?: (fdi: number, on: boolean) => void;
  /** Build 107: the whole dropped set larger or smaller, about its middle (1 = the library's own size). */
  onSetScale?: (scale: number) => void;
  /** Build 107: the set's curve opened (+) or closed (-), mm at the canines. */
  onSetCurve?: (curve: number) => void;
  /** Build 108: Open the bite - the opening at the incisors, mm. */
  onBite?: (raise: number) => void;
  /** Build 108: the Gum line step. */
  onGumMode?: (mode: import("@/lib/waxGum").GumMode) => void;
  onPalatal?: (form: import("@/lib/waxPalatal").PalatalForm) => void;
  onGumKeep?: (pair: string, keep: number) => void;
  onGumIdeal?: () => void;
  /** Build 107: Sculpt - back to sculpting after moving a tooth. */
  /** Build 112: Sculpt - pick a brush (null: back to positioning), and the full sculpt panel shown or not. */
  onSculptTool?: (tool: "position" | "scale" | "add" | "remove" | "smooth" | "move") => void;
  /** Build 117: Sculpt - the wax fitted to the opposing teeth now (at the opening set in Open bite), as Make does first. */
  onFitBite?: () => void;
  /** Build 108: Sculpt - the picked tooth moved, turned and sized (its gimbal), as a double-click on it. */
  /** Build 107: the whole set selected, so the gimbal moves and turns it as one. */
  onSelectSet?: () => void;
  /** Build 107: the set dropped on the arch again, as it first came in. */
  onDropAgain?: () => void;
  /** Build 108: back to Library for another set (its teeth then dropped in place of these). */
  onChangeSet?: () => void;
  onMarginTooth?: (fdi: number) => void;
  onMarginDone?: () => void;
  onMarginUndo?: () => void;
  onMarginClear?: (fdi: number) => void;
  onMarginCancel?: () => void;
  onSet: (files: File[]) => void;
  onBuiltIn: (id: string) => void;
  /** Build 299: a set chosen for the dentist - the best fit among these when it is known, else the first. */
  onBuiltInAuto?: (ids: string[]) => void;
  /** Build 117: the whole set, or single teeth (null: the whole set again), for an arch. */
  onSingle?: (arch: "upper" | "lower", teeth: number[] | null) => void;
  onSlot: (slot: "upper" | "lower") => void;
  onMark: () => void;
  onLengthen: (mm: number) => void;
  onCentralRatio: (ratio: number) => void;
  onArcDepth: (mm: number | null) => void;
  onProportions: (value: "natural" | "library") => void;
  onPlace: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onRemove: () => void;
  onSelect: (id: string) => void;
  onNudge: (id: string, nudge: ToothNudge, amount: number) => void;
  /** Build 102: the one-click helpers. */
  onHelper: (kind: "level" | "arc" | "mirrorTooth" | "mirrorSide" | "resetTooth" | "resetAll") => void;
  /** Build 103: the whole set moved (mm), chain or single-tooth moves, and the position confirmed (on to Adapt). */
  onSetMove: (patch: Partial<WaxSetMove>) => void;
  onChain: (on: boolean) => void;
  onRestrict: (restrict: WaxRestrict) => void;
  onMoveAll: (on: boolean) => void;
  /** Build 103 (manual): Sculpt opened on the selected tooth with this brush (Meshmixer's). */
  onSculpt: (brush: "bubbleSmooth" | "move" | "smooth" | "attract") => void;
  /** Build 103: the selected tooth confirmed (true) or taken up again (false). */
  onConfirmTooth: (id: string, on: boolean) => void;
  onConfirm: () => void;
  onStage: (stage: "position" | "adapted") => void;
  /** Build 103: a change to a tooth (exact values, steps). */
  onAdjust: (id: string, change: ToothAdjust) => void;
  onMirror: (on: boolean) => void;
  /** Build 106: the arch line - the teeth laid along it (on/off), and its curve (1 = the patient's). */
  onArchLine?: (on: boolean) => void;
  onArchCurve?: (curve: number) => void;
  onArchFollow?: (follow: boolean) => void;
  onScanSeeThrough?: (on: boolean) => void;
  /** Build 290: the tooth picked's changes copied to its partner across the midline, once. */
  onToothCopyAcross?: () => void;
  /** Build 292: whether a tooth's neighbour gives way when its contact is moved. */
  onToothGive?: (on: boolean) => void;
  onWaxContacts?: (on: boolean) => void;
  onOcclusal?: (mm: number) => void;
  onAdapt?: (what: "bite" | "contacts" | "both") => void;
  onFit: (fit: "teeth" | "smile") => void;
  onGhost: (opacity: number) => void;
  onIdeal: (share: number) => void;
  onRed: (red: number | null) => void;
};

/** One click of an adjusting button: mm, or degrees for a turn. */
export const WAX_NUDGE = 0.25;
export const WAX_TURN = 2;
/** Build 103: thicker and the whole tooth larger, a share a click (5%). */
export const WAX_SCALE_STEP = 0.05;

/** The landmark clicked at each step, in order. */
export const WAXUP_LANDMARKS = ["waxup.pickMidline", "waxup.pickCanine1", "waxup.pickCanine2"] as const;

export function waxupSummary(view: WaxupView) {
  if (view.placed.length) return t("waxup.summaryPlaced", { count: view.placed.length });
  if (view.setName) return t("waxup.summarySet", { name: view.setName });
  return t("waxup.summaryNone");
}

/** Build 94: teeth in arch order (upper right to left, lower left to right), for the chips. */
export const archOrder = (fdi: number) => { const q = Math.floor(fdi / 10), n = fdi % 10; return q === 1 || q === 4 ? -n : n; };

/** Build 101: Wax-up Studio's steps that live in this card (shown one at a time; all of them without a step). */
/** Build 103: the whole set's move - intercanine width, forward/back, midline (to the patient's left), edges longer. */
export type WaxSetMove = { width: number; depth: number; midline: number; height: number };
export type WaxupPart = "set" | "place";

/** Build 102: reductions shown from this, mm (less is within a scan's own noise). */

/**
 * Build 103: the selected tooth's exact values - each move, turn and size as a number to read and to
 * type, with fine steps either side (Shift: five times, Alt: a fifth). Moves and turns are from where
 * the tooth was placed; width and length are the tooth's own, mm.
 */
const VALUE_ROWS = [
  { key: "mesial", unit: "mm", step: 0.1 }, { key: "out", unit: "mm", step: 0.1 }, { key: "up", unit: "mm", step: 0.1 },
  { key: "turn", unit: "°", step: 1 }, { key: "tip", unit: "°", step: 1 }, { key: "torque", unit: "°", step: 1 },
  { key: "wider", unit: "mm", step: 0.1 }, { key: "longer", unit: "mm", step: 0.1 }, { key: "thicker", unit: "%", step: 2 }, { key: "size", unit: "%", step: 2 },
] as const;
function ToothValues({ tooth, adjust, disabled, onAdjust }: { tooth: { width: number; length: number }; adjust: ToothAdjust; disabled: boolean; onAdjust: (change: ToothAdjust) => void }) {
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);
  const shown = (key: (typeof VALUE_ROWS)[number]["key"]) => {
    if (key === "wider") return tooth.width;
    if (key === "longer") return tooth.length;
    if (key === "thicker") return (adjust.thicker ?? 1) * 100;
    // The whole tooth's size: the three factors' geometric mean.
    if (key === "size") return Math.cbrt((adjust.wider ?? 1) * (adjust.longer ?? 1) * (adjust.thicker ?? 1)) * 100;
    return adjust[key] ?? 0;
  };
  /** The change that takes a value from what it is to `to`. */
  const changeTo = (key: (typeof VALUE_ROWS)[number]["key"], to: number): ToothAdjust | null => {
    const now = shown(key);
    if (!Number.isFinite(to) || Math.abs(to - now) < 1e-6) return null;
    if (key === "wider" || key === "longer") return to > 0.5 ? { [key]: to / Math.max(0.5, now) } : null;
    if (key === "thicker") return to > 30 ? { thicker: to / Math.max(1, now) } : null;
    if (key === "size") { if (to <= 30) return null; const k = to / Math.max(1, now); return { wider: k, longer: k, thicker: k }; }
    return { [key]: to - now };
  };
  const commit = () => {
    if (!editing) return;
    const row = VALUE_ROWS.find((r) => r.key === editing.key)!;
    const value = Number(editing.value.replace(",", ".").replace(/[^0-9.+-]/g, ""));
    setEditing(null);
    const change = changeTo(row.key, value);
    if (change) onAdjust(change);
  };
  return (
    <div className="waxup-values" role="group">
      {VALUE_ROWS.map((row) => {
        const value = shown(row.key);
        const text = row.key === "wider" || row.key === "longer" ? value.toFixed(2) : row.unit === "%" ? value.toFixed(0) : `${value >= 0 ? "+" : ""}${value.toFixed(row.unit === "°" ? 1 : 2)}`;
        const stepBy = (sign: number, event: React.MouseEvent) => {
          const k = event.shiftKey ? 5 : event.altKey ? 0.2 : 1;
          const change = changeTo(row.key, value + sign * row.step * k);
          if (change) onAdjust(change);
        };
        return (
          <div key={row.key} className="waxup-value-row">
            <span className="waxup-value-label">{t(`toothGimbal.short.${row.key}`)}</span>
            <button type="button" disabled={disabled} aria-label={t("waxup.valueLess", { what: t(`toothGimbal.short.${row.key}`) })} onClick={(event) => stepBy(-1, event)}>−</button>
            <input
              type="text"
              inputMode="decimal"
              disabled={disabled}
              value={editing?.key === row.key ? editing.value : text}
              onFocus={(event) => { setEditing({ key: row.key, value: text }); event.currentTarget.select(); }}
              onChange={(event) => { const v = event.currentTarget.value; setEditing({ key: row.key, value: v }); }}
              onBlur={commit}
              onKeyDown={(event) => { if (event.key === "Enter") (event.currentTarget as HTMLInputElement).blur(); else if (event.key === "Escape") { setEditing(null); (event.currentTarget as HTMLInputElement).blur(); } }}
              aria-label={t(`toothGimbal.short.${row.key}`)}
            />
            <span className="waxup-value-unit">{row.unit}</span>
            <button type="button" disabled={disabled} aria-label={t("waxup.valueMore", { what: t(`toothGimbal.short.${row.key}`) })} onClick={(event) => stepBy(1, event)}>+</button>
          </div>
        );
      })}
      <p className="blend-hint">{t("waxup.valuesHint")}</p>
    </div>
  );
}

/** Build 105: the wax teeth's contacts (colour map) and Adapt, as exocad's Free-Forming Adapt and Cut all intersections. */
function WaxContacts({ view, actions, workspace, adapt }: { view: WaxupView; actions: WaxupActions; workspace: WorkplaneWorkspaceSettings; adapt: boolean }) {
  const c = view.contacts;
  const busy = view.busy || c.adapting;
  return (
    <div className="dental-substep waxup-contacts">
      <h5 className="waxup-subhead">{t("waxup.contactsTitle")}</h5>
      <label className="edge-modifier-check">
        <input type="checkbox" checked={c.on} disabled={!view.placed.length} onChange={(event) => actions.onWaxContacts?.(event.currentTarget.checked)} />
        <span>{t("waxup.contactsShow")}</span>
        {c.busy ? <LoaderCircle className="edge-modifier-spinner" size={13} aria-label={t("waxup.contactsWorking")} /> : null}
      </label>
      {c.on ? (
        <>
          <div className="waxup-contact-scale" aria-hidden="true" style={{ background: contactGradient(1, CONTACT_STOPS[0].at, 1) }} />
          <p className="blend-hint">{t("waxup.contactsHint")}</p>
        </>
      ) : null}
      {adapt ? (
        <>
          <EdgeModifierSlider label={t("waxup.occlusal")} value={c.occlusal} min={-0.2} max={0.5} step={0.05} workspace={workspace} length disabled={busy || !c.opposing} onChange={(value) => actions.onOcclusal?.(Math.max(-0.2, Math.min(0.5, Math.round(value / 0.05) * 0.05)))} />
          <div className="dental-trim-buttons">
            <button type="button" className="active" disabled={busy || !view.placed.length || !c.opposing} onClick={() => actions.onAdapt?.("both")}>
              {c.adapting ? <LoaderCircle className="edge-modifier-spinner" size={15} /> : null} {t("waxup.adaptBite")}
            </button>
            <button type="button" className="secondary" disabled={busy || view.placed.length < 2} onClick={() => actions.onAdapt?.("contacts")}>{t("waxup.adaptContacts")}</button>
          </div>
          <p className="blend-hint">{c.note ?? t(c.opposing ? "waxup.adaptBiteHint" : "waxup.adaptNoOpposing")}</p>
        </>
      ) : null}
    </div>
  );
}




export function WaxupCard({ view, actions, slots, busy, workspace, imt = false, part, toolSlot }: { view: WaxupView; actions: WaxupActions; slots: { upper: boolean; lower: boolean }; busy: boolean; workspace: WorkplaneWorkspaceSettings; imt?: boolean; part: WaxupPart; /** Build 107: where the studio docks the sculpt tools (Sculpt step). */ toolSlot?: (element: HTMLElement | null) => void }) {
  // Build 303: the card is always one of Wax-up Studio's two steps that use it - Library ("set") or Design ("place").
  const show = (which: WaxupPart) => part === which;
  const file = useRef<HTMLInputElement>(null);
  // Build 108: Library - the tooth shape shown for each arch (until chosen, the chosen set's).
  const [forms, setForms] = useState<Partial<Record<"upper" | "lower", WaxSetForm | "own">>>({});
  const working = busy || view.busy;
  /** Build 107: Wax-up Studio's Position as Meshmixer - the set dropped whole, moved, turned and sized. */
  const dropMode = part === "place" && view.manual && Boolean(actions.onSetScale) && view.placed.length > 0;
  // Build 94: the sets for the arch being waxed (and any whose arch is not known).
  const sets = view.builtIn.filter((set) => !set.arch || set.arch === view.slot);
  // Build 94: fitted to the teeth found needs teeth chosen; set out by smile design, the three landmarks.
  const fitTeeth = view.fit === "teeth" && Boolean(view.found?.length);
  // Build 105: in Wax-up Studio (a step shown) the teeth are fitted to the dentist's marks.
  const byMarks = Boolean(part);
  // Build 107: fitted to the anchor and arch dots - the old smile-design heights and arch line do not apply.
  const byDots = (view.anchoredTeeth?.length ?? 0) > 0 && (view.archDotCount ?? 0) >= 3;
  const placeable = Boolean(view.setName) && (byMarks ? view.markedTeeth.length > 0 : fitTeeth ? view.chosen.length > 0 : view.marked === 3);
  const selectedTooth = view.placed.find((tooth) => tooth.id === view.selected) ?? null;
  return (
    <div className="waxup-card">
      {slots.upper && slots.lower && part !== "set" ? (
        <div className="dental-trim-mode" role="radiogroup" aria-label={t("waxup.arch")}>
          {(["upper", "lower"] as const).map((slot) => (
            <button key={slot} type="button" role="radio" aria-checked={view.slot === slot} className={view.slot === slot ? "active" : ""} disabled={working} onClick={() => actions.onSlot(slot)}>
              {t(slot === "upper" ? "dental.upper" : "dental.lower")}
            </button>
          ))}
        </div>
      ) : null}
      {/* Build 277 (Rakesh): the tooth finder (a network the dentist loaded) is removed - the dentist marks the anchors. */}

      {/* Build 106: Select teeth - the teeth to wax up, before their marks. */}

      {/* Build 105: the teeth to wax up and the four marks on each. */}

      {show("set") ? (
      <div className="dental-substep">
        {/* Build 108: what to do here, for the arches being waxed. */}
        {part === "set" ? <p className="waxup-set-guide">{t(slots.upper && slots.lower ? "waxup.selectBoth" : view.slot === "lower" ? "waxup.selectLower" : "waxup.selectUpper")}</p> : null}
        <input
          ref={file}
          type="file"
          accept=".obj,.stl,.zip,.eoff,.xml"
          multiple
          hidden
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            if (files.length) actions.onSet(files);
          }}
        />
        {view.builtIn.length ? (() => {
          // Build 91: the sets as pictures. Build 108: a tooth shape chosen first (Square, Oval, Round), then
          // its sets; both arches waxed, the upper's and the lower's one under the other, each with its choice.
          const both = Boolean(slots.upper && slots.lower) && part === "set";
          const arches: Array<"upper" | "lower"> = both ? ["upper", "lower"] : [view.slot];
          const chosenFor = (arch: "upper" | "lower") => (both ? view.setIds?.[arch] : view.setId);
          return (
            <div className="waxup-sets">
              {arches.map((arch) => {
                const mine = both ? view.builtIn.filter((set) => !set.arch || set.arch === arch) : sets;
                const chosen = view.builtIn.find((set) => set.id === chosenFor(arch));
                const own = mine.filter((set) => set.library === "own");
                const offered = WAX_SET_FORM_ORDER.filter((form) => mine.some((set) => set.form === form));
                const shape = forms[arch] ?? chosen?.form ?? (chosen?.library === "own" ? "own" : offered[0] ?? "own");
                const shown = shape === "own" ? own : mine.filter((set) => set.form === shape);
                const label = t(arch === "upper" ? "waxup.upperTeeth" : "waxup.lowerTeeth");
                return (
                  <section key={arch} className={`waxup-set-arch${both ? " both" : ""}`} aria-label={label}>
                    {both ? (
                      <header className={`waxup-set-arch-head${chosen ? " done" : ""}`}>
                        <strong>{label}</strong>
                        <span>{chosen ? <><Check size={13} aria-hidden="true" /> {chosen.name}</> : t("waxup.setNone")}</span>
                      </header>
                    ) : null}
                    {/* Build 117: the whole set, or single teeth from it (Christian Brenes's library has both). */}
                    {actions.onSingle ? (() => {
                      const single = view.single?.[arch];
                      const all = defaultMarkTeeth(arch);
                      return (<>
                        <div className="studio-mm-choice waxup-set-mode" role="radiogroup" aria-label={`${label}: ${t("waxup.single.mode")}`}>
                          <button type="button" role="radio" aria-checked={!single} className={!single ? "active" : ""} disabled={working} onClick={() => actions.onSingle?.(arch, null)}>{t("waxup.single.sets")}</button>
                          <button type="button" role="radio" aria-checked={Boolean(single)} className={single ? "active" : ""} disabled={working} onClick={() => actions.onSingle?.(arch, single ?? [arch === "upper" ? 11 : 41])}>{t("waxup.single.teeth")}</button>
                        </div>
                        {single ? (<>
                          <div className="waxup-teeth" role="group" aria-label={t("waxup.single.pick")}>
                            {all.map((fdi) => (
                              <button key={fdi} type="button" aria-pressed={single.includes(fdi)} className={`waxup-tooth${single.includes(fdi) ? " active" : ""}`} disabled={working} onClick={() => { const next = single.includes(fdi) ? single.filter((n) => n !== fdi) : [...single, fdi]; actions.onSingle?.(arch, next.length ? next : single); }}>{fdi}</button>
                            ))}
                          </div>
                          <p className="blend-hint">{t("waxup.single.hint", { teeth: single.join(", ") })}</p>
                        </>) : null}
                      </>);
                    })() : null}
                    <span className="waxup-shape-label">{t("waxup.chooseShape")}</span>
                    <div className={`studio-mm-choice waxup-shapes${own.length ? " four" : ""}`} role="radiogroup" aria-label={`${label}: ${t("waxup.chooseShape")}`}>
                      {[...WAX_SET_FORM_ORDER, ...(own.length ? ["own" as const] : [])].map((form) => (
                        <button key={form} type="button" role="radio" aria-checked={shape === form} className={shape === form ? "active" : ""} disabled={working || (form !== "own" && !offered.includes(form))} onClick={() => setForms((now) => ({ ...now, [arch]: form }))}>
                          {form === "own" ? t("waxup.ownLibrary") : t(`waxup.form.${form}`)}
                        </button>
                      ))}
                    </div>
                    <div className="waxup-set-grid" role="radiogroup" aria-label={label}>
                      {shown.map((set) => (
                        <button key={set.id} type="button" role="radio" aria-checked={chosenFor(arch) === set.id} className={`waxup-set${chosenFor(arch) === set.id ? " active" : ""}`} disabled={working} title={set.name} draggable={false} onDragStart={(event) => event.preventDefault()} onClick={() => actions.onBuiltIn(set.id)}>
                          {set.preview ? <img src={set.preview} alt="" loading="lazy" draggable={false} /> : <span className="waxup-set-blank" aria-hidden="true" />}
                          <span>{set.name}</span>
                          {view.setRank?.[arch]?.[0] === set.id ? <em className="waxup-set-best">{t("waxup.setBest")}</em> : null}
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          );
        })() : null}
        <div className="waxup-load-own">
          <button type="button" className="dental-import" disabled={working} onClick={() => file.current?.click()}><Upload size={15} /> {t("waxup.loadSet")}</button>
          <p className="waxup-load-types">{t("waxup.loadSetTypes")}</p>
        </div>
        {slots.upper && slots.lower && part === "set" ? null : <p className="blend-hint">{view.setName ? t("waxup.setLoaded", { name: view.setName, count: view.teeth }) : t("waxup.setHint")}</p>}
      </div>
      ) : null}


      {show("place") ? (
      <div className="dental-substep">
        {dropMode ? (
          <>
            {/* Build 107: as Meshmixer - the set dropped whole; the gimbal moves and turns it, the slider sizes it. */}
            {view.smileSet ? null : (
              <div className="wax-guide">
                <strong>{t("waxup.dropTitle")}</strong>
                <span>{t("waxup.dropHint")}</span>
              </div>
            )}
            {/* Build 328 (Rakesh: "we need the position and sculpt to all be done on the same step rather than splitting
                into two steps"): a set on the arch has no Whole set / One tooth switch - the whole set's controls and
                the picked tooth's dots, sliders and brushes are in the one panel. (A set dropped whole keeps the switch.) */}
            {view.smileSet && actions.onSmile ? null : (
            <div className="studio-mm-choice two" role="radiogroup" aria-label={t("waxup.dropMove")}>
              <button type="button" role="radio" aria-checked={!view.selected || view.selectedAll === true} className={!view.selected || view.selectedAll ? "active" : ""} disabled={working} onClick={() => actions.onSelectSet?.()}>{t("waxup.dropWholeSet")}</button>
              <button type="button" role="radio" aria-checked={Boolean(view.selected) && !view.selectedAll} className={view.selected && !view.selectedAll ? "active" : ""} disabled={working} onClick={() => { const first = [...view.placed].sort((a, b) => a.fdi - b.fdi)[0]; if (first) actions.onSelect(first.id); }}>{t("waxup.dropOneTooth")}</button>
            </div>
            )}
            {view.smileSet && actions.onSmile ? (
              <SmileSetPanel set={view.smileSet} workspace={workspace} disabled={working} onChange={actions.onSmile} onCover={actions.onSmileCover} shapes={{ sets: view.builtIn.filter((entry) => entry.arch === view.slot), chosen: view.setIds?.[view.slot] ?? view.setId ?? null, best: view.setRank?.[view.slot]?.[0] ?? null, onPick: actions.onBuiltIn }} />
            ) : null}
            {view.guideSet && actions.onGuides ? <GuidePanel set={view.guideSet} workspace={workspace} onChange={actions.onGuides} /> : null}
            {(view.selected && !view.selectedAll) || (view.smileSet && actions.onSmile) ? (
              <>
                {view.smileSet && actions.onSmile ? <span className="waxup-shape-label">{t("waxup.oneToothRow")}</span> : null}
                <div className="waxup-teeth" role="group" aria-label={t("waxup.teeth")}>
                  {view.smileSet && actions.onSmile ? <button type="button" className={`waxup-tooth${!view.selected || view.selectedAll ? " active" : ""}`} disabled={working} title={t("waxup.allTeethHint")} onClick={() => actions.onSelectSet?.()}>{t("waxup.allTeeth")}</button> : null}
                  {[...view.placed].sort((a, b) => a.fdi - b.fdi).map((tooth) => (
                    <button key={tooth.id} type="button" className={`waxup-tooth${view.selected === tooth.id && !view.selectedAll ? " active" : ""}`} disabled={view.hiddenIds?.includes(tooth.id)} title={view.hiddenIds?.includes(tooth.id) ? t("waxup.toothHidden") : undefined} onClick={() => actions.onSelect(tooth.id)}>{tooth.fdi}</button>
                  ))}
                </div>
              </>
            ) : null}
            {/* Build 277 (roadmap phase 2): the front teeth as one set on the arch, from whole-set controls. */}
            {view.smileSet && actions.onSmile ? (
              <>
                {/* Build 291 (Rakesh: "the panel on the right is insanely complicated"): one line of what to do and the
                    controls for it; the numbers, the patient's teeth showing through and the rest are folded away. */}
                {/* Build 302 (Rakesh: "a single step where we can do all the movements and adjustments"): the brushes are
                    here too - on the tooth picked, beside its dots and sliders; picking a brush puts the dots away, "Shape
                    & place" (or Esc) brings them back. */}
                {toolSlot && view.toothEdit && actions.onSculptTool ? (
                  <div className="studio-mm-choice wax-sculpt-modes" role="radiogroup" aria-label={t("waxup.brush.title")}>
                    {(["position", "add", "remove", "smooth", "move"] as const).map((tool) => (
                      <button key={tool} type="button" role="radio" aria-checked={(view.sculptTool ?? "position") === tool} className={(view.sculptTool ?? "position") === tool ? "active" : ""} disabled={working || !view.selected} title={t(tool === "position" ? "waxup.brush.shapeHint" : `waxup.brush.${tool}Hint`)} onClick={() => actions.onSculptTool?.(tool)}>{t(tool === "position" ? "waxup.brush.shape" : `waxup.brush.${tool}`)}</button>
                    ))}
                  </div>
                ) : null}
                {toolSlot && view.toothEdit && view.sculptTool && view.sculptTool !== "position" && view.sculptTool !== "scale" ? (
                  <>
                    <p className="blend-hint" role="status">{t(`waxup.brush.${view.sculptTool}Hint`)}</p>
                    <div className="studio-tool-slot waxup-sculpt-slot" ref={toolSlot} />
                  </>
                ) : view.toothEdit && actions.onToothEdit ? (
                  <ToothEditPanel tooth={view.toothEdit} workspace={workspace} disabled={working} onChange={actions.onToothEdit} onStep={actions.onToothStep} onMirror={actions.onToothMirror} onCopyAcross={actions.onToothCopyAcross} onGive={actions.onToothGive} />
                ) : null}
                {/* Build 304 (Rakesh: the wax teeth adjusted to the patient's bite, then smoothed): Fit to the bite, here in
                    Design with both arches loaded - the palatal (and every surface the opposing teeth reach) trimmed back
                    to clear them at the opening set in Open bite, and the trimmed face evened out. */}
                {actions.onFitBite && view.pairForBite ? (
                  <div className="waxup-fit-bite" role="group" aria-label={t("waxup.fitBite.title")}>
                    <div className="dental-trim-buttons">
                      <button type="button" className={`secondary${view.occlusion.busy ? " studio-filling" : ""}`} disabled={working || view.occlusion.busy || !view.placed.length} aria-busy={view.occlusion.busy} title={t("waxup.fitBite.hint")} onClick={() => actions.onFitBite?.()}>{t(view.occlusion.busy ? "waxup.fitBite.working" : "waxup.fitBite.button")}</button>
                    </div>
                    {/* Both kinds of trim are told: back to the opposing teeth at the bite itself, and for the movements. */}
                    <p className="blend-hint" role="status">{view.occlusion.result && view.biteFitFresh ? ([
                      view.occlusion.result.fitted?.length ? t("waxup.fitted", { list: view.occlusion.result.fitted.map((c) => `${c.fdi} ${c.mm.toFixed(2)}`).join(", ") }) : "",
                      view.occlusion.result.carved.length ? t("waxup.carved", { list: view.occlusion.result.carved.map((c) => `${c.fdi} ${c.mm.toFixed(2)}`).join(", ") }) : "",
                    ].filter(Boolean).join(" ") || t("waxup.fitBite.clear")) : t("waxup.fitBite.at", { mm: (view.bite?.raise ?? 0).toFixed(1) })}</p>
                  </div>
                ) : null}
                {view.proudTeeth?.some((tooth) => tooth.depth > 0) && actions.onReduce ? (
                  <details className="wax-fold">
                    <summary>{t("waxup.proudFold", { count: view.proudTeeth.filter((tooth) => tooth.depth > 0).length })}</summary>
                    <div className="wax-proud">
                      <span className="blend-hint" role="status">{t("waxup.proudHint")}</span>
                      {view.proudTeeth.filter((tooth) => tooth.depth > 0).map((tooth) => (
                        <label key={tooth.fdi} className="edge-modifier-check">
                          <input type="checkbox" checked={tooth.reduce} disabled={working} onChange={(event) => actions.onReduce?.(tooth.fdi, event.currentTarget.checked)} />
                          <span>{t(tooth.reduce ? "waxup.proudReduced" : "waxup.proudTooth", { fdi: tooth.fdi, mm: tooth.depth.toFixed(1) })}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                ) : null}
                {view.picking !== null ? <p className="blend-hint" role="status">{t(WAXUP_LANDMARKS[view.picking])}</p> : null}
              </>
            ) : (<>
            {view.selected && !view.selectedAll && view.toothEdit && actions.onToothStep ? (
              <ToothEditPanel tooth={view.toothEdit} workspace={workspace} disabled={working} onStep={actions.onToothStep} />
            ) : null}
            <EdgeModifierSlider label={t("waxup.dropSize")} title={t("waxup.dropSizeHint")} value={Math.round((view.setScale ?? 1) * 100)} min={80} max={125} step={1} unit="%" workspace={workspace} disabled={working} onChange={(value) => actions.onSetScale?.(Math.max(0.8, Math.min(1.25, Math.round(value) / 100)))} />
            {actions.onSetCurve ? <EdgeModifierSlider label={t("waxup.dropCurve")} title={t("waxup.dropCurveHint")} value={view.setCurve ?? 0} min={-4} max={4} step={0.1} workspace={workspace} length disabled={working} onChange={(value) => actions.onSetCurve?.(Math.max(-4, Math.min(4, Math.round(value * 10) / 10)))} /> : null}
            <p className="blend-hint">{t("waxup.dropCurveHint")}</p>
            </>)}
            {(() => {
              const rest = (<>
                {view.smileSet && actions.onSmile ? (
                  <div className="dental-trim-buttons">
                    <button type="button" className={view.picking !== null ? "active" : "secondary"} disabled={working || view.picking !== null} title={t("waxup.smileAnchorsHint")} onClick={actions.onMark}>{t("waxup.smileAnchors")}</button>
                  </div>
                ) : null}
                <label className="edge-modifier-check">
                  <input type="checkbox" checked={view.scanSeeThrough} onChange={(event) => actions.onScanSeeThrough?.(event.currentTarget.checked)} />
                  <span>{t("waxup.seeThrough")}</span>
                </label>
                {actions.onDropAgain || actions.onChangeSet ? (
                  <div className="dental-trim-buttons">
                    {actions.onChangeSet ? <button type="button" className="secondary" disabled={working} onClick={() => actions.onChangeSet?.()}>{t("waxup.changeSet")}</button> : null}
                    {actions.onDropAgain ? <button type="button" className="secondary" disabled={working} onClick={() => actions.onDropAgain?.()}>{t("waxup.dropAgain")}</button> : null}
                  </div>
                ) : null}
              </>);
              return view.smileSet && actions.onSmile ? <details className="wax-fold"><summary>{t("waxup.moreFold")}</summary>{rest}</details> : rest;
            })()}
          </>
        ) : null}
        {show("place") && !dropMode ? (<>
        {view.found?.length && !byMarks ? (
          <div className="dental-trim-mode" role="radiogroup" aria-label={t("waxup.fit")}>
            {(["teeth", "smile"] as const).map((value) => (
              <button key={value} type="button" role="radio" aria-checked={view.fit === value} className={view.fit === value ? "active" : ""} disabled={working} onClick={() => actions.onFit(value)}>{t(value === "teeth" ? "waxup.fitTeeth" : "waxup.fitSmile")}</button>
            ))}
          </div>
        ) : null}
        <p className="blend-hint">{t(byDots ? "waxup.fitDotsHint" : byMarks ? "waxup.fitMarksHint" : fitTeeth ? "waxup.fitTeethHint" : "waxup.designHint")}</p>
        {fitTeeth && !byMarks ? (
          <>
            <EdgeModifierSlider label={t("waxup.ideal")} value={Math.round(view.ideal * 100)} min={0} max={100} step={5} unit="%" workspace={workspace} disabled={working} onChange={(value) => actions.onIdeal(Math.max(0, Math.min(1, Math.round(value) / 100)))} />
            <p className="blend-hint">{t("waxup.idealHint")}</p>
            {view.ideal > 0 ? (
              <>
                <EdgeModifierSlider label={t("waxup.centralRatio")} value={Math.round(view.centralRatio * 100)} min={70} max={90} step={1} unit="%" workspace={workspace} disabled={working} onChange={(value) => actions.onCentralRatio(Math.max(0.7, Math.min(0.9, Math.round(value) / 100)))} />
                <EdgeModifierSlider label={t("waxup.arcDepth")} value={view.arcDepth ?? 1} min={0} max={3} step={0.25} workspace={workspace} length disabled={working} onChange={(value) => actions.onArcDepth(Math.max(0, Math.min(3, Math.round(value / 0.25) * 0.25)))} />
                <div className="dental-trim-mode" role="radiogroup" aria-label={t("waxup.proportions")}>
                  <button type="button" role="radio" aria-checked={view.red === null} className={view.red === null ? "active" : ""} disabled={working} onClick={() => actions.onRed(null)}>{t("waxup.propSteps")}</button>
                  <button type="button" role="radio" aria-checked={view.red !== null} className={view.red !== null ? "active" : ""} disabled={working} onClick={() => actions.onRed(0.7)}>{t("waxup.propRed")}</button>
                </div>
                {view.red !== null ? <EdgeModifierSlider label={t("waxup.red")} value={Math.round(view.red * 100)} min={62} max={80} step={1} unit="%" workspace={workspace} disabled={working} onChange={(value) => actions.onRed(Math.max(0.62, Math.min(0.8, Math.round(value) / 100)))} /> : null}
                <p className="blend-hint">{t(view.red === null ? "waxup.propStepsHint" : "waxup.propRedHint")}</p>
              </>
            ) : null}
          </>
        ) : null}
        {(fitTeeth && !byMarks) || byDots ? null : (<>
        <EdgeModifierSlider label={t("waxup.centralRatio")} value={Math.round(view.centralRatio * 100)} min={70} max={90} step={1} unit="%" workspace={workspace} disabled={working} onChange={(value) => actions.onCentralRatio(Math.max(0.7, Math.min(0.9, Math.round(value) / 100)))} />
        <EdgeModifierSlider label={t("waxup.arcDepth")} value={view.arcDepth ?? view.arcUsed ?? 1} min={0} max={3} step={0.25} workspace={workspace} length disabled={working} onChange={(value) => actions.onArcDepth(Math.max(0, Math.min(3, Math.round(value / 0.25) * 0.25)))} />
        <p className="blend-hint">{view.arcDepth === null ? t("waxup.arcAuto") : <>{t("waxup.arcSet")}{" "}<button type="button" className="link-button" disabled={working} onClick={() => actions.onArcDepth(null)}>{t("waxup.arcBack")}</button></>}</p>
        {byMarks ? null : <div className="dental-trim-mode" role="radiogroup" aria-label={t("waxup.proportions")}>
          {(["natural", "library"] as const).map((value) => (
            <button key={value} type="button" role="radio" aria-checked={view.proportions === value} className={view.proportions === value ? "active" : ""} disabled={working} onClick={() => actions.onProportions(value)}>
              {t(value === "natural" ? "waxup.propNatural" : "waxup.propLibrary")}
            </button>
          ))}
        </div>}
        </>)}
        <EdgeModifierSlider label={t("waxup.lengthen")} value={view.lengthen} min={WAX_LENGTHEN.min} max={WAX_LENGTHEN.max} step={WAX_LENGTHEN.step} workspace={workspace} length disabled={working} onChange={(value) => actions.onLengthen(Math.max(WAX_LENGTHEN.min, Math.min(WAX_LENGTHEN.max, Math.round(value / WAX_LENGTHEN.step) * WAX_LENGTHEN.step)))} />
        <div className="dental-trim-buttons">
          <button type="button" className={placeable ? "active" : ""} disabled={working || !placeable || view.picking !== null} onClick={actions.onPlace}>
            {view.busy ? <LoaderCircle className="edge-modifier-spinner" size={15} /> : <Check size={15} />} {t(view.placed.length ? "waxup.placeAgain" : "waxup.place")}
          </button>
          {view.placed.length ? <button type="button" className="secondary" disabled={working} onClick={actions.onRemove}>{t("waxup.remove")}</button> : null}
        </div>
        {view.placed.length && part === "place" && !dropMode ? <p className="blend-hint">{t("waxup.placedLive", { count: view.placed.length })}</p> : null}
        {view.placed.length && part === "place" && !dropMode ? (
          <>
            {/* Build 106: the arch line - the teeth set along the curve through the incisal edges to the canine tips. */}
            {view.manual && actions.onArchCurve && !byDots ? (
              <>
                <h5 className="waxup-subhead">{t("waxup.archLine")}</h5>
                {/* Build 106: through the dots as they are, or a smooth curve that evens one out of line. */}
                {actions.onArchFollow ? (
                  <div className="studio-mm-choice two" role="radiogroup" aria-label={t("waxup.archLine")}>
                    <button type="button" role="radio" aria-checked={view.archFollow !== false} className={view.archFollow !== false ? "active" : ""} disabled={working} title={t("waxup.archFollowHint")} onClick={() => actions.onArchFollow?.(true)}>{t("waxup.archFollow")}</button>
                    <button type="button" role="radio" aria-checked={view.archFollow === false} className={view.archFollow === false ? "active" : ""} disabled={working} title={t("waxup.archSmoothHint")} onClick={() => actions.onArchFollow?.(false)}>{t("waxup.archSmooth")}</button>
                  </div>
                ) : null}
                <EdgeModifierSlider label={t("waxup.archCurve")} title={t("waxup.archCurveHint")} value={Math.round((view.archCurve ?? 1) * 100)} min={50} max={150} step={1} unit="%" workspace={workspace} disabled={working} onChange={(value) => actions.onArchCurve?.(Math.max(0.5, Math.min(1.5, Math.round(value) / 100)))} />
                <div className="dental-trim-buttons">
                  <button type="button" className={view.archLine ? "active" : "secondary"} disabled={working} onClick={() => actions.onArchLine?.(true)}>{t("waxup.archLineApply")}</button>
                  {Math.abs((view.archCurve ?? 1) - 1) > 1e-6 ? <button type="button" className="secondary" disabled={working} onClick={() => actions.onArchCurve?.(1)}>{t("waxup.archCurveReset")}</button> : null}
                </div>
              </>
            ) : null}
            {/* Build 103: Position - the whole library teeth, moved as a set, as a chain or one by one, then confirmed. */}
            <h5 className="waxup-subhead">{t("waxup.setMove")}</h5>
            {([["width", -4, 4], ["depth", -3, 3], ["midline", -3, 3], ["height", -2, 2]] as const).map(([key, min, max]) => (
              <EdgeModifierSlider key={key} label={t(`waxup.setMove.${key}`)} value={view.setMove[key]} min={min} max={max} step={0.1} workspace={workspace} length disabled={working} onChange={(value) => actions.onSetMove({ [key]: Math.max(min, Math.min(max, Math.round(value * 10) / 10)) })} />
            ))}
            <p className="blend-hint">{t("waxup.setMoveHint")}</p>
            <div className="waxup-teeth" role="group" aria-label={t("waxup.teeth")}>
              {[...view.placed].sort((a, b) => a.fdi - b.fdi).map((tooth) => {
                const low = tooth.clearance !== null && tooth.clearance < WAX_THIN;
                return (
                  <button
                    key={tooth.id}
                    type="button"
                    className={`waxup-tooth${view.selected === tooth.id ? " active" : ""}${low ? " warn" : ""}`}
                    title={t("waxup.toothInfo", { fdi: tooth.fdi, width: tooth.width.toFixed(1), length: tooth.length.toFixed(1), ratio: Math.round((tooth.width / Math.max(0.1, tooth.length)) * 100), wax: tooth.clearance === null ? "-" : tooth.clearance.toFixed(2) })}
                    disabled={view.hiddenIds?.includes(tooth.id)} onClick={() => actions.onSelect(tooth.id)}
                    style={view.confirmed.includes(tooth.fdi) ? { background: WAX_CONFIRMED_COLOURS[tooth.fdi] ?? "#9aa0a6", color: "#fff" } : (view.stage === "position" || view.colourful !== undefined) && WAX_TOOTH_COLOURS[tooth.fdi] ? { background: view.colourful === false ? WAX_BLUE : WAX_TOOTH_COLOURS[tooth.fdi], color: "#1d1d1f" } : undefined}
                  >
                    {low ? <AlertTriangle size={12} aria-hidden="true" /> : null}{view.confirmed.includes(tooth.fdi) ? <Check size={12} aria-hidden="true" /> : null}{tooth.fdi}
                  </button>
                );
              })}
            </div>
            <EdgeModifierSlider label={t("waxup.ghost")} value={Math.round(view.ghost * 100)} min={10} max={100} step={5} unit="%" workspace={workspace} onChange={(value) => actions.onGhost(Math.max(0.1, Math.min(1, Math.round(value) / 100)))} />
            <p className="blend-hint">{t("waxup.ghostHint")}</p>
            <label className="edge-modifier-check">
              <input type="checkbox" checked={view.scanSeeThrough} onChange={(event) => actions.onScanSeeThrough?.(event.currentTarget.checked)} />
              <span>{t("waxup.seeThrough")}</span>
            </label>
            <WaxContacts view={view} actions={actions} workspace={workspace} adapt={false} />
            <div className="dental-trim-mode" role="radiogroup" aria-label={t("waxup.moveMode")}>
              {([true, false] as const).map((chain) => (
                <button key={String(chain)} type="button" role="radio" aria-checked={view.chain === chain} className={view.chain === chain ? "active" : ""} disabled={working} onClick={() => actions.onChain(chain)}>{t(chain ? "waxup.chain" : "waxup.single")}</button>
              ))}
            </div>
            <p className="blend-hint">{t(view.chain ? "waxup.chainHint" : "waxup.singleHint")}</p>
            {/* Build 103 (exocad): the direction a dragged tooth is held to, and all teeth together. */}
            <div className="dental-trim-mode waxup-restrict" role="radiogroup" aria-label={t("waxup.restrict")}>
              {(["free", "mesial", "out", "up", "plane"] as const).map((r) => (
                <button key={r} type="button" role="radio" aria-checked={view.restrict === r} className={view.restrict === r ? "active" : ""} disabled={working} title={t(`waxup.restrict.${r}Hint`)} onClick={() => actions.onRestrict(r)}>{t(`waxup.restrict.${r}`)}</button>
              ))}
            </div>
            <label className="edge-modifier-check">
              <input type="checkbox" checked={view.moveAll} disabled={working} onChange={(event) => actions.onMoveAll(event.currentTarget.checked)} />
              <span>{t("waxup.moveAll")}</span>
            </label>
            <p className="blend-hint">{t("waxup.mouseHint")}</p>
            {selectedTooth ? (
              <div className="waxup-adjust" role="group" aria-label={t("waxup.adjustTooth", { fdi: selectedTooth.fdi })}>
                <h5>{t("waxup.adjustTooth", { fdi: selectedTooth.fdi })}</h5>
                <div className="dental-trim-buttons">
                  {view.confirmed.includes(selectedTooth.fdi)
                    ? <button type="button" className="secondary" disabled={working} onClick={() => actions.onConfirmTooth(selectedTooth.id, false)}>{t("waxup.unconfirmTooth", { fdi: selectedTooth.fdi })}</button>
                    : <button type="button" className="active" disabled={working} title={t("waxup.confirmToothHint")} onClick={() => actions.onConfirmTooth(selectedTooth.id, true)}><Check size={15} /> {t("waxup.confirmTooth", { fdi: selectedTooth.fdi })}</button>}
                </div>
                {view.selectedAdjust ? <ToothValues tooth={selectedTooth} adjust={view.selectedAdjust} disabled={working} onAdjust={(change) => actions.onAdjust(selectedTooth.id, change)} /> : null}
                {view.selectedAdjust ? null : ([["out", "waxup.in", "waxup.out", WAX_NUDGE], ["mesial", "waxup.distal", "waxup.mesial", WAX_NUDGE], ["longer", "waxup.shorter", "waxup.longer", WAX_NUDGE], ["wider", "waxup.narrower", "waxup.wider", WAX_NUDGE], ["thicker", "waxup.thinner", "waxup.thicker", WAX_SCALE_STEP], ["size", "waxup.smaller", "waxup.larger", WAX_SCALE_STEP], ["turn", "waxup.turnIn", "waxup.turnOut", WAX_TURN]] as const).map(([nudge, less, more, step]) => (
                  <div key={nudge} className="waxup-adjust-row">
                    <button type="button" disabled={working} onClick={() => actions.onNudge(selectedTooth.id, nudge, -step)}>{t(less)}</button>
                    <button type="button" disabled={working} onClick={() => actions.onNudge(selectedTooth.id, nudge, step)}>{t(more)}</button>
                  </div>
                ))}
                <label className="edge-modifier-check">
                  <input type="checkbox" checked={view.mirror} onChange={(event) => actions.onMirror(event.currentTarget.checked)} />
                  <span>{t("waxup.mirror")}</span>
                </label>
              </div>
            ) : null}
            {/* Build 102: most alignment in a click - the edges levelled or on the smile arc, a side mirrored. */}
            <div className="waxup-helpers" role="group" aria-label={t("waxup.helpers")}>
              <h5>{t("waxup.helpers")}</h5>
              <div className="dental-trim-buttons">
                {(["level", "arc"] as const).map((kind) => (
                  <button key={kind} type="button" className="secondary" disabled={working} title={t(`waxup.helper.${kind}Hint`)} onClick={() => actions.onHelper(kind)}>{t(`waxup.helper.${kind}`)}</button>
                ))}
                {(["mirrorTooth", "mirrorSide"] as const).map((kind) => (
                  <button key={kind} type="button" className="secondary" disabled={working || !selectedTooth} title={t(`waxup.helper.${kind}Hint`)} onClick={() => actions.onHelper(kind)}>{t(`waxup.helper.${kind}`)}</button>
                ))}
                {view.fit === "teeth" ? (["resetTooth", "resetAll"] as const).map((kind) => (
                  <button key={kind} type="button" className="secondary" disabled={working || (kind === "resetTooth" && !selectedTooth)} title={t(`waxup.helper.${kind}Hint`)} onClick={() => actions.onHelper(kind)}>{t(`waxup.helper.${kind}`)}</button>
                )) : null}
              </div>
            </div>
            <p className="blend-hint">{t("waxup.positionHint")}</p>
            <div className="dental-trim-buttons">
              <button type="button" className="active" disabled={working} onClick={actions.onConfirm}><Check size={15} /> {t("waxup.confirm")}</button>
            </div>
          </>
        ) : null}
        </>) : null}
      </div>
      ) : null}
      {/* Build 103: Sculpt as in Meshmixer - the tooth chosen, then its brushes. */}
      {view.error ? <div className="edge-modifier-error" role="alert">{view.error}</div> : null}
    </div>
  );
}

/**
 * Build 277 (roadmap phase 2): the whole-set controls, in the order a dentist decides them - the centrals'
 * edge, the midline, the central's width and width/length, the proportion of the laterals and canines
 * (RED), the smile arc, labial fullness; then, under More, the cant, the laterals' step and the curve.
 * Every value shown as a number; both sides change together and the teeth stay in contact.
 */
/**
 * Build 331 (Rakesh: "the markers also need to be user adjustable with the use of sliders along with a show hide
 * button"): the guide lines drawn over the teeth - shown or hidden, and each moved with its own slider.
 */
function GuidePanel({ set, workspace, onChange }: { set: NonNullable<WaxupView["guideSet"]>; workspace: WorkplaneWorkspaceSettings; onChange: (patch: Partial<GuideSet> | null) => void }) {
  const r = GUIDE_RANGES;
  const tenth = (x: number) => Math.round(x * 10) / 10;
  const arc = tenth(set.arc ?? set.arcMarked);
  const moved = set.midline !== 0 || set.incisal !== 0 || set.arc !== null || (set.labial ?? 0) !== 0 || (set.width ?? 0) !== 0 || (set.shape ?? ARCH_SHAPE) !== ARCH_SHAPE;
  const line = (key: "midline" | "incisal", label: MessageKey, hint: MessageKey) => (
    <EdgeModifierSlider label={t(label)} title={t(hint)} value={set[key]} min={r[key][0]} max={r[key][1]} step={0.1} workspace={workspace} length onChange={(value) => onChange({ [key]: tenth(value) })} />
  );
  const part = (key: GuidePart, label: MessageKey) => (
    <label className="edge-modifier-check wax-guide-part" title={t("waxup.guides.partHint")}>
      <input type="checkbox" checked={!set.hide?.[key]} onChange={(event) => onChange({ hide: { ...(set.hide ?? {}), [key]: !event.currentTarget.checked } })} />
      {key === "caliper" ? null : <i className={`wax-guide-swatch ${key}`} />}
      <span>{t(label)}</span>
    </label>
  );
  return (
    <div className="wax-guide-panel">
      <div className="wax-guide-head">
        <span className="waxup-shape-label">{t("waxup.guides.title")}</span>
        <button type="button" className="secondary" aria-pressed={set.show} title={t("waxup.guides.showHint")} onClick={() => onChange({ show: !set.show })}>{t(set.show ? "waxup.guides.hide" : "waxup.guides.show")}</button>
      </div>
      {set.show ? (<>
        {/* Build 332 (Rakesh: each line shown or hidden on its own): a tick by each line, and its sliders only while it shows. */}
        {part("midline", "waxup.guides.keyMidline")}
        {set.hide?.midline ? null : line("midline", "waxup.guides.midline", "waxup.guides.midlineHint")}
        {part("incisal", "waxup.guides.keyIncisal")}
        {set.hide?.incisal ? null : (<>
          {line("incisal", "waxup.guides.incisal", "waxup.guides.incisalHint")}
          <EdgeModifierSlider label={t("waxup.guides.arc")} title={t("waxup.guides.arcHint")} value={Math.min(r.arc[1], Math.max(r.arc[0], arc))} min={r.arc[0]} max={r.arc[1]} step={0.1} workspace={workspace} length onChange={(value) => onChange({ arc: tenth(value) })} />
          <EdgeModifierSlider label={t("waxup.guides.labial")} title={t("waxup.guides.labialHint")} value={set.labial ?? 0} min={r.labial[0]} max={r.labial[1]} step={0.1} workspace={workspace} length onChange={(value) => onChange({ labial: tenth(value) })} />
          <EdgeModifierSlider label={t("waxup.guides.width")} title={t("waxup.guides.widthHint")} value={set.width ?? 0} min={r.width[0]} max={r.width[1]} step={0.1} workspace={workspace} length onChange={(value) => onChange({ width: tenth(value) })} />
          <EdgeModifierSlider label={t("waxup.guides.shape")} title={t("waxup.guides.shapeHint")} value={set.shape ?? ARCH_SHAPE} min={r.shape[0]} max={r.shape[1]} step={0.1} workspace={workspace} onChange={(value) => onChange({ shape: tenth(value) })} />
        </>)}
        {part("caliper", "waxup.guides.keyCaliper")}
        <div className="dental-trim-buttons">
          <button type="button" className="secondary" disabled={!moved} title={t("waxup.guides.resetHint")} onClick={() => onChange(null)}>{t("waxup.guides.reset")}</button>
        </div>
        <p className="blend-hint">{t("waxup.guides.hint")}</p>
      </>) : null}
    </div>
  );
}

function SmileSetPanel({ set, workspace, disabled, onChange, onCover, shapes }: { set: NonNullable<WaxupView["smileSet"]>; workspace: WorkplaneWorkspaceSettings; disabled: boolean; onChange: (controls: SetControls) => void; onCover?: () => void; shapes?: { sets: Array<{ id: string; name: string }>; chosen: string | null; best: string | null; onPick: (id: string) => void } }) {
  const [more, setMore] = useState(false);
  const c = set.controls;
  const r = SET_RANGES;
  const tenth = (x: number) => Math.round(x * 10) / 10;
  const change = (patch: Partial<SetControls>) => onChange({ ...c, ...patch });
  const mm = (key: "length" | "midline" | "lateralStep" | "arc" | "fullness", label: MessageKey, hint: MessageKey) => (
    <EdgeModifierSlider label={t(label)} title={t(hint)} value={c[key]} min={r[key][0]} max={r[key][1]} step={0.1} workspace={workspace} length disabled={disabled} onChange={(value) => change({ [key]: tenth(value) })} />
  );
  return (
    <div className="wax-smile-set">
      <div className="wax-guide">
        <strong>{t("waxup.smileTitle")}</strong>
        <span>{t(set.marked ? "waxup.smileHintShort" : "waxup.smileHint")}</span>
      </div>
      {shapes && shapes.sets.length > 1 ? (
        // Build 299 (Rakesh: the set could not be changed without starting again): the tooth shape changed here, with the
        // teeth in view - the new set laid on the same marks, the adjustments made so far kept.
        <div className="wax-shape-switch">
          <span className="waxup-shape-label">{t("waxup.shapeSwitch")}</span>
          <div className="wax-shape-chips" role="radiogroup" aria-label={t("waxup.shapeSwitch")}>
            {shapes.sets.map((entry) => (
              <button key={entry.id} type="button" role="radio" aria-checked={shapes.chosen === entry.id} className={`wax-shape-chip${shapes.chosen === entry.id ? " active" : ""}`} disabled={disabled} title={shapes.best === entry.id ? t("waxup.setBestHint") : undefined} onClick={() => { if (shapes.chosen !== entry.id) shapes.onPick(entry.id); }}>
                {entry.name}{shapes.best === entry.id ? <em className="waxup-set-best">{t("waxup.setBest")}</em> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {set.marked ? (<>
        {/* Build 278 (step 2): the widths, midline and canine tips are the dentist's marks - only the levels and fullness here. */}
        {mm("length", "waxup.smileLength", "waxup.smileLengthHint")}
        {mm("fullness", "waxup.smileFullness", "waxup.smileFullnessHint")}
        <div className="dental-trim-buttons">
          {/* Build 318 (Rakesh: "why can't it run again"): the teeth made to cover the patient's teeth, whenever asked. */}
          {onCover ? <button type="button" className="secondary" disabled={disabled} title={t("waxup.smileCoverHint")} onClick={onCover}>{t("waxup.smileCover")}</button> : null}
          <button type="button" className="secondary" disabled={disabled} onClick={() => onChange({ ...SET_DEFAULTS })}>{t("waxup.smileReset")}</button>
        </div>
        <details className="wax-fold"><summary>{t("waxup.howFold")}</summary><p className="blend-hint" role="status">{t("waxup.smileMarked")}</p></details>
      </>) : (<>
      {mm("length", "waxup.smileLength", "waxup.smileLengthHint")}
      {mm("midline", "waxup.smileMidline", "waxup.smileMidlineHint")}
      <EdgeModifierSlider label={t("waxup.smileWidth")} title={t("waxup.smileWidthHint")} value={tenth(c.centralWidth ?? set.centralWidth)} min={r.centralWidth[0]} max={r.centralWidth[1]} step={0.1} workspace={workspace} length disabled={disabled} onChange={(value) => change({ centralWidth: tenth(value) })} />
      <label className="edge-modifier-check" title={t("waxup.smileFitHint")}>
        <input type="checkbox" checked={c.centralWidth === null} disabled={disabled} onChange={(event) => change({ centralWidth: event.currentTarget.checked ? null : tenth(set.centralWidth) })} />
        <span>{t("waxup.smileFit")}</span>
      </label>
      <EdgeModifierSlider label={t("waxup.smileRatio")} title={t("waxup.smileRatioHint")} value={Math.round(c.ratio * 100)} min={r.ratio[0] * 100} max={r.ratio[1] * 100} step={1} unit="%" workspace={workspace} disabled={disabled} onChange={(value) => change({ ratio: Math.round(value) / 100 })} />
      <p className="blend-hint" role="status">{t("waxup.smileCentralIs", { width: set.centralWidth.toFixed(1), length: set.centralLength.toFixed(1) })}</p>
      <EdgeModifierSlider label={t("waxup.smileRed")} title={t("waxup.smileRedHint")} value={Math.round(c.red * 100)} min={r.red[0] * 100} max={r.red[1] * 100} step={1} unit="%" workspace={workspace} disabled={disabled} onChange={(value) => change({ red: Math.round(value) / 100 })} />
      {set.red !== null ? <p className="blend-hint" role="status">{t("waxup.smileRedIs", { red: Math.round(set.red * 100) })}</p> : null}
      {mm("arc", "waxup.smileArc", "waxup.smileArcHint")}
      {mm("fullness", "waxup.smileFullness", "waxup.smileFullnessHint")}
      <button type="button" className="secondary" aria-expanded={more} onClick={() => setMore((open) => !open)}>{t(more ? "waxup.smileLess" : "waxup.smileMore")}</button>
      {more ? (<>
        <EdgeModifierSlider label={t("waxup.smileCant")} title={t("waxup.smileCantHint")} value={c.cant} min={r.cant[0]} max={r.cant[1]} step={0.1} unit="°" workspace={workspace} disabled={disabled} onChange={(value) => change({ cant: tenth(value) })} />
        {mm("lateralStep", "waxup.smileStep", "waxup.smileStepHint")}
        <EdgeModifierSlider label={t("waxup.smileCurve")} title={t("waxup.smileCurveHint")} value={Math.round(c.curve * 100)} min={r.curve[0] * 100} max={r.curve[1] * 100} step={1} unit="%" workspace={workspace} disabled={disabled} onChange={(value) => change({ curve: Math.round(value) / 100 })} />
      </>) : null}
      <div className="dental-trim-buttons">
        <button type="button" className="secondary" disabled={disabled} onClick={() => onChange({ ...SET_DEFAULTS })}>{t("waxup.smileReset")}</button>
      </div>
      </>)}
    </div>
  );
}

/**
 * Build 277 (Rakesh, roadmap phase 3): one tooth's own changes, each in one direction only - length from
 * the incisal edge (the neck held), mesial and distal width each on its own side (the other side and the
 * neck held), labial thickness (the palatal held) - then its position and angles on its own axes. With
 * mirroring on, its partner across the midline gets the same; widening pushes the neighbours along.
 */
/**
 * Build 281 (Rakesh: the gimbal was his biggest problem): a button that steps once when pressed and, held, keeps
 * stepping (slowly at first, then faster) until let go - the tooth moves, the view stays where it was.
 */
function StepButton({ label, disabled, onStep, children }: { label: string; disabled: boolean; onStep: () => void; children: ReactNode }) {
  const timer = useRef(0);
  const step = useRef(onStep);
  step.current = onStep;
  const stop = () => { window.clearTimeout(timer.current); timer.current = 0; };
  useEffect(() => stop, []);
  return (
    <button type="button" className="secondary" disabled={disabled} aria-label={label} title={label}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        stop();
        step.current();
        let wait = 380, count = 0;
        const again = () => { step.current(); count += 1; wait = count > 8 ? 60 : 130; timer.current = window.setTimeout(again, wait); };
        timer.current = window.setTimeout(again, wait);
      }}
      onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); step.current(); } }}
    >{children}</button>
  );
}

function ToothEditPanel({ tooth, workspace, disabled, onChange, onStep, onMirror, onCopyAcross, onGive }: { onCopyAcross?: () => void; onGive?: (on: boolean) => void; tooth: NonNullable<WaxupView["toothEdit"]>; workspace: WorkplaneWorkspaceSettings; disabled: boolean; onChange?: (fdi: number, edit: ToothEdit) => void; onStep?: (key: EditKey, delta: number) => void; onMirror?: (on: boolean) => void }) {
  const e = tooth.edit;
  const r = EDIT_RANGES;
  const tenth = (x: number) => Math.round(x * 10) / 10;
  const live = tooth.live !== false && Boolean(onChange);
  const set = (patch: Partial<ToothEdit>) => onChange?.(tooth.fdi, { ...e, ...patch });
  const [more, setMore] = useState(() => waxMoreDots());
  const step = (key: EditKey, degrees: boolean, sign: 1 | -1) => {
    const delta = (degrees ? 0.5 : 0.1) * sign;
    if (onStep) onStep(key, delta);
    else set({ [key]: degrees ? Math.round((e[key] + delta) * 2) / 2 : tenth(e[key] + delta) });
  };
  const row = (key: EditKey, label: MessageKey, hint: MessageKey, degrees = false) => (
    <div className="wax-tooth-row">
      {live ? (
        <EdgeModifierSlider label={t(label)} title={t(hint)} value={e[key] ?? 0} min={Math.min(EDIT_SLIDERS[key][0], e[key] ?? 0)} max={Math.max(EDIT_SLIDERS[key][1], e[key] ?? 0)} step={degrees ? 0.5 : 0.1} unit={degrees ? "°" : undefined} length={!degrees} workspace={workspace} disabled={disabled} onChange={(value) => ((key === "mesial" || key === "distal") && onStep ? onStep(key, tenth(value) - (e[key] ?? 0)) : set({ [key]: degrees ? Math.round(value * 2) / 2 : tenth(value) }))} />
      ) : (
        <span className="wax-tooth-readout" title={t(hint)}>{t(label)} <b>{(e[key] ?? 0) >= 0 ? "+" : ""}{degrees ? (e[key] ?? 0).toFixed(1) + "°" : (e[key] ?? 0).toFixed(1) + " mm"}</b></span>
      )}
      <div className="wax-tooth-nudge" role="group" aria-label={t(label)}>
        <StepButton label={`${t(label)}: ${t("waxup.toothLess")}`} disabled={disabled} onStep={() => step(key, degrees, -1)}>−</StepButton>
        <StepButton label={`${t(label)}: ${t("waxup.toothMore")}`} disabled={disabled} onStep={() => step(key, degrees, 1)}>+</StepButton>
      </div>
    </div>
  );
  return (
    <div className="wax-tooth-edit">
      <div className="wax-guide">
        <strong>{t("waxup.toothTitle", { fdi: tooth.fdi })}</strong>
        <span>{t(more ? "waxup.toothHintMore" : "waxup.toothHint")}</span>
      </div>
      {/* Build 313 (Rakesh: is this harder than what dentists already use): five dots unless more are asked for. */}
      {live ? (
        <label className="edge-modifier-check" title={t("waxup.toothMoreDotsHint")}>
          <input type="checkbox" checked={more} disabled={disabled} onChange={(event) => { setWaxMoreDots(event.currentTarget.checked); setMore(event.currentTarget.checked); }} />
          <span>{t("waxup.toothMoreDots")}</span>
        </label>
      ) : null}
      <p className="blend-hint wax-tooth-size" role="status">{t("waxup.toothSize", { width: (tooth.measured?.width ?? tooth.width).toFixed(1), length: (tooth.measured?.length ?? tooth.length).toFixed(1), ratio: Math.round(((tooth.measured?.width ?? tooth.width) / Math.max(0.1, tooth.measured?.length ?? tooth.length)) * 100) })}</p>
      {/* Build 290 (Rakesh): one tooth changes alone unless asked; a tooth that is right can be copied across once. */}
      {onMirror && live ? (
        <div className="wax-tooth-across">
          <label className="edge-modifier-check" title={t("waxup.toothMirrorHint")}>
            <input type="checkbox" checked={tooth.mirror} disabled={disabled} onChange={(event) => onMirror(event.currentTarget.checked)} />
            <span>{t("waxup.toothMirror")}</span>
          </label>
          {onCopyAcross ? <button type="button" className="secondary" disabled={disabled} title={t("waxup.toothCopyAcrossHint")} onClick={onCopyAcross}>{t("waxup.toothCopyAcross")}</button> : null}
        </div>
      ) : null}
      {onGive && live ? (
        <label className="edge-modifier-check" title={t("waxup.toothGiveHint")}>
          <input type="checkbox" checked={tooth.give === true} disabled={disabled} onChange={(event) => onGive(event.currentTarget.checked)} />
          <span>{t("waxup.toothGive")}</span>
        </label>
      ) : null}
      {/* Build 294 (Rakesh: an easy way to tip and torque, from any view): the three turns always to hand. */}
      <h4>{t("waxup.toothTurns")}</h4>
      {row("rotate", "waxup.toothRotate", "waxup.toothRotateHint", true)}
      {row("tip", "waxup.toothTip", "waxup.toothTipHint", true)}
      {row("torque", "waxup.toothTorque", "waxup.toothTorqueHint", true)}
      {(() => {
        const numbers = (<>
      <h4>{t("waxup.toothPlace")}</h4>
      {row("moveMesial", "waxup.toothMoveMesial", "waxup.toothMoveMesialHint")}
      {row("moveOut", "waxup.toothMoveOut", "waxup.toothMoveOutHint")}
      {row("moveUp", "waxup.toothMoveUp", "waxup.toothMoveUpHint")}
      <h4>{t("waxup.toothShape")}</h4>
      {row("length", "waxup.toothLength", "waxup.toothLengthHint")}
      {row("mesial", "waxup.toothMesial", "waxup.toothMesialHint")}
      {row("distal", "waxup.toothDistal", "waxup.toothDistalHint")}
      {live ? row("spread", "waxup.toothSpread", "waxup.toothSpreadHint") : null}
      {row("thickness", "waxup.toothThickness", "waxup.toothThicknessHint")}
      {live ? row("palatal", "waxup.toothPalatal", "waxup.toothPalatalHint") : null}
        </>);
        // Build 291: with the tooth itself to take hold of, the numbers are there for when an exact value is wanted.
        return <details className="wax-fold"><summary>{t("waxup.numbersFold")}</summary>{numbers}</details>;
      })()}
      {live ? (
        <div className="dental-trim-buttons">
          <button type="button" className="secondary" disabled={disabled} onClick={() => onChange?.(tooth.fdi, { ...NO_EDIT })}>{t("waxup.toothReset")}</button>
        </div>
      ) : null}
    </div>
  );
}
