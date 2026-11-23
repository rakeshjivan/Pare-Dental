/**
 * Build 125: HPS scan files (.dcm, and the .3oxz order packages that hold them), read as the
 * binary STL of their triangles - so a scan comes in, is stored, reloaded and exported like any STL,
 * as a PLY does (plyImport.ts). Only the open schemas (CA, CC) are read. An encrypted scan (CE) is
 * said to be locked and is never decrypted; a DICOM (a CT or X-ray, which also ends in .dcm) is
 * named as one. Colours and textures are not read.
 *
 * The facet decoder is a port of the unencrypted path of hpsdecode
 * (https://github.com/HeadTriXz/hpsdecode, schemas/cc.py), under its licence:
 *
 * MIT License
 *
 * Copyright (c) 2025 Lars Knol
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

export function isHpsFile(fileName: string) {
  return /\.dcm$/i.test(fileName);
}

export function isHpsPackage(fileName: string) {
  return /\.3oxz$/i.test(fileName);
}

/** What a .dcm holds: an open scan, a locked one, a DICOM, or something else. */
export type HpsKind = "open" | "locked" | "dicom" | "unknown";

const OPEN_SCHEMAS = new Set(["CA", "CC"]);

/** Thrown when a .dcm cannot be read; `kind` says why, `message` says it to the user. */
export class HpsImportError extends Error {
  constructor(readonly kind: Exclude<HpsKind, "open">, message: string) {
    super(message);
  }
}

function headText(bytes: Uint8Array, length: number) {
  let text = "";
  const end = Math.min(bytes.length, length);
  for (let i = 0; i < end; i += 1) text += String.fromCharCode(bytes[i]);
  return text;
}

function schemaOf(bytes: Uint8Array) {
  return /<Schema>\s*([A-Z]{2})\s*<\/Schema>/.exec(headText(bytes, 400_000))?.[1] ?? null;
}

export function hpsKind(bytes: Uint8Array): HpsKind {
  // A DICOM file has 128 bytes of preamble, then "DICM".
  if (bytes.length > 132 && bytes[128] === 0x44 && bytes[129] === 0x49 && bytes[130] === 0x43 && bytes[131] === 0x4d) return "dicom";
  const schema = schemaOf(bytes);
  if (schema === "CE") return "locked";
  if (schema && OPEN_SCHEMAS.has(schema)) return "open";
  return "unknown";
}

const BASE64 = (() => {
  const table = new Int16Array(128).fill(-1);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (let i = 0; i < alphabet.length; i += 1) table[alphabet.charCodeAt(i)] = i;
  return table;
})();

/** Base64 between `start` and `end` of the file's bytes, decoded; whitespace is skipped. */
function decodeBase64(bytes: Uint8Array, start: number, end: number) {
  const out = new Uint8Array(Math.floor(((end - start) * 3) / 4) + 3);
  let size = 0, buffer = 0, bits = 0;
  for (let i = start; i < end; i += 1) {
    const c = bytes[i];
    if (c === 0x3d) break; // "="
    const value = c < 128 ? BASE64[c] : -1;
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[size++] = (buffer >> bits) & 0xff;
    }
  }
  return out.subarray(0, size);
}

function indexOfText(bytes: Uint8Array, text: string, from: number) {
  const first = text.charCodeAt(0);
  outer: for (let i = from; i <= bytes.length - text.length; i += 1) {
    if (bytes[i] !== first) continue;
    for (let k = 1; k < text.length; k += 1) if (bytes[i + k] !== text.charCodeAt(k)) continue outer;
    return i;
  }
  return -1;
}

