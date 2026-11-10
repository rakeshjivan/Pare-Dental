"use client";

/**
 * Build 277 (Rakesh, Wax-up Studio roadmap phase 3): grab handles on one wax tooth, each changing one
 * thing only, as the dentist sees it - in place of the gimbal for a tooth in the set:
 *
 * - the incisal edge (a bar along the edge): drag along the long axis = length, the cervical held;
 * - the mesial and distal sides (bars on each side): drag outwards = that side wider, the other held;
 * - the labial face (a dot on it): drag outwards = labial thickness, the palatal held.
 *
 * Each handle moves with the cursor along its own direction on the screen, 1:1 (the tooth's surface stays
 * under the pointer); Shift for coarse, Alt for fine. The numbers show while dragging. The change goes
 * through `onChange` (shown live, kept a moment after the last change).
 */
import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import type { ToothFrame } from "@/lib/dentalWaxup";
import { EDIT_RANGES, type ToothEdit } from "@/lib/waxToothEdit";

type V = [number, number, number];
const add = (a: V, b: V, k = 1): V => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
type HandleKind = "length" | "mesial" | "distal" | "thickness";
const KEY: Record<HandleKind, keyof ToothEdit> = { length: "length", mesial: "mesial", distal: "distal", thickness: "thickness" };

export function ToothHandles({ tooth, edit, disabled, onChange }: {
  tooth: { frame: ToothFrame; width: number; length: number };
  edit: ToothEdit;
  disabled?: boolean;
  onChange: (edit: ToothEdit) => void;
}) {
  const [, setTick] = useState(0);
  const [active, setActive] = useState<HandleKind | null>(null);
  const drag = useRef<{ kind: HandleKind; start: [number, number]; along: [number, number]; pxPerMm: number; base: ToothEdit } | null>(null);
  // Redrawn every frame while shown, so the handles follow the view (as the gimbal does).
  useEffect(() => {
    let frame = 0;
    const run = () => { setTick((n) => (n + 1) % 1_000_000); frame = requestAnimationFrame(run); };
    frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  }, []);
  const project = window.layerlingProjectPoints;
  if (!project) return null;
  const { frame, width, length } = tooth;
  const { origin, mesial, out, up } = frame;
  const third = add(origin, up, -length * 0.35);
  const places: Record<HandleKind, V> = {
    length: add(origin, up, 0.6),
    mesial: add(third, mesial, width / 2 + 0.6),
    distal: add(third, mesial, -(width / 2 + 0.6)),
    thickness: add(add(origin, up, -length * 0.45), out, 0.8),
  };
  const directions: Record<HandleKind, V> = { length: up, mesial, distal: [-mesial[0], -mesial[1], -mesial[2]], thickness: out };
  const kinds: HandleKind[] = ["length", "mesial", "distal", "thickness"];
  const flat = new Float32Array(kinds.length * 6);
  kinds.forEach((kind, i) => { flat.set(places[kind], i * 6); flat.set(add(places[kind], directions[kind], 1), i * 6 + 3); });
  const screen = project(flat);
  const at = (i: number): [number, number] => [screen[i * 2], screen[i * 2 + 1]];
  const view = kinds.map((kind, i) => {
    const p = at(i * 2), q = at(i * 2 + 1);
    let dx = q[0] - p[0], dy = q[1] - p[1];
    let pxPerMm = Math.hypot(dx, dy);
    // Pointing at the eye (thickness in a front view): dragged up the screen instead, at the tooth's scale.
    if (pxPerMm < 6) {
      const s = at(0), e = at(1);
      pxPerMm = Math.max(6, Math.hypot(e[0] - s[0], e[1] - s[1]));
      dx = 0; dy = -pxPerMm;
    }
    return { kind, p, along: [dx / pxPerMm, dy / pxPerMm] as [number, number], pxPerMm };
  });
  if (view.some((h) => !Number.isFinite(h.p[0]) || !Number.isFinite(h.p[1]))) return null;
  const value = (d: NonNullable<typeof drag.current>, x: number, y: number, gain: number) => {
    const mm = (((x - d.start[0]) * d.along[0] + (y - d.start[1]) * d.along[1]) / d.pxPerMm) * gain;
    const key = KEY[d.kind];
    const [lo, hi] = EDIT_RANGES[key];
    return { ...d.base, [key]: Math.min(hi, Math.max(lo, Math.round((d.base[key] + mm) * 20) / 20)) };
  };
  const label = (kind: HandleKind) => {
    const v = edit[KEY[kind]];
    return `${t(`waxup.handle.${kind}`)} ${v >= 0 ? "+" : ""}${v.toFixed(2)} mm`;
  };
  return (
    <svg className={`tooth-gimbal tooth-handles${disabled ? " disabled" : ""}`} role="group" aria-label={t("waxup.handlesLabel")}>
      {view.map((h) => {
        const nx = -h.along[1], ny = h.along[0];
        const bar = h.kind === "thickness" ? null : `M${(h.p[0] - nx * 16).toFixed(1)},${(h.p[1] - ny * 16).toFixed(1)}L${(h.p[0] + nx * 16).toFixed(1)},${(h.p[1] + ny * 16).toFixed(1)}`;
        return (
          <g key={h.kind}
            className={`tooth-gimbal-handle tooth-handle-${h.kind}${active === h.kind ? " active" : ""}`}
            onPointerDown={(event) => {
              if (disabled) return;
              event.preventDefault();
              event.stopPropagation();
              (event.currentTarget as Element).setPointerCapture(event.pointerId);
              drag.current = { kind: h.kind, start: [event.clientX, event.clientY], along: h.along, pxPerMm: h.pxPerMm, base: edit };
              setActive(h.kind);
            }}
            onPointerMove={(event) => {
              const d = drag.current;
              if (!d || d.kind !== h.kind) return;
              onChange(value(d, event.clientX, event.clientY, event.shiftKey ? 3 : event.altKey ? 0.25 : 1));
            }}
            onPointerUp={(event) => {
              const d = drag.current;
              if (!d || d.kind !== h.kind) return;
              drag.current = null;
              setActive(null);
              (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
            }}
          >
            <title>{t(`waxup.handleHint.${h.kind}`)}</title>
            {/* A wide invisible target, then the visible bar or dot. */}
            <circle cx={h.p[0]} cy={h.p[1]} r={20} fill="transparent" />
            {bar ? <path d={bar} stroke="#ffffff" strokeWidth={9} strokeLinecap="round" /> : null}
            {bar ? <path d={bar} stroke="#0a786c" strokeWidth={5} strokeLinecap="round" /> : <circle cx={h.p[0]} cy={h.p[1]} r={9} fill="#0a786c" stroke="#ffffff" strokeWidth={3} />}
            {active === h.kind ? (
              <text x={h.p[0] + nx * 26 + h.along[0] * 18} y={h.p[1] + ny * 26 + h.along[1] * 18} className="tooth-gimbal-label" fill="#ffffff" stroke="#1f2937" strokeWidth={3} paintOrder="stroke" textAnchor="middle" dominantBaseline="middle">{label(h.kind)}</text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
