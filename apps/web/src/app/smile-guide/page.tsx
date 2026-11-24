"use client";

/*
 * Smile Guide (build 128) - a self-contained preview screen, deliberately kept apart from the main editor so
 * it cannot affect Model Builder. It loads a scan, lets you seed the patient's teeth with clicks (the
 * clinician-seeded labels decided on 25 Nov), reposition a tooth, and preview the reconciled result with an
 * honesty view (captured surface vs synthesised neck/socket) and an STL export. The geometry all comes from
 * the tested lib/smileGuide core; this file is only the viewer and controls.
 *
 * This is an early first-cut for review, not a finished tool: seeding is click-driven and the arch is assumed
 * to sit teeth-up (+Z). The clinician paint brush, anatomic snaps and the studio-shell integration come next.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { stlSoupOf, stlBinaryOf, soupBounds } from "@/lib/dentalMesh";
import { buildSmile, capturedShare, hasMovedTeeth, SYNTHESISED, type ToothMove, type SmileResult } from "@/lib/smileGuide";
import { SMILE_ENABLED } from "@/lib/pareFeatures";

type Seed = { id: number; point: [number, number, number] };
const TOOTH_HUES = [12, 40, 90, 150, 200, 260, 310, 340];

function colorsForScan(labels: Uint8Array, idOf: Map<number, number>): Float32Array {
  const out = new Float32Array(labels.length * 9);
  const gum = new THREE.Color("#d98b84");
  const c = new THREE.Color();
  for (let t = 0; t < labels.length; t += 1) {
    const id = labels[t];
    if (id === 0) c.copy(gum);
    else c.setHSL(TOOTH_HUES[(idOf.get(id) ?? 0) % TOOTH_HUES.length] / 360, 0.6, 0.6);
    for (let k = 0; k < 3; k += 1) { out[t * 9 + k * 3] = c.r; out[t * 9 + k * 3 + 1] = c.g; out[t * 9 + k * 3 + 2] = c.b; }
  }
  return out;
}

function colorsForResult(prov: Uint8Array): Float32Array {
  const out = new Float32Array(prov.length * 9);
  const captured = new THREE.Color("#ead9c4");
  const synth = new THREE.Color("#e9a23b");
  for (let t = 0; t < prov.length; t += 1) {
    const c = prov[t] === SYNTHESISED ? synth : captured;
    for (let k = 0; k < 3; k += 1) { out[t * 9 + k * 3] = c.r; out[t * 9 + k * 3 + 1] = c.g; out[t * 9 + k * 3 + 2] = c.b; }
  }
  return out;
}

export default function SmileGuidePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const threeRef = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls; mesh: THREE.Mesh; raycaster: THREE.Raycaster } | null>(null);

  const [scan, setScan] = useState<Float32Array | null>(null);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [moves, setMoves] = useState<Map<number, ToothMove>>(new Map());
  const [result, setResult] = useState<SmileResult | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [honesty, setHonesty] = useState(true);
  const [status, setStatus] = useState<string>("");

  // Gum baseline: teeth assumed to sit above a fraction of the Z span.
  const baseline = useMemo(() => {
    if (!scan) return 0;
    const b = soupBounds(scan);
    return b.min[2] + 0.45 * (b.max[2] - b.min[2]);
  }, [scan]);

  const idOf = useMemo(() => new Map(seeds.map((s, i) => [s.id, i])), [seeds]);

  // Per-triangle labels: a tooth face (centroid above the baseline) takes its nearest seed; everything else is gum.
  const labels = useMemo(() => {
    if (!scan) return new Uint8Array(0);
    const triangles = Math.floor(scan.length / 9);
    const out = new Uint8Array(triangles);
    if (!seeds.length) return out;
    for (let t = 0; t < triangles; t += 1) {
      const b = t * 9;
      const cz = (scan[b + 2] + scan[b + 5] + scan[b + 8]) / 3;
      if (cz < baseline) continue;
      const cx = (scan[b] + scan[b + 3] + scan[b + 6]) / 3;
      const cy = (scan[b + 1] + scan[b + 4] + scan[b + 7]) / 3;
      let best = -1, bestD = Infinity;
      for (const s of seeds) {
        const d = (cx - s.point[0]) ** 2 + (cy - s.point[1]) ** 2 + (cz - s.point[2]) ** 2;
        if (d < bestD) { bestD = d; best = s.id; }
      }
      if (best > 0) out[t] = best;
    }
    return out;
  }, [scan, seeds, baseline]);

  const loadFile = useCallback(async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const soup = stlSoupOf(buffer);
      if (!soup || soup.length < 9) { setStatus(`Could not read ${file.name} as an STL.`); return; }
      setScan(soup);
      setSeeds([]); setSelected(null); setMoves(new Map()); setResult(null); setSeeding(false);
      setStatus(`Loaded ${file.name} - ${Math.floor(soup.length / 9).toLocaleString()} triangles. Turn on "Seed teeth" and click each tooth.`);
    } catch {
      setStatus(`Could not read ${file.name}.`);
    }
  }, []);

  // Build the renderer once.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 5000);
    scene.add(new THREE.HemisphereLight("#ffffff", "#9fb4c8", 2.1));
    const key = new THREE.DirectionalLight("#ffffff", 2.6); key.position.set(-3, 5, 4); scene.add(key);
    const fill = new THREE.DirectionalLight("#cfe4ff", 1.1); fill.position.set(4, 2, -3); scene.add(fill);
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.02, side: THREE.DoubleSide }));
    scene.add(mesh);
    const controls = new OrbitControls(camera, canvas);
    controls.enablePan = true;
    const raycaster = new THREE.Raycaster();
    threeRef.current = { renderer, scene, camera, controls, mesh, raycaster };
    let raf = 0;
    const resize = () => {
      const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    resize(); loop();
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); controls.dispose(); renderer.dispose(); threeRef.current = null; };
  }, []);

  // Display the current soup (scan with label colours, or the reconciled result with the honesty tint).
  useEffect(() => {
    const ctx = threeRef.current;
    if (!ctx) return;
    const soup = result ? result.soup : scan;
    if (!soup || soup.length < 9) { ctx.mesh.visible = false; return; }
    ctx.mesh.visible = true;
    const colors = result
      ? (honesty ? colorsForResult(result.provenance) : new Float32Array(result.soup.length).fill(0.86))
      : colorsForScan(labels, idOf);
    const geo = ctx.mesh.geometry;
    geo.setAttribute("position", new THREE.Float32BufferAttribute(soup.slice(), 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals(); geo.computeBoundingSphere(); geo.computeBoundingBox();
    (ctx.mesh.material as THREE.MeshStandardMaterial).vertexColors = true;
  }, [scan, labels, idOf, result, honesty]);

  // Frame the camera when a new scan loads.
  useEffect(() => {
    const ctx = threeRef.current;
    if (!ctx || !scan) return;
    const b = soupBounds(scan);
    const center = new THREE.Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
    const radius = Math.max(1, Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2);
    ctx.camera.position.set(center.x, center.y - radius * 2.2, center.z + radius * 1.6);
    ctx.camera.near = radius / 100; ctx.camera.far = radius * 40; ctx.camera.updateProjectionMatrix();
    ctx.controls.target.copy(center); ctx.controls.update();
  }, [scan]);

  // Seeding disables orbit so a click plants a seed instead of rotating.
  useEffect(() => { const ctx = threeRef.current; if (ctx) ctx.controls.enabled = !seeding; }, [seeding]);

  const onCanvasClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const ctx = threeRef.current;
    if (!ctx || !seeding || !scan || result) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    ctx.raycaster.setFromCamera(ndc, ctx.camera);
    const hit = ctx.raycaster.intersectObject(ctx.mesh, false)[0];
    if (!hit) return;
    const p: [number, number, number] = [hit.point.x, hit.point.y, hit.point.z];
    setSeeds((prev) => {
      const id = prev.length + 1;
      setSelected(id);
      return [...prev, { id, point: p }];
    });
  }, [seeding, scan, result]);

  const updateMove = useCallback((id: number, patch: Partial<ToothMove>) => {
    setMoves((prev) => {
      const next = new Map(prev);
      const cur = next.get(id) ?? {};
      next.set(id, { ...cur, ...patch });
      return next;
    });
  }, []);

  const run = useCallback(() => {
    if (!scan || !seeds.length) { setStatus("Load a scan and seed at least one tooth first."); return; }
    const built = buildSmile(scan, labels, moves, { archUp: [0, 0, 1] });
    setResult(built);
    const share = Math.round(capturedShare(built) * 100);
    setStatus(`Built. ${share}% of the surface is the patient's own, captured; the rest is synthesised (shown amber).${hasMovedTeeth(built) ? " Teeth moved - this is an appearance goal." : ""}`);
  }, [scan, seeds, labels, moves]);

  const exportStl = useCallback(() => {
    if (!result) return;
    const buffer = stlBinaryOf(result.soup);
    const blob = new Blob([buffer], { type: "model/stl" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "smile-guide-appearance-goal.stl"; a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const sel = selected != null ? (moves.get(selected) ?? {}) : null;
  const tr = sel?.translate ?? [0, 0, 0];

  if (!SMILE_ENABLED) {
    return <main style={{ padding: 40, fontFamily: "system-ui" }}><h1>Smile Guide</h1><p>Smile Guide is a test-build feature and is not enabled in this build.</p><p><a href="/">Back to Pare Dental</a></p></main>;
  }

  return (
    <main style={{ display: "flex", height: "100dvh", fontFamily: "system-ui", color: "#1b2733" }}>
      <section style={{ flex: 1, position: "relative", background: "radial-gradient(circle at 50% 35%, #223246, #0c141d)" }}>
        <canvas ref={canvasRef} onClick={onCanvasClick} style={{ width: "100%", height: "100%", display: "block", cursor: seeding ? "crosshair" : "grab" }} />
        <div style={{ position: "absolute", left: 16, top: 16, color: "#cde", fontSize: 13, maxWidth: 360, lineHeight: 1.4 }}>
          <strong>Smile Guide</strong> &mdash; preview. {status}
        </div>
      </section>
      <aside style={{ width: 320, padding: 20, overflowY: "auto", borderLeft: "1px solid #dfe6ee", background: "#f7fafc" }}>
        <h1 style={{ fontSize: 18, margin: "0 0 4px" }}>Smile Guide</h1>
        <p style={{ fontSize: 12, color: "#5a6b7b", margin: "0 0 16px" }}>Preview &mdash; isolated from Model Builder.</p>

        <label style={{ display: "block", fontWeight: 600, fontSize: 13, marginBottom: 6 }}>1. Load a scan (STL)</label>
        <input type="file" accept=".stl" onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) loadFile(f); e.currentTarget.value = ""; }} style={{ marginBottom: 18, fontSize: 12 }} />

        <div style={{ opacity: scan ? 1 : 0.45, pointerEvents: scan ? "auto" : "none" }}>
          <label style={{ display: "block", fontWeight: 600, fontSize: 13, marginBottom: 6 }}>2. Seed the teeth</label>
          <button type="button" onClick={() => { setSeeding((s) => !s); setResult(null); }} style={btn(seeding)}>{seeding ? "Seeding on - click each tooth" : "Seed teeth"}</button>
          <div style={{ fontSize: 12, color: "#5a6b7b", margin: "8px 0 4px" }}>{seeds.length ? `${seeds.length} tooth${seeds.length > 1 ? "" : ""} seeded` : "No teeth seeded yet."}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
            {seeds.map((s) => (
              <button key={s.id} type="button" onClick={() => setSelected(s.id)} style={chip(selected === s.id)}>Tooth {s.id}</button>
            ))}
          </div>
          {seeds.length ? <button type="button" onClick={() => { setSeeds([]); setSelected(null); setMoves(new Map()); setResult(null); }} style={linkBtn}>Clear teeth</button> : null}

          {selected != null ? (
            <div style={{ marginTop: 16 }}>
              <label style={{ display: "block", fontWeight: 600, fontSize: 13, marginBottom: 6 }}>3. Move tooth {selected}</label>
              {(["x", "y", "z"] as const).map((axis, i) => (
                <div key={axis} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 54, fontSize: 12, color: "#5a6b7b" }}>{["Side", "In/out", "Up/down"][i]}</span>
                  <input type="range" min={-4} max={4} step={0.1} value={tr[i]} onChange={(e) => { const v = [...tr] as [number, number, number]; v[i] = Number(e.currentTarget.value); updateMove(selected, { translate: v }); setResult(null); }} style={{ flex: 1 }} />
                  <span style={{ width: 34, fontSize: 12, textAlign: "right" }}>{tr[i].toFixed(1)}</span>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ width: 54, fontSize: 12, color: "#5a6b7b" }}>Rotate</span>
                <input type="range" min={-30} max={30} step={1} value={sel?.rotateUpDeg ?? 0} onChange={(e) => { updateMove(selected, { rotateUpDeg: Number(e.currentTarget.value) }); setResult(null); }} style={{ flex: 1 }} />
                <span style={{ width: 34, fontSize: 12, textAlign: "right" }}>{(sel?.rotateUpDeg ?? 0).toFixed(0)}&deg;</span>
              </div>
            </div>
          ) : null}

          <label style={{ display: "block", fontWeight: 600, fontSize: 13, margin: "18px 0 6px" }}>4. Build &amp; preview</label>
          <button type="button" onClick={run} style={btn(true)}>Build the setup</button>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, margin: "10px 0" }}>
            <input type="checkbox" checked={honesty} onChange={(e) => setHonesty(e.currentTarget.checked)} />
            Honesty view (synthesised in amber)
          </label>
          {result ? <button type="button" onClick={exportStl} style={btn(false)}>Export STL (appearance goal)</button> : null}
        </div>
      </aside>
    </main>
  );
}

function btn(active: boolean): React.CSSProperties {
  return { display: "inline-flex", alignItems: "center", gap: 6, width: "100%", justifyContent: "center", padding: "9px 12px", borderRadius: 8, border: "1px solid " + (active ? "#2f6fb0" : "#c6d2de"), background: active ? "#2f6fb0" : "#fff", color: active ? "#fff" : "#1b2733", fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 6 };
}
function chip(active: boolean): React.CSSProperties {
  return { padding: "4px 10px", borderRadius: 999, border: "1px solid " + (active ? "#2f6fb0" : "#c6d2de"), background: active ? "#e4f0fb" : "#fff", color: "#1b2733", fontSize: 12, cursor: "pointer" };
}
const linkBtn: React.CSSProperties = { background: "none", border: "none", color: "#2f6fb0", fontSize: 12, cursor: "pointer", padding: 0, textDecoration: "underline" };