/** An element `<tag attrs>base64</tag>` from `from` on: its attributes and its data's byte range. */
function element(bytes: Uint8Array, tag: string, from: number) {
  let at = from;
  for (;;) {
    at = indexOfText(bytes, `<${tag}`, at);
    if (at < 0) return null;
    const next = bytes[at + tag.length + 1];
    if (next === 0x20 || next === 0x3e || next === 0x09 || next === 0x0a || next === 0x0d) break; // space > tab lf cr
    at += 1;
  }
  const open = indexOfText(bytes, ">", at);
  const close = indexOfText(bytes, `</${tag}>`, open);
  if (open < 0 || close < 0) return null;
  const attributes = headText(bytes.subarray(at, open), open - at);
  const attribute = (name: string) => new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`).exec(attributes)?.[1];
  return { attribute, start: open + 1, end: close };
}

type Edge = { start: number; end: number };
class FacetError extends Error {}

/** The facet stream as triangle indices (hpsdecode cc.py), with 16- or 32-bit indices. */
function decodeFacets(data: Uint8Array, vertexCount: number, wide: boolean) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const faces: number[] = [];
  let edges: Edge[] = [];
  let current = 0, nextVertex = 0, at = 0;
  const u16 = () => { if (at + 2 > data.length) throw new FacetError("end"); const v = view.getUint16(at, true); at += 2; return v; };
  const u32 = () => { if (at + 4 > data.length) throw new FacetError("end"); const v = view.getUint32(at, true); at += 4; return v; };
  const index = () => (wide ? u32() : u16());
  const check = (v: number) => { if (v >= vertexCount) throw new FacetError("index"); return v; };
  const advance = (n: number) => { current = (current + n) % edges.length; };
  const restart = (a: number, b: number, c: number) => {
    faces.push(a, b, c);
    edges = [{ start: a, end: b }, { start: b, end: c }, { start: c, end: a }];
    current = 0;
  };
  const extend = (v: number) => {
    if (!edges.length) throw new FacetError("no edge");
    const edge = edges[current];
    faces.push(v, edge.end, edge.start);
    edges.splice(current, 1, { start: edge.start, end: v }, { start: v, end: edge.end });
    advance(2);
  };
  const join = (low: number, high: number, made: Edge) => {
    edges.splice(high, 1);
    edges.splice(low, 1, made);
    current = (low + 1) % edges.length;
  };
  while (at < data.length) {
    const command = data[at++];
    if (command >> 4) throw new FacetError("command");
    switch (command) {
      case 0: extend(nextVertex++); break; // the next vertex in the list
      case 1: { // previous
        if (edges.length < 2) throw new FacetError("previous");
        const p = (current - 1 + edges.length) % edges.length, c = current;
        const prev = edges[p], curr = edges[c];
        faces.push(curr.start, prev.start, curr.end);
        join(Math.min(p, c), Math.max(p, c), { start: prev.start, end: curr.end });
        break;
      }
      case 2: { // next
        if (edges.length < 2) throw new FacetError("next");
        const c = current, n = (current + 1) % edges.length;
        const curr = edges[c], next = edges[n];
        faces.push(curr.start, next.end, curr.end);
        join(Math.min(c, n), Math.max(c, n), { start: curr.start, end: next.end });
        break;
      }
      case 3: if (!edges.length) throw new FacetError("ignore"); advance(1); break;
      case 4: restart(nextVertex++, nextVertex++, nextVertex++); break;
      case 5: restart(check(index()), check(index()), check(index())); break; // 16-bit opcode: its width follows the mode
      case 6: restart(check(u32()), check(u32()), check(u32())); break;
      case 7: extend(check(index())); break;
      case 8: extend(check(u32())); break;
      case 9: { // remove the current edge
        if (!edges.length) throw new FacetError("remove");
        const n = edges.length, p = (current - 1 + n) % n, c = current;
        const prev = edges[p], curr = edges[c];
        if (prev.start === curr.end && n > 2) {
          const low = Math.min(p, c), high = Math.max(p, c);
          edges.splice(high, 1);
          edges.splice(low, 1);
          if (edges.length) {
            const nc = low % edges.length, np = (low - 1 + edges.length) % edges.length;
            edges[np].end = edges[nc].start;
            current = nc;
          } else current = 0;
        } else {
          prev.end = curr.end;
          edges.splice(c, 1);
          current = edges.length ? c % edges.length : 0;
        }
        break;
      }
      case 10: nextVertex += 1; break;
      default: throw new FacetError("opcode");
    }
  }
  return faces;
}

export type HpsMesh = { vertices: Float32Array; faces: Uint32Array };

/** An open HPS scan's mesh. Throws HpsImportError for a locked scan, a DICOM or anything else. */
export function readHps(bytes: Uint8Array, messages: Record<Exclude<HpsKind, "open">, string>): HpsMesh {
  const kind = hpsKind(bytes);
  if (kind !== "open") throw new HpsImportError(kind, messages[kind]);
  const schema = schemaOf(bytes)!;
  const block = element(bytes, schema, indexOfText(bytes, "</Schema>", 0));
  const vertices = block && element(bytes, "Vertices", block.start);
  const facets = block && element(bytes, "Facets", block.start);
  if (!vertices || !facets) throw new HpsImportError("unknown", messages.unknown);
  const vertexBytes = decodeBase64(bytes, vertices.start, vertices.end);
  const vertexCount = Math.floor(vertexBytes.length / 12);
  const expectedVertices = Number(vertices.attribute("vertex_count") ?? vertexCount);
  const expectedFaces = Number(facets.attribute("facet_count") ?? -1);
  if (vertexCount !== expectedVertices || !vertexCount) throw new HpsImportError("unknown", messages.unknown);
  const aligned = new Uint8Array(vertexCount * 12);
  aligned.set(vertexBytes.subarray(0, vertexCount * 12));
  const facetBytes = decodeBase64(bytes, facets.start, facets.end);
  for (const wide of [false, true]) {
    try {
      const faces = decodeFacets(facetBytes, vertexCount, wide);
      if (expectedFaces >= 0 && faces.length / 3 !== expectedFaces) continue;
      return { vertices: new Float32Array(aligned.buffer), faces: Uint32Array.from(faces) };
    } catch (error) {
      if (!(error instanceof FacetError)) throw error;
    }
  }
  throw new HpsImportError("unknown", messages.unknown);
}

/** A mesh as a binary STL (normals left at zero, as the PLY import writes them). */
export function hpsMeshToStlBytes({ vertices, faces }: HpsMesh): Uint8Array {
  const triangles = faces.length / 3;
  const bytes = new Uint8Array(84 + triangles * 50);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("Pare Dental from DCM"), 0);
  view.setUint32(80, triangles, true);
  for (let t = 0; t < triangles; t += 1) {
    const base = 84 + t * 50 + 12;
    for (let k = 0; k < 3; k += 1) {
      const v = faces[t * 3 + k] * 3;
      view.setFloat32(base + k * 12, vertices[v], true);
      view.setFloat32(base + k * 12 + 4, vertices[v + 1], true);
      view.setFloat32(base + k * 12 + 8, vertices[v + 2], true);
    }
  }
  return bytes;
}

/** A scan's name without the long id some scanner exports put before or after it. */
export function cleanScanName(fileName: string) {
  const base = fileName.split(/[\\/]/).pop() || fileName;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base, ending = dot > 0 ? base.slice(dot) : "";
  const cleaned = stem.replace(/[{(]?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[})]?/gi, "").replace(/^[\s_.-]+|[\s_.-]+$/g, "");
  return cleaned ? cleaned + ending : base;
}

/** A .dcm file as an STL file of the same (cleaned) name. */
export async function hpsAsStlFile(file: File, messages: Record<Exclude<HpsKind, "open">, string>): Promise<File> {
  const mesh = readHps(new Uint8Array(await file.arrayBuffer()), messages);
  return new File([hpsMeshToStlBytes(mesh) as BlobPart], cleanScanName(file.name).replace(/\.dcm$/i, ".stl"), { type: "model/stl" });
}
