"use client";

/**
 * Build 110: Keep & erase's brush - a left press on a wax tooth paints (and a drag goes on painting) until it
 * is let go; presses that miss the wax teeth, and the right and middle buttons, are left to the view.
 */
import { useEffect, useRef } from "react";

export function WaxPaintBrush({ hit, onPaint }: {
  /** Whether a wax tooth is under the pointer (page pixels). */
  hit: (x: number, y: number) => boolean;
  onPaint: (x: number, y: number, phase: "start" | "move" | "end") => void;
}) {
  const live = useRef({ hit, onPaint });
  live.current = { hit, onPaint };
  useEffect(() => {
    const onCanvas = (event: Event) => (event.target as Element | null)?.closest?.(".workplane-plane canvas, .three-workplane-host canvas") != null;
    let pointer: number | null = null;
    let frame = 0, x = 0, y = 0;
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || !onCanvas(event) || !live.current.hit(event.clientX, event.clientY)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      pointer = event.pointerId;
      live.current.onPaint(event.clientX, event.clientY, "start");
    };
    const onMove = (event: PointerEvent) => {
      if (pointer !== event.pointerId) return;
      event.preventDefault(); event.stopImmediatePropagation();
      x = event.clientX; y = event.clientY;
      if (frame) return;
      frame = window.requestAnimationFrame(() => { frame = 0; live.current.onPaint(x, y, "move"); });
    };
    const onUp = (event: PointerEvent) => {
      if (pointer !== event.pointerId) return;
      event.preventDefault(); event.stopImmediatePropagation();
      pointer = null;
      if (frame) { window.cancelAnimationFrame(frame); frame = 0; }
      live.current.onPaint(event.clientX, event.clientY, "move");
      live.current.onPaint(event.clientX, event.clientY, "end");
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    document.body.classList.add("wax-painting");
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      document.body.classList.remove("wax-painting");
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
