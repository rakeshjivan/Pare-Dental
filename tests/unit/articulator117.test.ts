import manifoldModule, { type ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import { makeDentalStudio, type DentalStudioOptions } from "@/lib/dentalModel";
import {
  articulatorParts, CONDYLE_RADIUS, CUP_FIT, HINGE_FIT_MAX, HINGE_FITS, hingeFit, PIN_DISH_DEPTH, PIN_DOME, PIN_RADIUS, pinRisers, RISER_HEIGHTS, RISER_WALL, riserOnPost, riserSocket, riserTop,
  type ArticulatorSides,
} from "@/lib/dentalArticulator";
import { centralsContact } from "@/lib/toothSegment";
import { weld, toManifold } from "@/lib/dentalMesh";

/**
 * Build 117 (Ian Meyers' review of Model Builder): the articulated models on the dental midline, the
 * ball-and-socket's fit as an option, and slip-on risers that hold the bite open at the side posts.
 */

/** A made-up arch, no patient's (as in articulator78): a U-shaped sheet of bumps, incisors at -y. */
function syntheticArch(options: { teethDown?: boolean; front?: number } = {}) {
  const nx = 120, ny = 60, sx = 60, sy = 30;
  const front = options.front ?? 0;
  const notch = (u: number, v: number) => Math.max(0.32 - u, u - 0.68, 0.45 - v);
  const z = (i: number, j: number) => {
    const u = i / nx, v = j / ny;
    const edge = Math.min(u, 1 - u, v, 1 - v, Math.max(0, notch(u, v)));
    const plateau = Math.min(1, edge * 8);
    const teeth = 1.5 * Math.max(0, Math.sin(u * Math.PI * 14)) * Math.max(0, Math.sin(v * Math.PI * 2));
    const ragged = 3 + 2 * Math.sin(i * 0.7) * Math.cos(j * 0.9);
    return plateau * (12 + teeth) - (1 - plateau) * ragged;
  };
  const p = (i: number, j: number) => [(i / nx - 0.5) * sx, (j / ny - 0.5) * sy + front, z(i, j)];
  const out: number[] = [];
  for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) {
    if (notch((i + 0.5) / nx, (j + 0.5) / ny) < 0) continue;
    const a = p(i, j), b = p(i + 1, j), c = p(i + 1, j + 1), d = p(i, j + 1);
    out.push(...a, ...c, ...b, ...a, ...d, ...c);
  }
  if (options.teethDown) {
    for (let t = 0; t < out.length; t += 9) {
      for (let k = 2; k < 9; k += 3) out[t + k] = -out[t + k];
      for (let k = 0; k < 3; k += 1) { const swap = out[t + 3 + k]; out[t + 3 + k] = out[t + 6 + k]; out[t + 6 + k] = swap; }
    }
  }
  return Float32Array.from(out);
}

/**
 * A made-up full arch, no patient's: a horseshoe band of "teeth" (bumps along it) round the front at -y,
 * symmetric about x = 0, falling away to a ragged edge either side - read as a full arch, not a quadrant.
 */
function horseshoeArch(options: { teethDown?: boolean; drop?: number } = {}) {
  const nx = 220, ny = 24, width = 12;
  const z = (i: number, j: number) => {
    const u = i / nx, v = j / ny;
    const edge = Math.min(u, 1 - u, v, 1 - v);
    const plateau = Math.min(1, edge * 8);
    const teeth = 1.5 * Math.max(0, Math.sin(u * Math.PI * 28)) * Math.max(0, Math.sin(v * Math.PI));
    const ragged = 3 + 2 * Math.sin(i * 0.7) * Math.cos(j * 0.9);
    return plateau * (12 + teeth) - (1 - plateau) * ragged;
  };
  const p = (i: number, j: number) => {
    const s = (i / nx - 0.5) * 2 * 1.6;
    const w = (j / ny - 0.5) * width;
    // Along the arch x grows with i; across it, j runs inwards (+y at the front), as the sheet's grid does.
    const cx = 22 * Math.sin(s), cy = -30 * Math.cos(s) + 12;
    return [cx - Math.sin(s) * w, cy + Math.cos(s) * w, z(i, j) - (options.drop ?? 0)];
  };
  const out: number[] = [];
  for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) {
    const a = p(i, j), b = p(i + 1, j), c = p(i + 1, j + 1), d = p(i, j + 1);
    out.push(...a, ...c, ...b, ...a, ...d, ...c);
  }
  if (options.teethDown) {
    for (let t = 0; t < out.length; t += 9) {
      for (let k = 2; k < 9; k += 3) out[t + k] = -out[t + k];
      for (let k = 0; k < 3; k += 1) { const swap = out[t + 3 + k]; out[t + 3 + k] = out[t + 6 + k]; out[t + 6 + k] = swap; }
    }
  }
  return Float32Array.from(out);
}

