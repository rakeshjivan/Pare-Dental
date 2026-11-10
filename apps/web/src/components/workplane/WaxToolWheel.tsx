"use client";

/**
 * Build 112: Sculpt's tool wheel (as CEREC's): a right-click on a wax tooth opens a ring of its tools at the
 * pointer - Position & rotate, Scale, Add, Remove, Smooth, Move, and Mirror. A tool picked closes it; a click
 * anywhere else, or Esc, closes it with nothing picked.
 */
import { useEffect, useRef } from "react";
import { t } from "@/lib/i18n";

export type WheelTool = "position" | "scale" | "add" | "remove" | "smooth" | "move";
// Build 281: no Scale - sizing is in Shape & place's step buttons (the gimbal is gone).
const ITEMS: Array<WheelTool | "mirror"> = ["position", "add", "remove", "smooth", "move", "mirror"];
const RADIUS = 86;

export function WaxToolWheel({ x, y, current, onPick, onClose }: { x: number; y: number; current: WheelTool; onPick: (tool: WheelTool | "mirror") => void; onClose: () => void }) {
  const live = useRef({ onClose });
  live.current = { onClose };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); live.current.onClose(); } };
    const onDown = (event: PointerEvent) => { if (!(event.target as Element | null)?.closest?.(".wax-tool-wheel")) live.current.onClose(); };
    window.addEventListener("keydown", onKey, true);
    const timer = window.setTimeout(() => window.addEventListener("pointerdown", onDown, true), 0);
    return () => { window.clearTimeout(timer); window.removeEventListener("keydown", onKey, true); window.removeEventListener("pointerdown", onDown, true); };
  }, []);
  // Kept on the screen near the edges.
  const left = Math.max(RADIUS + 50, Math.min(window.innerWidth - RADIUS - 50, x));
  const top = Math.max(RADIUS + 30, Math.min(window.innerHeight - RADIUS - 30, y));
  return (
    <div className="sculpt-radial wax-tool-wheel" style={{ left, top }} role="menu" aria-label={t("waxup.wheel")}>
      {ITEMS.map((item, i) => {
        const a = (i / ITEMS.length) * Math.PI * 2;
        return (
          <button key={item} type="button" role="menuitem" className={item === current ? "active" : ""} style={{ left: Math.sin(a) * RADIUS, top: -Math.cos(a) * RADIUS }} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onPick(item); }}>
            {t(item === "mirror" ? "waxup.wheel.mirror" : item === "position" ? "waxup.brush.shape" : `waxup.brush.${item}`)}
          </button>
        );
      })}
    </div>
  );
}
