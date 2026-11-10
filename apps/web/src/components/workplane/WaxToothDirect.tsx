"use client";

/**
 * Build 284 (Rakesh: "we need direct control of the teeth" - the gimbal, the handles and the sliders all came between
 * him and the tooth): a tooth of the set is taken hold of where it is to change, and that part follows the mouse.
 *
 * - its incisal edge (the incisal fifth): up or down = longer or shorter, the neck held on the gum line;
 * - its mesial or distal side (the outer quarters): that contact moves - the tooth beside it gives way, no other moves;
 * - its middle: the whole tooth moves, in the plane of the screen;
 * - Shift + a side: the tooth wider or narrower with the teeth behind it moving along the arch to make room;
 * - Ctrl (or ⌘) + drag: turned about its cervical third, as a trackball (rotation, tip and torque from any view);
 * - Alt with any of them: a fifth as far.
 *
 * The cursor and a small label say what a press would do before it is made, and how far it has gone while held.
 * What a change means for the set (the neighbour giving way, the partner across the midline) is the editor's:
 * this only reports which tooth, what kind of change and how far, from where the press began.
 */
import { useEffect, useRef } from "react";
import { t } from "@/lib/i18n";
import type { ToothFrame } from "@/lib/dentalWaxup";

type V = [number, number, number];
export type DirectTooth = { id: string; fdi: number; frame: ToothFrame; width: number; length: number; triangles: () => Float32Array; locked?: boolean };
export type DirectChange =
  | { kind: "length"; mm: number }
  | { kind: "contact"; side: "mesial" | "distal"; mm: number }
  | { kind: "spread"; mm: number }
  | { kind: "move"; mesial: number; out: number; up: number }
  | { kind: "turn"; rotate: number; tip: number; torque: number };
type Zone = "length" | "mesial" | "distal" | "move";

const FINE = 0.2;
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

export function WaxToothDirect({ teeth, onSelect, onBegin, onDrag, onEnd }: {
  teeth: DirectTooth[];
  onSelect: (id: string) => void;
  /** A press took hold of a tooth: changes that follow are from how the set stands now. */
  onBegin: (id: string) => void;
  onDrag: (id: string, change: DirectChange) => void;
  onEnd: (id: string) => void;
}) {
  const live = useRef({ teeth, onSelect, onBegin, onDrag, onEnd });
  live.current = { teeth, onSelect, onBegin, onDrag, onEnd };
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
    const kindOf = (zone: Zone, event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): Kind =>
      event.ctrlKey || event.metaKey ? "turn" : event.shiftKey && zone !== "length" ? "spread" : zone === "length" ? "length" : zone === "move" ? "move" : "contact";
    const cursorOf = (kind: Kind, zone: Zone) => (kind === "turn" ? "grab" : kind === "length" ? "ns-resize" : kind === "move" ? "move" : zone === "move" ? "ew-resize" : "ew-resize");
    const nameOf = (kind: Kind, zone: Zone, fdi: number) =>
      kind === "contact" ? t(zone === "mesial" ? "waxup.direct.mesial" : "waxup.direct.distal", { fdi }) : t(`waxup.direct.${kind}`, { fdi });

    let drag: { tooth: DirectTooth; zone: Zone; kind: Kind; point: V; normal: V; start: [number, number]; pointer: number; right: V; up: V; canvas: HTMLElement; moved: boolean } | null = null;
    let hoverCanvas: HTMLElement | null = null;
    const onDown = (event: PointerEvent) => {
      const canvas = canvasOf(event);
      if (event.button !== 0 || !canvas) return;
      const hit = pick(event.clientX, event.clientY);
      if (!hit) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const zone = directZone(hit.tooth, hit.point);
      const kind = kindOf(zone, event);
      const a = planePoint(event.clientX, event.clientY, hit.point, hit.normal);
      const r = planePoint(event.clientX + 20, event.clientY, hit.point, hit.normal), u = planePoint(event.clientX, event.clientY - 20, hit.point, hit.normal);
      const unit = (p: V | null): V => { if (!a || !p) return [0, 0, 0]; const d = sub(p, a), l = Math.hypot(...d) || 1; return [d[0] / l, d[1] / l, d[2] / l]; };
      drag = { tooth: hit.tooth, zone, kind, point: hit.point, normal: hit.normal, start: [event.clientX, event.clientY], pointer: event.pointerId, right: unit(r), up: unit(u), canvas, moved: false };
      canvas.style.cursor = kind === "turn" ? "grabbing" : cursorOf(kind, zone);
      live.current.onSelect(hit.tooth.id);
      live.current.onBegin(hit.tooth.id);
      say(event.clientX, event.clientY, nameOf(kind, zone, hit.tooth.fdi));
    };
    const onMove = (event: PointerEvent) => {
      if (!drag) {
        // Hovering: the cursor and the label say what a press here would do.
        const canvas = canvasOf(event);
        if (!canvas || event.buttons) { if (hoverCanvas) { hoverCanvas.style.cursor = ""; hoverCanvas = null; } say(0, 0, null); return; }
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
      const k = event.altKey ? FINE : 1;
      const p = planePoint(event.clientX, event.clientY, drag.point, drag.normal);
      if (!p) return;
      const delta = sub(p, drag.point).map((x) => x * k) as V;
      const dx = (event.clientX - drag.start[0]) * k, dy = (drag.start[1] - event.clientY) * k;
      if (!drag.moved && Math.hypot(event.clientX - drag.start[0], event.clientY - drag.start[1]) < 3) return;
      drag.moved = true;
      let change: DirectChange | null = null;
      let text = "";
      if (drag.kind === "length") {
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
      const { tooth, canvas } = drag;
      drag = null;
      canvas.style.cursor = "";
      say(0, 0, null);
      live.current.onEnd(tooth.id);
    };
    const onMenu = (event: MouseEvent) => { if (canvasOf(event) && (drag || pick(event.clientX, event.clientY))) event.preventDefault(); };
    window.addEventListener("pointerdown", onDown, { capture: true });
    window.addEventListener("pointermove", onMove, { capture: true });
    window.addEventListener("pointerup", onUp, { capture: true });
    window.addEventListener("pointercancel", onUp, { capture: true });
    window.addEventListener("contextmenu", onMenu, { capture: true });
    return () => {
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