let runtime: ManifoldToplevel;
beforeAll(async () => {
  runtime = await manifoldModule();
  runtime.setup();
});

const heels = [{ x: -22, y: 20 }, { x: 22, y: 20 }];
const front = { x: 0, upperY: -30, lowerY: -28 };
const sides: ArticulatorSides = { y: -18, posts: [-32, 32], bases: { upper: [-24, 24], lower: [-24, 24] } };
const turnedBy = (solid: ReturnType<ManifoldToplevel["Manifold"]["cube"]>, axleY: number, degrees: number, down = 0) => solid.translate([0, -axleY, 0]).rotate([-degrees, 0, 0]).translate([0, axleY, -down]);

describe("The ball-and-socket's fit (build 117)", () => {
  it("is CUP_FIT unless chosen, and kept within its bounds", () => {
    expect(hingeFit(undefined)).toBe(CUP_FIT);
    expect(HINGE_FITS).toContain(CUP_FIT);
    expect(hingeFit(-1)).toBe(0);
    expect(hingeFit(5)).toBe(HINGE_FIT_MAX);
  });

  it.each([0.05, 0.1, 0.2])("leaves %s mm all round the ball in its socket", (fit) => {
    const a = articulatorParts(runtime as never, 20, -25, 25, 18, -18, front, 0, { upper: heels, lower: heels }, "fused", { fit });
    expect(runtime.Manifold.intersection(a.upper, a.lower).volume()).toBe(0);
    for (const c of a.centres) {
      const ball = (grow: number) => runtime.Manifold.intersection(a.upper, runtime.Manifold.sphere(CONDYLE_RADIUS + grow, 96).translate([c, a.axleY, 0])).volume();
      expect(ball(fit - 0.02)).toBeLessThan(1e-6);
      expect(ball(fit + 0.03)).toBeGreaterThan(0);
    }
  });

  it("left out, makes the same articulator as before", () => {
    const before = articulatorParts(runtime as never, 20, -25, 25, 18, -18, front, 0, { upper: heels, lower: heels });
    const now = articulatorParts(runtime as never, 20, -25, 25, 18, -18, front, 0, { upper: heels, lower: heels }, "fused", { fit: CUP_FIT });
    expect(now.upper.volume()).toBeCloseTo(before.upper.volume(), 6);
    expect(runtime.Manifold.difference(now.upper, before.upper).volume()).toBeLessThan(1e-6);
  });
});

