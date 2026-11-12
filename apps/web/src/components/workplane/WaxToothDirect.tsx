"use client";

/**
 * Build 284 (Rakesh: "we need direct control of the teeth" - the gimbal, the handles and the sliders all came between
 * him and the tooth): a tooth of the set is taken hold of where it is to change, and that part follows the mouse.
 *
 * - its incisal edge (the incisal fifth): up or down = longer or shorter, the neck held on the gum line;
 * - its mesial or distal side (the outer quarters): that contact moves - the tooth beside it gives way, no other moves;
 * - its middle: the whole tooth moves, in the plane of the screen;
 * - Shift + a side: the tooth wider or narrower with the teeth behind it moving along the arch to make room;
 * - the mouse wheel over the tooth picked: turned about its long axis, a degree a notch (Shift: tipped; Alt: torqued).
 *   Elsewhere - and with Ctrl or ⌘, or a pinch - the wheel zooms as ever;
 * - Alt (Option) + drag: turned as a trackball (rotation, tip and torque from any view).
 *
 * Build 287 (Rakesh: turning the model had become harder): Ctrl or ⌘ with the left button is the view's (it turns the
 * model, as everywhere else in the app) - a tooth is never taken hold of with them held.
 *
 * The cursor and a small label say what a press would do before it is made, and how far it has gone while held.
 * What a change means for the set (the neighbour giving way, the partner across the midline) is the editor's:
 * this only reports which tooth, what kind of change and how far, from where the press began.
 */
import { useEffect, useRef } from "react";
import { t } from "@/lib/i18n";
import type { ToothFrame } from "@/lib/dentalWaxup";
import { TOOTH_DOTS } from "@/lib/waxToothEdit";

type V = [number, number, number];
export type DirectTooth = { id: string; fdi: number; frame: ToothFrame; width: number; length: number; triangles: () => Float32Array; locked?: boolean };
export type DirectChange =
  | { kind: "length"; mm: number }
  | { kind: "contact"; side: "mesial" | "distal"; mm: number }
  | { kind: "spread"; mm: number }
  | { kind: "move"; mesial: number; out: number; up: number }
  | { kind: "turn"; rotate: number; tip: number; torque: number }
  /** Build 290: a dot on the tooth dragged - whatever of these it stands for, all at once. */
  | { kind: "dot"; length: number; torque: number; rotate: number; contact: number; side: "mesial" | "distal" | null; palatal?: number; up?: number; tip?: number;
      /** Build 305: one side of the palatal or of the labial face moved outwards, mm. */
      bulge?: { key: "palatalM" | "palatalD" | "labialM" | "labialD" | "flareM" | "flareD"; mm: number };
      /** Build 305: the dots locked (double-clicked) - where each stands on the tooth, as shares of its width (mesial +), its thickness (labial +) and its length (incisal +): they are to stay where they are. */
      hold?: Array<[number, number, number]>;
      /** Build 312: the tooth's place is locked - the locked dots keep their place on the tooth, but the tooth is not moved to keep them where they are. */
      fixed?: boolean }
  /** Build 290: the whole set moved (no one tooth picked), mm in the scene. */
  | { kind: "moveAll"; by: [number, number, number] };
type Zone = "length" | "mesial" | "distal" | "move";
type DotKey = "edge" | "mesial" | "distal" | "middle" | "palatal" | "neck" | "palatalM" | "palatalD" | "labialM" | "labialD" | "flareM" | "flareD";
/** Where each dot stands on its tooth: shares of its width (mesial +), of its thickness (labial +, from the labial face) and of its length (incisal +, from the edge). */
const DOT_AT: Record<DotKey, [number, number, number]> = TOOTH_DOTS;
/** The dots locked on each tooth (by its id) - kept while the app is open. */
const LOCKED = new Map<string, Set<DotKey>>();
const placeLocked = (id: string) => LOCKED.get(id)?.has("middle") === true;

/** The wheel: degrees for each notch (about 100 of a wheel's own units), and how long after the last notch the turn is kept. */
const WHEEL_DEG = 1;
const WHEEL_REST = 350;
/** A press that just misses a tooth still takes it: this far round the pointer is tried, px. */
const NEAR_PX = 7;
const DEG_PER_PX = 0.2;

