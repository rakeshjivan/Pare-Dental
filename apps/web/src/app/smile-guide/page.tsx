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
import { stlSoupOf, stlBinaryOf, soupBounds, weld } from "@/lib/dentalMesh";
import { buildSmile, capturedShare, hasMovedTeeth, moveMatrix, toothFrame, isMoved, SYNTHESISED, type ToothMove, type SmileResult } from "@/lib/smileGuide";
import { SMILE_ENABLED } from "@/lib/pareFeatures";

type Seed = { id: number; tri: number; point: [number, number, number] };
const TOOTH_HUES = [12, 40, 90, 150, 200, 260, 310, 340];

/*
 * Segmentation topology. A tooth is bounded by concave creases - the gingival margin groove and the contacts
 * between teeth are valleys in the surface. We weld the scan, find each triangle's neighbours, and mark the
 * shared edges that are concave folds (a crease). Growing a region from a clicked triangle without crossing
 * those creases fills one tooth and stops at its margin - orientation-independent, no ML. The triangle order is
 * the scan's own (weld keeps it), so a ray hit's faceIndex is the triangle index straight away.
 */
type Topo = { tri: number; nbr: Int32Array; crease: Float32Array; cx: Float32Array; cy: Float32Array; cz: Float32Array };

function buildTopo(scan: ArrayLike<number>): Topo {
  const m = weld(scan, 1e-4);
  const V = m.v, F = m.f, T = Math.floor(F.length / 3);
  const cx = new Float32Array(T), cy = new Float32Array(T), cz = new Float32Array(T);
  const nx = new Float32Array(T), ny = new Float32Array(T), nz = new Float32Array(T);
  for (let t = 0; t < T; t += 1) {
    const a = F[t * 3] * 3, b = F[t * 3 + 1] * 3, c = F[t * 3 + 2] * 3;
    cx[t] = (V[a] + V[b] + V[c]) / 3; cy[t] = (V[a + 1] + V[b + 1] + V[c + 1]) / 3; cz[t] = (V[a + 2] + V[b + 2] + V[c + 2]) / 3;
    const ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2];
    const wx = V[c] - V[a], wy = V[c + 1] - V[a + 1], wz = V[c + 2] - V[a + 2];
    let px = uy * wz - uz * wy, py = uz * wx - ux * wz, pz = ux * wy - uy * wx;
    const L = Math.hypot(px, py, pz) || 1; nx[t] = px / L; ny[t] = py / L; nz[t] = pz / L;
  }
  const nbr = new Int32Array(T * 3).fill(-1);
  const crease = new Float32Array(T * 3); // per half-edge: how concave the fold is (0 = flat/convex)
  const seen = new Map<number, number>(); // edge key -> face*3+corner
  for (let t = 0; t < T; t += 1) {
    for (let i = 0; i < 3; i += 1) {
      const va = F[t * 3 + i], vb = F[t * 3 + ((i + 1) % 3)];
      const k = va < vb ? va * 4294967296 + vb : vb * 4294967296 + va;
      const prev = seen.get(k);
      if (prev === undefined) { seen.set(k, t * 3 + i); continue; }
      const pf = Math.floor(prev / 3), pc = prev % 3;
      nbr[t * 3 + i] = pf; nbr[pf * 3 + pc] = t;
      let dx = cx[pf] - cx[t], dy = cy[pf] - cy[t], dz = cz[pf] - cz[t];
      const dd = Math.hypot(dx, dy, dz) || 1; dx /= dd; dy /= dd; dz /= dd;
      // Concave fold: the neighbour sits above this face's outward plane (valley). Convex ridges are <= 0.
      const concave = nx[t] * dx + ny[t] * dy + nz[t] * dz; // ~sin of the fold, +ve concave
      const ndot = nx[t] * nx[pf] + ny[t] * ny[pf] + nz[t] * nz[pf]; // cos angle between normals
      const sharp = Math.max(0, 1 - ndot); // 0 flat .. up to 2 for a full fold
      const c = concave > 0 ? concave * sharp : 0;
      crease[t * 3 + i] = c; crease[pf * 3 + pc] = c;
    }
  }
  return { tri: T, nbr, crease, cx, cy, cz };
}