describe("The articulator on the dental midline (build 117)", () => {
  it("stands its condyles either side of the midline alike", () => {
    // Heels uneven about the midline: -25 on the right, 21 on the left.
    const a = articulatorParts(runtime as never, 20, -25, 21, 18, -18, front, 0, { upper: heels, lower: heels }, "fused", { centre: 0 });
    expect(a.centres[0] + a.centres[1]).toBeCloseTo(0, 9);
    const b = articulatorParts(runtime as never, 20, -25, 21, 18, -18, front, 0, { upper: heels, lower: heels });
    expect(b.centres[0] + b.centres[1]).toBeCloseTo(-4, 9);
  });

  it("finds the midline where the two centrals meet, and not when they stand apart", () => {
    // Two 'centrals' as boxes of triangles, meeting at x = 1.3; the rest labelled gum.
    const soup: number[] = [];
    const labels: number[] = [];
    const tile = (x0: number, x1: number, fdi: number) => {
      for (let x = x0; x < x1 - 1e-9; x += 0.25) for (let z = 0; z < 8; z += 0.5) {
        soup.push(x, 0, z, x + 0.25, 0, z, x, 0, z + 0.5);
        labels.push(fdi);
      }
    };
    tile(1.3 - 8.5, 1.3, 11);
    tile(1.3, 1.3 + 8.5, 21);
    tile(-20, -7.2, 12);
    const point = centralsContact(Float32Array.from(soup), Uint8Array.from(labels), "upper");
    expect(point).not.toBeNull();
    expect(point![0]).toBeCloseTo(1.3, 1);
    // A diastema of 3 mm: not taken for a contact.
    const apart: number[] = [];
    for (let t = 0; t < labels.length; t += 1) for (let k = 0; k < 9; k += 1) apart.push(soup[t * 9 + k] + (k % 3 === 0 && labels[t] === 21 ? 3 : 0));
    expect(centralsContact(Float32Array.from(apart), Uint8Array.from(labels), "upper")).toBeNull();
    // Without 11 and 21, none.
    expect(centralsContact(Float32Array.from(soup), Uint8Array.from(labels.map((l) => (l === 21 ? 22 : l))), "upper")).toBeNull();
  });

  it("centres an articulated pair on the midline given, and keeps the arch's middle without it", async () => {
    const upper = horseshoeArch({ teethDown: true });
    const lower = horseshoeArch({ drop: 26.6 });
    const options: DentalStudioOptions = { keep: null, base: 4, baseStyle: "clean", inside: "solid", wall: 2, hinge: true, layout: "occlusion", label: "", incisalPin: true, pinPlace: "midline" };
    const teethX = (p: Float32Array) => {
      let sum = 0, n = 0;
      for (let i = 0; i < p.length; i += 3) if (p[i + 2] > -1.5 && p[i + 2] < 0.5 && p[i + 1] < 5) { sum += p[i]; n += 1; }
      return sum / n;
    };
    const condylesX = (p: Float32Array) => {
      let lo = Infinity, hi = -Infinity, back = -Infinity;
      for (let i = 1; i < p.length; i += 3) back = Math.max(back, p[i]);
      for (let i = 0; i < p.length; i += 3) if (p[i + 1] > back - 6 && Math.abs(p[i + 2]) < 1) { lo = Math.min(lo, p[i]); hi = Math.max(hi, p[i]); }
      return (lo + hi) / 2;
    };
    const plain = await makeDentalStudio({ arches: [{ id: "l", positions: lower }, { id: "u", positions: upper }] }, options, runtime as never);
    expect(plain.midline).toBeUndefined();
    const plainLower = plain.parts.find((part) => part.role === "lower")!.positions;
    // The centrals' contact 2.5 mm to one side of the arch's middle (in the scan's own coordinates).
    const centred = await makeDentalStudio({ arches: [{ id: "l", positions: lower }, { id: "u", positions: upper, midline: [2.5, -18, -12] }] }, options, runtime as never);
    expect(Math.abs(Math.abs(centred.midline!) - 2.5)).toBeLessThan(0.3);
    const lowerPart = centred.parts.find((part) => part.role === "lower")!.positions;
    // The models move across by the midline's offset; the condyles stand either side of x = 0, the midline.
    expect(Math.abs(teethX(lowerPart) - teethX(plainLower) + centred.midline!)).toBeLessThan(0.3);
    expect(Math.abs(condylesX(lowerPart))).toBeLessThan(0.05);
    expect(centred.pieces).toEqual([1, 1]);
    // A point far off the arch's middle is not the centrals': the arch's middle is kept.
    const far = await makeDentalStudio({ arches: [{ id: "l", positions: lower }, { id: "u", positions: upper, midline: [14, -18, -12] }] }, options, runtime as never);
    expect(far.midline).toBeUndefined();
  }, 120_000);
});