const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: readonly number[], b: readonly number[]): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a: readonly number[], b: readonly number[]): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** Where a ray first meets a soup of triangles (distance along it), or null. */
function hitDistance(o: V, d: V, tris: Float32Array): number | null {
  let best = Infinity;
  for (let i = 0; i + 8 < tris.length; i += 9) {
    const e1x = tris[i + 3] - tris[i], e1y = tris[i + 4] - tris[i + 1], e1z = tris[i + 5] - tris[i + 2];
    const e2x = tris[i + 6] - tris[i], e2y = tris[i + 7] - tris[i + 1], e2z = tris[i + 8] - tris[i + 2];
    const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const sx = o[0] - tris[i], sy = o[1] - tris[i + 1], sz = o[2] - tris[i + 2];
    const u = (sx * px + sy * py + sz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const dist = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (dist > 1e-6 && dist < best) best = dist;
  }
  return Number.isFinite(best) ? best : null;
}

/** Which part of a tooth a point on it is: the incisal fifth, the mesial or distal quarter, or its middle. */
export function directZone(tooth: { frame: ToothFrame; width: number; length: number }, point: readonly number[]): Zone {
  const d = sub(point, tooth.frame.origin);
  const a = dot(d, tooth.frame.mesial), h = dot(d, tooth.frame.up);
  if (h > -0.2 * tooth.length) return "length";
  if (a > 0.25 * tooth.width) return "mesial";
  if (a < -0.25 * tooth.width) return "distal";
  return "move";
}

/**
 * How far along `axis` (a unit vector) a drag of `delta` (in the plane facing the viewer, normal `n`) goes, so the
 * tooth's surface stays under the pointer: read against the axis as it lies in that plane. Null when the axis points
 * at the viewer (nothing to read).
 */
export function alongAxis(delta: readonly number[], axis: readonly number[], n: readonly number[]): number | null {
  const k = dot(axis, n);
  const flat: V = [axis[0] - n[0] * k, axis[1] - n[1] * k, axis[2] - n[2] * k];
  const l2 = dot(flat, flat);
  return l2 < 0.09 ? null : dot(delta, flat) / l2;
}

export function WaxToothDirect({ teeth, selected, onSelect, onBegin, onDrag, onEnd }: {
  teeth: DirectTooth[];
  /** The tooth picked (its shape id): the one the mouse wheel turns. */
  selected?: string | null;
  onSelect: (id: string) => void;
  /** A press took hold of a tooth: changes that follow are from how the set stands now. */
  onBegin: (id: string) => void;
  onDrag: (id: string, change: DirectChange) => void;
  onEnd: (id: string) => void;
}) {
  const live = useRef({ teeth, selected, onSelect, onBegin, onDrag, onEnd });
  live.current = { teeth, selected, onSelect, onBegin, onDrag, onEnd };
  useEffect(() => {
    const ray = (x: number, y: number) => window.layerlingScreenRay?.(x, y) ?? null;
    const canvasOf = (event: Event) => {
      const target = event.target as HTMLElement | null;
      return target && target.tagName === "CANVAS" && target.closest?.(".three-workplane-host") ? target : null;
    };
    const pick = (x: number, y: number) => {
      const r = ray(x, y);
      if (!r) return null;
      let best: { tooth: DirectTooth; dist: number } | null = null;
      for (const tooth of live.current.teeth) {
        if (tooth.locked) continue;
        // Build 294 (lag): only a tooth the ray passes near is tested triangle by triangle.
        const f = tooth.frame, reach = Math.max(tooth.width, tooth.length) * 0.75 + 2;
        const cx = f.origin[0] - f.up[0] * tooth.length * 0.5 - r.origin[0], cy = f.origin[1] - f.up[1] * tooth.length * 0.5 - r.origin[1], cz = f.origin[2] - f.up[2] * tooth.length * 0.5 - r.origin[2];
        const along = cx * r.direction[0] + cy * r.direction[1] + cz * r.direction[2];
        if (cx * cx + cy * cy + cz * cz - along * along > reach * reach) continue;
        const dist = hitDistance(r.origin, r.direction, tooth.triangles());
        if (dist !== null && (!best || dist < best.dist)) best = { tooth, dist };
      }
      if (!best) return null;
      const o = r.origin, d = r.direction;
      const point: V = [o[0] + d[0] * best.dist, o[1] + d[1] * best.dist, o[2] + d[2] * best.dist];
      return { tooth: best.tooth, point, normal: [-d[0], -d[1], -d[2]] as V };
    };
    const planePoint = (x: number, y: number, point: V, normal: V): V | null => {
      const r = ray(x, y);
      if (!r) return null;
      const den = dot(r.direction, normal);
      if (Math.abs(den) < 1e-9) return null;
      const k = dot(sub(point, r.origin), normal) / den;
      return [r.origin[0] + r.direction[0] * k, r.origin[1] + r.direction[1] * k, r.origin[2] + r.direction[2] * k];
    };
    // The label by the pointer: what a press would do, and how far it has gone.
    const label = document.createElement("div");
    label.className = "wax-direct-label";
    label.style.display = "none";
    document.body.appendChild(label);
    const say = (x: number, y: number, text: string | null) => {
      if (!text) { label.style.display = "none"; return; }
      label.textContent = text;
      label.style.display = "block";
      label.style.left = `${x + 16}px`;
      label.style.top = `${y + 18}px`;
    };
    const mm = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)} mm`;
    type Kind = DirectChange["kind"];
    // Build 290 (Rakesh: which part of a tooth did what was guesswork): a tooth taken hold of anywhere moves - the
    // whole set when no one tooth is picked. Its length, contacts and turn are the dots'. (Shift + a side still widens
    // it with the teeth behind moving along; Alt turns it.)
    const kindOf = (zone: Zone, event: { altKey: boolean; shiftKey: boolean }): Kind =>
      !live.current.selected ? "moveAll" : event.altKey ? "turn" : event.shiftKey && zone !== "length" && zone !== "move" ? "spread" : "move";
    const cursorOf = (kind: Kind, zone: Zone) => (kind === "turn" ? "grab" : kind === "move" || kind === "moveAll" ? "move" : zone === "move" ? "ew-resize" : "ew-resize");
    const nameOf = (kind: Kind, zone: Zone, fdi: number) =>
      kind === "moveAll" ? t("waxup.direct.moveAll") : kind === "dot" ? "" : kind === "contact" ? t(zone === "mesial" ? "waxup.direct.mesial" : "waxup.direct.distal", { fdi }) : t(`waxup.direct.${kind}`, { fdi });

    let drag: { tooth: DirectTooth; zone: Zone; kind: Kind; point: V; normal: V; start: [number, number]; pointer: number; right: V; up: V; canvas: HTMLElement; moved: boolean } | null = null;
    let hoverCanvas: HTMLElement | null = null;
    const onDown = (event: PointerEvent) => {
      const canvas = canvasOf(event);
      // Ctrl or ⌘ with the left button turns the view: never a tooth's.
      if (event.button !== 0 || !canvas || event.ctrlKey || event.metaKey) return;
      wheelDone();
      let hit = pick(event.clientX, event.clientY);
      // Just off a tooth: the nearest of a ring round the pointer, so a press at a tooth's very edge still takes it.
      for (let k = 0; k < 8 && !hit; k += 1) hit = pick(event.clientX + NEAR_PX * Math.cos((k * Math.PI) / 4), event.clientY + NEAR_PX * Math.sin((k * Math.PI) / 4));
      if (!hit) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const zone = directZone(hit.tooth, hit.point);
      const kind = kindOf(zone, event);
      // Build 305 (Rakesh: "lock and unlock the tooth position but the dimensions still change"): a tooth whose white
      // dot is locked is not moved or turned by its body - it is picked, no more.
      if ((kind === "move" || kind === "turn") && placeLocked(hit.tooth.id)) { live.current.onSelect(hit.tooth.id); say(event.clientX, event.clientY, t("waxup.direct.placeLocked", { fdi: hit.tooth.fdi })); return; }
      const a = planePoint(event.clientX, event.clientY, hit.point, hit.normal);
      const r = planePoint(event.clientX + 20, event.clientY, hit.point, hit.normal), u = planePoint(event.clientX, event.clientY - 20, hit.point, hit.normal);
      const unit = (p: V | null): V => { if (!a || !p) return [0, 0, 0]; const d = sub(p, a), l = Math.hypot(...d) || 1; return [d[0] / l, d[1] / l, d[2] / l]; };
      drag = { tooth: hit.tooth, zone, kind, point: hit.point, normal: hit.normal, start: [event.clientX, event.clientY], pointer: event.pointerId, right: unit(r), up: unit(u), canvas, moved: false };
      canvas.style.cursor = kind === "turn" ? "grabbing" : cursorOf(kind, zone);
      // With no one tooth picked the set moves as one, and a click (no drag) picks the tooth.
      if (kind !== "moveAll") live.current.onSelect(hit.tooth.id);
      live.current.onBegin(hit.tooth.id);
      say(event.clientX, event.clientY, nameOf(kind, zone, hit.tooth.fdi));
    };
    let hoverAt = 0;
    const onMove = (event: PointerEvent) => {
      if (!drag) {
        // Hovering: the cursor and the label say what a press here would do.
        const canvas = canvasOf(event);
        if (!canvas || event.buttons || event.ctrlKey || event.metaKey) { if (hoverCanvas) { hoverCanvas.style.cursor = ""; hoverCanvas = null; } say(0, 0, null); return; }
        // Looked up a few times a second, not on every movement of the pointer (build 294: lag).
        const now = performance.now();
        if (now - hoverAt < 60) return;
        hoverAt = now;
        const hit = pick(event.clientX, event.clientY);
        if (!hit) { if (hoverCanvas) { hoverCanvas.style.cursor = ""; hoverCanvas = null; } say(0, 0, null); return; }
        const zone = directZone(hit.tooth, hit.point), kind = kindOf(zone, event);
        canvas.style.cursor = cursorOf(kind, zone);
        hoverCanvas = canvas;
        say(event.clientX, event.clientY, nameOf(kind, zone, hit.tooth.fdi));
        return;
      }
      if (event.pointerId !== drag.pointer) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const f = drag.tooth.frame;
      const k = 1;
      const p = planePoint(event.clientX, event.clientY, drag.point, drag.normal);
      if (!p) return;
      const delta = sub(p, drag.point).map((x) => x * k) as V;
      const dx = (event.clientX - drag.start[0]) * k, dy = (drag.start[1] - event.clientY) * k;
      // (A click that wanders a few pixels is still a click: it picks the tooth.)
      if (!drag.moved && Math.hypot(event.clientX - drag.start[0], event.clientY - drag.start[1]) < (drag.kind === "moveAll" ? 6 : 3)) return;
      drag.moved = true;
      let change: DirectChange | null = null;
      let text = "";
      if (drag.kind === "moveAll") {
        change = { kind: "moveAll", by: delta };
        text = `${Math.hypot(...delta).toFixed(1)} mm`;
      } else if (drag.kind === "length") {
        const v = alongAxis(delta, f.up, drag.normal);
        if (v !== null) { change = { kind: "length", mm: v }; text = mm(v); }
      } else if (drag.kind === "contact" || drag.kind === "spread") {
        // Outward for the side taken: mesially for the mesial side, distally for the distal (and for the middle, with Shift).
        const outward = drag.zone === "mesial" ? 1 : -1;
        const v = alongAxis(delta, f.mesial, drag.normal);
        if (v !== null) {
          const by = v * outward;
          change = drag.kind === "spread" ? { kind: "spread", mm: by } : { kind: "contact", side: drag.zone === "mesial" ? "mesial" : "distal", mm: by };
          text = mm(by);
        }
      } else if (drag.kind === "move") {
        // In the plane of the screen: along the two of the tooth's directions that lie most nearly in it.
        const n = drag.normal;
        const axes = ([["mesial", f.mesial], ["out", f.out], ["up", f.up]] as const)
          .map(([key, axis]) => { const c = dot(axis, n); const flat: V = [axis[0] - n[0] * c, axis[1] - n[1] * c, axis[2] - n[2] * c]; return { key, flat, l2: dot(flat, flat) }; })
          .sort((a, b) => b.l2 - a.l2);
        const [A, B] = axes;
        const ab = dot(A.flat, B.flat), det = A.l2 * B.l2 - ab * ab;
        const move = { mesial: 0, out: 0, up: 0 };
        if (det > 1e-6) {
          const da = dot(delta, A.flat), db = dot(delta, B.flat);
          move[A.key] = (da * B.l2 - db * ab) / det;
          move[B.key] = (db * A.l2 - da * ab) / det;
        } else if (A.l2 > 1e-6) move[A.key] = dot(delta, A.flat) / A.l2;
        change = { kind: "move", ...move };
        text = `${mm(Math.hypot(move.mesial, move.out, move.up)).slice(1)}`;
      } else {
        // A trackball: across the screen turns about the screen's vertical, up and down about its horizontal -
        // read on the tooth's own axes (the same senses as its rotation, tip and torque).
        const w: V = [
          (drag.up[0] * dx - drag.right[0] * dy) * DEG_PER_PX,
          (drag.up[1] * dx - drag.right[1] * dy) * DEG_PER_PX,
          (drag.up[2] * dx - drag.right[2] * dy) * DEG_PER_PX,
        ];
        const rotate = dot(w, cross(f.mesial, f.out)), tip = dot(w, cross(f.up, f.mesial)), torque = dot(w, cross(f.up, f.out));
        change = { kind: "turn", rotate, tip, torque };
        text = `${Math.hypot(rotate, tip, torque).toFixed(1)}°`;
      }
      if (change) live.current.onDrag(drag.tooth.id, change);
      say(event.clientX, event.clientY, `${nameOf(drag.kind, drag.zone, drag.tooth.fdi)}${text ? `  ${text}` : ""}`);
    };
    const onUp = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const { tooth, canvas, kind, moved } = drag;
      drag = null;
      canvas.style.cursor = "";
      say(0, 0, null);
      live.current.onEnd(tooth.id);
      if (kind === "moveAll" && !moved) live.current.onSelect(tooth.id);
    };
    // The wheel over the tooth picked turns it: from how it stood at the first notch, kept a moment after the last.
    let wheel: { tooth: DirectTooth; rotate: number; tip: number; torque: number; timer: number } | null = null;
    function wheelDone() {
      if (!wheel) return;
      window.clearTimeout(wheel.timer);
      const id = wheel.tooth.id;
      wheel = null;
      say(0, 0, null);
      live.current.onEnd(id);
    }
    const onWheel = (event: WheelEvent) => {
      // A pinch (and Ctrl or ⌘ with the wheel) zooms, as does the wheel anywhere but on the tooth picked.
      if (drag || !canvasOf(event) || event.ctrlKey || event.metaKey) return;
      const hit = pick(event.clientX, event.clientY);
      if (!hit || hit.tooth.id !== live.current.selected || placeLocked(hit.tooth.id)) { wheelDone(); return; }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (wheel && wheel.tooth.id !== hit.tooth.id) wheelDone();
      if (!wheel) { wheel = { tooth: hit.tooth, rotate: 0, tip: 0, torque: 0, timer: 0 }; live.current.onBegin(hit.tooth.id); }
      // A notch of a wheel is about 100 units (in pixels), 3 in lines; a trackpad sends many small ones.
      const units = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaMode === 2 ? event.deltaY * 300 : (event.deltaY || event.deltaX);
      const by = -(units / 100) * WHEEL_DEG;
      const key = event.shiftKey ? "tip" : event.altKey ? "torque" : "rotate";
      wheel[key] += by;
      window.clearTimeout(wheel.timer);
      wheel.timer = window.setTimeout(wheelDone, WHEEL_REST);
      live.current.onDrag(hit.tooth.id, { kind: "turn", rotate: wheel.rotate, tip: wheel.tip, torque: wheel.torque });
      say(event.clientX, event.clientY, `${t("waxup.direct.turn", { fdi: hit.tooth.fdi })}  ${wheel[key] >= 0 ? "+" : ""}${wheel[key].toFixed(1)}°`);
    };
    // Build 290 (Rakesh: "dots placed on the tooth that appear when the tooth is clicked"): the tooth picked carries
    // four dots, there from any view - its incisal edge (length; and, moved labially or palatally, its torque), its
    // mesial and distal sides (that contact; and, moved labially or palatally, its rotation) and its middle (the
    // whole tooth, any way). Each follows the pointer in the plane of the screen.
    // Build 293: and one on its palatal surface - pulled palatally the tooth grows fuller there, its labial face held.
    // And one at its labial neck (Rakesh: the teeth first have to sit right at the buccal gingival margin, "growing from
    // the gum"): dragged up or down the tooth, the neck goes there and the incisal edge stays.
    // Build 305 (Rakesh: "we need more control points ... either side of the middle palatal point"): and four small
    // ones - the palatal surface on its mesial and its distal side, and the labial face on each side: dragged in or
    // out, that part of that face goes with it and nothing else does.
    // And (Rakesh: "double-clicking a control dot locks it from moving, so making finer adjustments is easier") a dot
    // double-clicked is locked: it cannot be dragged, and it stays where it is while the other dots are (the tooth
    // turns about it, or grows away from it). Double-clicked again it is free.
    // Build 311: and one at each incisal corner - dragged along the arch, the incisal third flares or tucks in
    // on that side, the middle and the neck staying narrow.
    const DOTS: DotKey[] = ["edge", "mesial", "distal", "middle", "palatal", "neck", "palatalM", "palatalD", "labialM", "labialD", "flareM", "flareD"];
    const lockedOf = (id: string) => LOCKED.get(id) ?? new Set<DotKey>();
    // The white dot locked: the tooth's place is locked - it is not moved, turned, tipped or torqued by the mouse (its
    // length, width and fullness still change). The other locked dots then hold nothing: nothing moves the tooth.
    const holdOf = (tooth: DirectTooth, but: DotKey) => [...lockedOf(tooth.id)].filter((key) => key !== but && key !== "middle").map((key) => DOT_AT[key]);
    let pressed = { key: "" as DotKey | "", at: 0, x: 0, y: 0 };
    const dotEls = new Map<DotKey, HTMLDivElement>();
    let thick = { id: "", t: 6 };
    const thicknessOf = (tooth: DirectTooth) => {
      if (thick.id === tooth.id) return thick.t;
      const tris = tooth.triangles(), f = tooth.frame;
      let back = 0;
      for (let i = 0; i + 2 < tris.length; i += 3) back = Math.min(back, (tris[i] - f.origin[0]) * f.out[0] + (tris[i + 1] - f.origin[1]) * f.out[1] + (tris[i + 2] - f.origin[2]) * f.out[2]);
      thick = { id: tooth.id, t: Math.min(12, Math.max(3, -back)) };
      return thick.t;
    };
    const dotAt = (tooth: DirectTooth, key: DotKey): V => {
      const f = tooth.frame, T = thicknessOf(tooth);
      const at = (m: number, o: number, u: number): V => [f.origin[0] + f.mesial[0] * m + f.out[0] * o + f.up[0] * u, f.origin[1] + f.mesial[1] * m + f.out[1] * o + f.up[1] * u, f.origin[2] + f.mesial[2] * m + f.out[2] * o + f.up[2] * u];
      const [m, o, u] = DOT_AT[key];
      return at(m * tooth.width, o * T, u * tooth.length);
    };
    let dotDrag: { key: DotKey; tooth: DirectTooth; point: V; normal: V; pointer: number } | null = null;
    const dotName = (key: DotKey, fdi: number) => t(key === "flareM" ? "waxup.direct.dotFlareM" : key === "flareD" ? "waxup.direct.dotFlareD" : key === "palatalM" ? "waxup.direct.dotPalatalM" : key === "palatalD" ? "waxup.direct.dotPalatalD" : key === "labialM" ? "waxup.direct.dotLabialM" : key === "labialD" ? "waxup.direct.dotLabialD" : key === "edge" ? "waxup.direct.dotEdge" : key === "middle" ? "waxup.direct.move" : key === "palatal" ? "waxup.direct.dotPalatal" : key === "neck" ? "waxup.direct.dotNeck" : key === "mesial" ? "waxup.direct.dotMesial" : "waxup.direct.dotDistal", { fdi });
    for (const key of DOTS) {
      const el = document.createElement("div");
      el.className = `wax-dot wax-dot-${key}`;
      el.style.display = "none";
      el.addEventListener("pointerdown", (event) => {
        const tooth = live.current.teeth.find((candidate) => candidate.id === live.current.selected);
        const r = ray(event.clientX, event.clientY);
        if (event.button !== 0 || !tooth || !r) return;
        event.preventDefault();
        event.stopPropagation();
        wheelDone();
        // A second press on the same dot, at once and in the same place: locked, or let go.
        const again = pressed.key === key && event.timeStamp - pressed.at < 400 && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) < 6;
        pressed = again ? { key: "", at: 0, x: 0, y: 0 } : { key, at: event.timeStamp, x: event.clientX, y: event.clientY };
        const locked = new Set(lockedOf(tooth.id));
        if (again) { if (locked.has(key)) locked.delete(key); else locked.add(key); LOCKED.set(tooth.id, locked); }
        if (locked.has(key)) { say(event.clientX, event.clientY, t(key === "middle" ? "waxup.direct.placeLocked" : "waxup.direct.dotLocked", { fdi: tooth.fdi })); return; }
        el.setPointerCapture(event.pointerId);
        dotDrag = { key, tooth, point: dotAt(tooth, key), normal: [-r.direction[0], -r.direction[1], -r.direction[2]], pointer: event.pointerId };
        el.classList.add("held");
        live.current.onBegin(tooth.id);
      });
      el.addEventListener("pointermove", (event) => {
        if (!dotDrag || dotDrag.key !== key || event.pointerId !== dotDrag.pointer) { if (!dotDrag) { const tooth = live.current.teeth.find((candidate) => candidate.id === live.current.selected); if (tooth) say(event.clientX, event.clientY, dotName(key, tooth.fdi)); } return; }
        event.preventDefault();
        const p = planePoint(event.clientX, event.clientY, dotDrag.point, dotDrag.normal);
        if (!p) return;
        const d = sub(p, dotDrag.point), f = dotDrag.tooth.frame, tooth = dotDrag.tooth;
        const m = dot(d, f.mesial), o = dot(d, f.out), u = dot(d, f.up);
        const degrees = (opposite: number, arm: number) => (Math.atan2(opposite, Math.max(1, arm)) * 180) / Math.PI;
        let change: DirectChange;
        let text = "";
        const hold = holdOf(tooth, key);
        if (key === "flareM" || key === "flareD") { const by = key === "flareM" ? m : -m; change = { kind: "dot", length: 0, torque: 0, rotate: 0, contact: 0, side: null, bulge: { key, mm: by } }; text = mm(by); }
        else if (key === "palatalM" || key === "palatalD" || key === "labialM" || key === "labialD") { const by = key.startsWith("palatal") ? -o : o; change = { kind: "dot", length: 0, torque: 0, rotate: 0, contact: 0, side: null, bulge: { key, mm: by } }; text = mm(by); }
        else if (key === "middle") { change = { kind: "move", mesial: m, out: o, up: u }; text = `${Math.hypot(m, o, u).toFixed(1)} mm`; }
        else if (key === "palatal") { change = { kind: "dot", length: 0, torque: 0, rotate: 0, contact: 0, side: null, palatal: -o }; text = mm(-o); }
        else if (key === "neck") { change = { kind: "dot", length: -u, torque: 0, rotate: 0, contact: 0, side: null, up: u }; text = mm(-u); }
        else if (key === "edge") {
          // The edge goes where it is dragged, the neck staying: along the tooth it is longer or shorter; towards the
          // lip or palate it is torqued; mesially or distally it is tipped (build 294, Rakesh: an easy way to tip and
          // torque). The way it is mostly dragged is the one taken - a slight wander the other ways changes nothing.
          const most = Math.max(Math.abs(u), Math.abs(o), Math.abs(m));
          const only = (x: number) => (Math.abs(x) < most * 0.4 ? 0 : x);
          const fixed = placeLocked(tooth.id);
          const torque = fixed ? 0 : degrees(only(o), 0.66 * tooth.length), tip = fixed ? 0 : degrees(only(m), 0.66 * tooth.length), longer = only(u);
          change = { kind: "dot", length: longer, torque, rotate: 0, contact: 0, side: null, tip };
          const angle = (name: string, x: number) => (Math.abs(x) >= 0.5 ? `  ${name} ${x >= 0 ? "+" : ""}${x.toFixed(0)}°` : "");
          text = `${Math.abs(longer) >= 0.05 ? mm(longer) : ""}${angle(t("waxup.direct.torque"), torque)}${angle(t("waxup.direct.tip"), tip)}`;
        } else {
          // Along the arch: that contact. Labially or palatally: that side goes there, the other staying (rotation).
          const outward = key === "mesial" ? 1 : -1;
          const rotate = placeLocked(tooth.id) ? 0 : degrees(o, tooth.width) * outward;
          change = { kind: "dot", length: 0, torque: 0, rotate, contact: m * outward, side: key };
          text = `${mm(m * outward)}${Math.abs(rotate) >= 0.5 ? `  ${rotate >= 0 ? "+" : ""}${rotate.toFixed(0)}°` : ""}`;
        }
        if (change.kind === "dot") { change.hold = hold; change.fixed = placeLocked(tooth.id); }
        live.current.onDrag(tooth.id, change);
        el.style.left = `${event.clientX}px`; el.style.top = `${event.clientY}px`;
        say(event.clientX, event.clientY, `${dotName(key, tooth.fdi)}  ${text}`);
      });
      const done = (event: PointerEvent) => {
        if (!dotDrag || dotDrag.key !== key || event.pointerId !== dotDrag.pointer) return;
        const id = dotDrag.tooth.id;
        dotDrag = null;
        el.classList.remove("held");
        say(0, 0, null);
        live.current.onEnd(id);
      };
      el.addEventListener("pointerup", done);
      el.addEventListener("pointercancel", done);
      el.addEventListener("pointerleave", () => { if (!dotDrag) say(0, 0, null); });
      document.body.appendChild(el);
      dotEls.set(key, el);
    }
    // The dots kept on the tooth as the view turns and the tooth changes.
    let frame = 0;
    const place = () => {
      frame = window.requestAnimationFrame(place);
      const tooth = live.current.teeth.find((candidate) => candidate.id === live.current.selected);
      const host = document.querySelector(".three-workplane-host canvas")?.getBoundingClientRect();
      const project = window.layerlingProjectPoints;
      // While the tooth itself is dragged the dots are put away (they come back on the tooth where it is left).
      if (!tooth || !host || !project || drag) { for (const el of dotEls.values()) el.style.display = "none"; return; }
      const xy = project(DOTS.flatMap((key) => dotAt(tooth, key)));
      // Build 305 (Rakesh: are ten dots too much for the user): only the dots of the face turned to the view are
      // shown - from the lip the labial ones, from the palate the palatal ones - so a tooth carries seven at most.
      const mid = project(dotAt(tooth, "middle"));
      const look = ray(mid[0], mid[1])?.direction;
      const facing = look ? dot(look, tooth.frame.out) : 0;
      const hiddenFace = (key: DotKey) => (key === "palatal" || key === "palatalM" || key === "palatalD" ? facing < -0.25 : key === "labialM" || key === "labialD" || key === "neck" ? facing > 0.25 : false);
      DOTS.forEach((key, k) => {
        const el = dotEls.get(key)!;
        if (dotDrag?.key === key) return;
        const x = xy[k * 2], y = xy[k * 2 + 1];
        const inside = !hiddenFace(key) && x > host.left + 6 && x < host.right - 6 && y > host.top + 6 && y < host.bottom - 6;
        // While one dot is held the others wait where they are (the tooth is changing under them).
        el.style.display = inside && !dotDrag ? "block" : dotDrag ? el.style.display : "none";
        if (!dotDrag) { el.style.left = `${x}px`; el.style.top = `${y}px`; el.classList.toggle("locked", lockedOf(tooth.id).has(key)); }
      });
    };
    frame = window.requestAnimationFrame(place);
    const onMenu = (event: MouseEvent) => { if (canvasOf(event) && (drag || pick(event.clientX, event.clientY))) event.preventDefault(); };
    window.addEventListener("pointerdown", onDown, { capture: true });
    window.addEventListener("pointermove", onMove, { capture: true });
    window.addEventListener("pointerup", onUp, { capture: true });
    window.addEventListener("pointercancel", onUp, { capture: true });
    window.addEventListener("contextmenu", onMenu, { capture: true });
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => {
      wheelDone();
      window.cancelAnimationFrame(frame);
      for (const el of dotEls.values()) el.remove();
      window.removeEventListener("wheel", onWheel, { capture: true });
      window.removeEventListener("pointerdown", onDown, { capture: true });
      window.removeEventListener("pointermove", onMove, { capture: true });
      window.removeEventListener("pointerup", onUp, { capture: true });
      window.removeEventListener("pointercancel", onUp, { capture: true });
      window.removeEventListener("contextmenu", onMenu, { capture: true });
      if (hoverCanvas) hoverCanvas.style.cursor = "";
      label.remove();
    };
  }, []);
  return null;
}