/** Grow one tooth from a seed triangle: flood across neighbours, not crossing creases past `block`, within `radius` mm. */
function floodTooth(topo: Topo, seedTri: number, seed: [number, number, number], radius: number, block: number): number[] {
  const out: number[] = []; const vis = new Uint8Array(topo.tri);
  const stack = [seedTri]; vis[seedTri] = 1; const r2 = radius * radius;
  while (stack.length) {
    const t = stack.pop()!; out.push(t);
    for (let i = 0; i < 3; i += 1) {
      if (topo.crease[t * 3 + i] > block) continue;
      const u = topo.nbr[t * 3 + i];
      if (u < 0 || vis[u]) continue;
      const dx = topo.cx[u] - seed[0], dy = topo.cy[u] - seed[1], dz = topo.cz[u] - seed[2];
      if (dx * dx + dy * dy + dz * dz > r2) continue;
      vis[u] = 1; stack.push(u);
    }
  }
  return out;
}

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

  const idOf = useMemo(() => new Map(seeds.map((s, i) => [s.id, i])), [seeds]);

  // How eagerly a region stops at a crease (higher = stops at shallower grooves) and the most a tooth can span
  // (mm) - both adjustable because real scans vary.
  const [sensitivity, setSensitivity] = useState(0.5);
  const [toothSize, setToothSize] = useState(7);

  const topo = useMemo(() => (scan ? buildTopo(scan) : null), [scan]);

  // Per-triangle FDI labels: each seed grows its own tooth from its clicked triangle, bounded by creases; the
  // first seed to reach a triangle keeps it.
  const labels = useMemo(() => {
    const T = topo?.tri ?? 0;
    const out = new Uint8Array(T);
    if (!topo || !seeds.length) return out;
    const block = 0.06 + (1 - sensitivity) * 0.5; // high sensitivity -> low block -> stops at shallow creases
    for (const s of seeds) {
      if (s.tri < 0 || s.tri >= T) continue;
      for (const t of floodTooth(topo, s.tri, s.point, toothSize, block)) if (out[t] === 0) out[t] = s.id;
    }
    return out;
  }, [topo, seeds, sensitivity, toothSize]);

  const selectedCount = useMemo(() => {
    if (selected == null) return 0;
    let n = 0; for (let i = 0; i < labels.length; i += 1) if (labels[i] === selected) n += 1; return n;
  }, [labels, selected]);

  // Live preview: each moved tooth's triangles are transformed in place as the sliders change (the gum stays
  // put), so movement shows before Build runs the full reconcile.
  const previewSoup = useMemo(() => {
    if (!scan) return null;
    let any = false; for (const mv of moves.values()) if (isMoved(mv)) { any = true; break; }
    if (!any || !labels.length) return scan;
    const byTooth = new Map<number, number[]>();
    for (let t = 0; t < labels.length; t += 1) { const id = labels[t]; if (id) { const g = byTooth.get(id); if (g) g.push(t); else byTooth.set(id, [t]); } }
    const out = scan.slice();
    for (const [id, tris] of byTooth) {
      const mv = moves.get(id); if (!mv || !isMoved(mv)) continue;
      const soupArr: number[] = [];
      for (const t of tris) for (let k = 0; k < 9; k += 1) soupArr.push(scan[t * 9 + k]);
      const frame = toothFrame(Float32Array.from(soupArr));
      const e = moveMatrix(frame, mv).elements;
      for (const t of tris) for (let c = 0; c < 3; c += 1) {
        const o = t * 9 + c * 3, x = scan[o], y = scan[o + 1], z = scan[o + 2];
        out[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
        out[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        out[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      }
    }
    return out;
  }, [scan, labels, moves]);

  const loadFile = useCallback(async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const soup = stlSoupOf(buffer);
      if (!soup || soup.length < 9) { setStatus(`Could not read ${file.name} as an STL.`); return; }
      setScan(soup);
      setSeeds([]); setSelected(null); setMoves(new Map()); setResult(null); setSeeding(true);
      setStatus(`Loaded ${file.name} - ${Math.floor(soup.length / 9).toLocaleString()} triangles. Seeding is on - click a tooth to isolate it, then move it with the sliders.`);
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
    const soup = result ? result.soup : previewSoup;
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
  }, [previewSoup, labels, idOf, result, honesty]);

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
    if (!hit || hit.faceIndex == null) return;
    const p: [number, number, number] = [hit.point.x, hit.point.y, hit.point.z];
    const tri = hit.faceIndex;
    setSeeds((prev) => {
      const id = prev.length + 1;
      setSelected(id);
      return [...prev, { id, tri, point: p }];
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
    let toothTris = 0; for (let i = 0; i < labels.length; i += 1) if (labels[i]) toothTris += 1;
    if (!toothTris) { setStatus("No teeth were segmented. With seeding on, click on a tooth; if the region stays empty, raise Detail or Tooth size."); return; }
    const built = buildSmile(scan, labels, moves, {});
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

          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed #d7e0e8" }}>
            <div style={{ fontSize: 11, color: "#7a8a99", marginBottom: 8 }}>If a region spills onto the gum or a neighbour, lower these; if it stops short, raise them.</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ width: 70, fontSize: 12, color: "#5a6b7b" }}>Detail</span>
              <input type="range" min={0} max={1} step={0.05} value={sensitivity} onChange={(e) => { setSensitivity(Number(e.currentTarget.value)); setResult(null); }} style={{ flex: 1 }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 70, fontSize: 12, color: "#5a6b7b" }}>Tooth size</span>
              <input type="range" min={3} max={12} step={0.5} value={toothSize} onChange={(e) => { setToothSize(Number(e.currentTarget.value)); setResult(null); }} style={{ flex: 1 }} />
              <span style={{ width: 40, fontSize: 12, textAlign: "right" }}>{toothSize.toFixed(1)}mm</span>
            </div>
            {selected != null ? <div style={{ fontSize: 12, color: selectedCount ? "#2f7d43" : "#b04a3a", marginTop: 8 }}>Tooth {selected}: {selectedCount.toLocaleString()} triangles segmented{selectedCount ? "" : " - click on the tooth, or raise Detail/Tooth size"}</div> : null}
          </div>

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
