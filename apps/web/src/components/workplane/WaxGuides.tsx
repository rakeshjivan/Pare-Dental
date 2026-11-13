"use client";

/**
 * Build 331 (Rakesh: guide lines in view, with a caliper readout): the Design step's guide lines (lib/waxGuides) and
 * each tooth's measure, drawn over the view and kept in place as it turns. Nothing here can be taken hold of - the
 * lines are moved with the panel's sliders - so a press goes through to the tooth under it.
 */
import { useEffect, useRef } from "react";

type V = [number, number, number];
export type GuideDrawn = { key: string; points: V[]; className: string };
export type GuideLabel = { key: string; at: V; text: string; strong?: boolean; bars?: Array<[V, V]> };

const NS = "http://www.w3.org/2000/svg";

export function WaxGuides({ lines, labels }: { lines: GuideDrawn[]; labels: GuideLabel[] }) {
  const live = useRef({ lines, labels });
  live.current = { lines, labels };
  useEffect(() => {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "wax-guides");
    svg.setAttribute("aria-hidden", "true");
    document.body.appendChild(svg);
    const paths = new Map<string, SVGPathElement>(), texts = new Map<string, SVGTextElement>();
    const pathOf = (key: string, className: string) => {
      let el = paths.get(key);
      if (!el) { el = document.createElementNS(NS, "path"); svg.appendChild(el); paths.set(key, el); }
      if (el.getAttribute("class") !== className) el.setAttribute("class", className);
      return el;
    };
    const textOf = (key: string) => {
      let el = texts.get(key);
      if (!el) { el = document.createElementNS(NS, "text"); el.setAttribute("text-anchor", "middle"); svg.appendChild(el); texts.set(key, el); }
      return el;
    };
    const setIf = (el: Element, name: string, value: string) => { if (el.getAttribute(name) !== value) el.setAttribute(name, value); };
    let frame = 0;
    const draw = () => {
      frame = window.requestAnimationFrame(draw);
      const host = document.querySelector(".three-workplane-host canvas")?.getBoundingClientRect();
      const project = window.layerlingProjectPoints;
      if (!host || !project || host.width < 10) { svg.style.display = "none"; return; }
      svg.style.display = "block";
      // The drawing lies exactly over the view (and is cut off at its edges).
      const box = `${host.left}px,${host.top}px,${host.width}px,${host.height}px`;
      if (svg.dataset.box !== box) {
        svg.dataset.box = box;
        svg.style.left = `${host.left}px`; svg.style.top = `${host.top}px`; svg.style.width = `${host.width}px`; svg.style.height = `${host.height}px`;
      }
      const { lines: nowLines, labels: nowLabels } = live.current;
      const seenPaths = new Set<string>(), seenTexts = new Set<string>();
      const d = (points: V[]) => {
        const xy = project(points.flat());
        let out = "";
        for (let i = 0; i < points.length; i += 1) {
          const x = xy[i * 2] - host.left, y = xy[i * 2 + 1] - host.top;
          if (!Number.isFinite(x) || !Number.isFinite(y)) return "";
          out += `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
        }
        return out;
      };
      for (const line of nowLines) {
        if (line.points.length < 2) continue;
        seenPaths.add(line.key);
        setIf(pathOf(line.key, line.className), "d", d(line.points));
      }
      for (const label of nowLabels) {
        (label.bars ?? []).forEach((bar, k) => {
          const key = `${label.key}|bar${k}`;
          seenPaths.add(key);
          setIf(pathOf(key, "wax-guide-caliper"), "d", d(bar));
        });
        const xy = project(label.at);
        const x = xy[0] - host.left, y = xy[1] - host.top;
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        seenTexts.add(label.key);
        const el = textOf(label.key);
        setIf(el, "class", label.strong ? "wax-guide-label strong" : "wax-guide-label");
        setIf(el, "x", x.toFixed(1)); setIf(el, "y", y.toFixed(1));
        if (el.textContent !== label.text) el.textContent = label.text;
      }
      for (const [key, el] of paths) if (!seenPaths.has(key)) { el.remove(); paths.delete(key); }
      for (const [key, el] of texts) if (!seenTexts.has(key)) { el.remove(); texts.delete(key); }
    };
    frame = window.requestAnimationFrame(draw);
    return () => { window.cancelAnimationFrame(frame); svg.remove(); };
  }, []);
  return null;
}