describe("Bite-opening risers for the side posts (build 117)", () => {
  it.each([0, 3])("fit over each post, rest on its top and hold the upper open by their height at the posts (pin raised %i mm)", (raise) => {
    const fit = 0.1;
    const a = articulatorParts(runtime as never, 20, -25, 25, 18, -18, { ...front, sides }, raise, { upper: heels, lower: heels }, "fused", { fit });
    expect(a.posts.length).toBe(2);
    const socket = riserSocket(a.posts[0])!;
    expect(socket).toBeGreaterThanOrEqual(2);
    const rest = (a.rest * Math.PI) / 180;
    // The upper's lowest point by a post, as it rests: its dome's bottom.
    const domeLow = (upper: ReturnType<ManifoldToplevel["Manifold"]["cube"]>, post: (typeof a.posts)[number]) =>
      runtime.Manifold.intersection(upper, runtime.Manifold.cube([8, 12, 20]).translate([post.x - 4, post.restY - 6, -2])).boundingBox().min[2];
    const restingOnPosts = turnedBy(a.upper, a.axleY, a.rest);
    for (const h of RISER_HEIGHTS) {
      const { top, rest: turn } = riserTop(h, a.posts[0], a.axleY, rest);
      const risers = a.posts.map((post) => riserOnPost(runtime as never, post, top, socket, fit, h));
      for (const riser of risers) {
        // A closed solid that slips over the post: clear of it and its arm, and resting on its top.
        expect(riser.status()).toBe("NoError");
        expect(riser.genus()).toBe(0);
        expect(runtime.Manifold.intersection(riser, a.lower).volume()).toBeLessThan(1e-6);
        expect(runtime.Manifold.intersection(riser.translate([0, 0, -0.02]), a.lower).volume()).toBeGreaterThan(0);
      }
      const both = runtime.Manifold.union(risers);
      const resting = turnedBy(a.upper, a.axleY, (turn * 180) / Math.PI);
      // Resting on the risers, the upper touches nothing; lowered a hair it meets the two risers (one each side) and not the lower.
      expect(runtime.Manifold.intersection(resting, both).volume()).toBeLessThan(1e-6);
      expect(runtime.Manifold.intersection(resting, a.lower).volume()).toBeLessThan(1e-6);
      const touches = runtime.Manifold.intersection(resting.translate([0, 0, -0.03]), both).decompose();
      expect(touches.length).toBe(2);
      expect(runtime.Manifold.intersection(resting.translate([0, 0, -0.03]), a.lower).volume()).toBeLessThan(1e-6);
      // Held open by the riser's height at each post: the dome stands h higher than on the post.
      for (const post of a.posts) expect(domeLow(resting, post) - domeLow(restingOnPosts, post)).toBeCloseTo(h, 1);
    }
  });

  it("have a socket the post's size with the fit all round", () => {
    for (const fit of [0.05, 0.2]) {
      const a = articulatorParts(runtime as never, 20, -25, 25, 18, -18, { ...front, sides }, 0, { upper: heels, lower: heels }, "fused", { fit });
      const post = a.posts[0];
      const socket = riserSocket(post)!;
      const riser = riserOnPost(runtime as never, post, PIN_DISH_DEPTH + 2, socket, fit, 2);
      const inSocket = (radius: number) => runtime.Manifold.intersection(riser, runtime.Manifold.cylinder(socket - 0.8, radius, radius, 128).translate([post.x, post.restY, PIN_DISH_DEPTH - socket + 0.2])).volume();
      expect(inSocket(PIN_RADIUS + fit - 0.02)).toBeLessThan(1e-6);
      expect(inSocket(PIN_RADIUS + fit + 0.03)).toBeGreaterThan(0);
      // Its wall round the socket.
      const box = riser.boundingBox();
      expect((box.max[0] - box.min[0]) / 2).toBeCloseTo(PIN_RADIUS + fit + RISER_WALL, 1);
    }
  });

  it("come as one printable part of two of each height, standing on the plate", () => {
    const a = articulatorParts(runtime as never, 20, -25, 25, 18, -18, { ...front, sides }, 0, { upper: heels, lower: heels });
    const made = pinRisers(runtime as never, a.posts, a.axleY, 0)!;
    expect(made.risers.map((r) => r.raise)).toEqual([...RISER_HEIGHTS]);
    expect(made.set.status()).toBe("NoError");
    expect(made.set.decompose().length).toBe(1);
    expect(made.set.boundingBox().min[2]).toBeCloseTo(0, 6);
    // Each riser's top stands about its height above where the post's top is (a little over: the dome lands further back on it).
    made.risers.forEach((r) => { expect(r.top - PIN_DISH_DEPTH).toBeGreaterThan(r.raise - 0.2); expect(r.top - PIN_DISH_DEPTH).toBeLessThan(r.raise + 0.5); });
    // Taller risers are taller: the tallest stands its socket and 5 mm and a little more.
    expect(made.set.boundingBox().max[2]).toBeGreaterThan(made.socket + 5 - 0.2);
    expect(PIN_DOME).toBe(PIN_RADIUS);
  });

  it("are made with an articulated pair on side posts when asked, and closed solids", async () => {
    const upper = syntheticArch({ teethDown: true, front: -2 });
    const lower = syntheticArch();
    for (let i = 2; i < lower.length; i += 3) lower[i] -= 26.6;
    const options: DentalStudioOptions = { keep: null, base: 8, baseStyle: "clean", inside: "solid", wall: 2, hinge: true, layout: "print", label: "", incisalPin: true, pinPlace: "sides", risers: true, hingeFit: 0.05 };
    const result = await makeDentalStudio({ arches: [{ id: "l", positions: lower }, { id: "u", positions: upper }] }, options, runtime as never);
    expect(result.risers?.heights).toEqual([...RISER_HEIGHTS]);
    const solid = toManifold(runtime as never, weld(result.risers!.positions));
    expect(solid.status()).toBe("NoError");
    expect(solid.decompose().length).toBe(1);
    expect(result.pieces).toEqual([1, 1]);
    // Off unless asked.
    const without = await makeDentalStudio({ arches: [{ id: "l", positions: lower }, { id: "u", positions: upper }] }, { ...options, risers: false }, runtime as never);
    expect(without.risers).toBeUndefined();
  }, 120_000);
});
