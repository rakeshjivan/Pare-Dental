"use client";

/**
 * Build 278 (step 1, Mark): each mark's number beside its dot on the scan (1-7 the contacts from the
 * patient's right, 4 the midline, 8-9 the canine tips), following the view. Not a target: clicks pass through.
 */
import { useEffect, useState } from "react";

export function ArchMarkLabels({ marks }: { marks: ReadonlyArray<[number, number, number] | null> }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    let frame = 0;
    let last = "";
    const run = () => {
      // Redrawn only when the view moved (the projection of the first mark changed).
      const first = marks.find(Boolean);
      const at = first && window.layerlingProjectPoints ? Array.from(window.layerlingProjectPoints(Float32Array.from(first))).map((x) => Math.round(x)).join(",") : "";
      if (at !== last) { last = at; setTick((n) => (n + 1) % 1_000_000); }
      frame = requestAnimationFrame(run);
    };
    frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  }, [marks]);
  const project = window.layerlingProjectPoints;
  if (!project) return null;
  const placed = marks.flatMap((p, i) => (p ? [{ i, p }] : []));
  if (!placed.length) return null;
  const screen = project(Float32Array.from(placed.flatMap((m) => m.p)));
  return (
    <svg className="tooth-gimbal arch-mark-labels" aria-hidden="true">
      {placed.map((m, k) => {
        const x = screen[k * 2], y = screen[k * 2 + 1];
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        const fill = m.i === 3 ? "#2563eb" : m.i >= 7 ? "#d97706" : "#0a786c";
        return (
          <g key={m.i} transform={`translate(${(x + 14).toFixed(1)},${(y - 14).toFixed(1)})`}>
            <circle r={10} fill={fill} stroke="#ffffff" strokeWidth={2} />
            <text textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700} fill="#ffffff">{m.i + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}
