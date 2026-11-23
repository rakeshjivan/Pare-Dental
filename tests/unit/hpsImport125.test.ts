import { describe, expect, it } from "vitest";
import { cleanScanName, hpsKind, hpsMeshToStlBytes, readHps, HpsImportError } from "@/lib/hpsImport";

// Build 125: open .dcm scans read as triangles; locked scans and DICOMs named, never read.
// Made-up scans only; the expected faces are what the reference reader (hpsdecode) gives for them.

const MESSAGES = { locked: "locked", dicom: "dicom", unknown: "unknown" };
const VERTICES = new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10, 10, 10, 10]);

function b64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

function scan(schema: string, facets: number[], facetCount: number, vertexCount = 5) {
  const xml = `<?xml version="1.0"?><HPS version="1.1"><Packed_geometry><Schema>${schema}</Schema><Binary_data><${schema}>`
    + `<Vertices base64_encoded_bytes="60" vertex_count="${vertexCount}">\n${b64(new Uint8Array(VERTICES.buffer))}\n</Vertices>`
    + `<Facets facet_count="${facetCount}">${b64(Uint8Array.from(facets))}</Facets></${schema}></Binary_data></Packed_geometry></HPS>`;
  return new TextEncoder().encode(xml);
}

describe("HPS scans (build 125)", () => {
  it("reads a strip of faces as the reference reader does", () => {
    const mesh = readHps(scan("CA", [4, 0, 3, 0, 2], 4), MESSAGES);
    expect(Array.from(mesh.vertices)).toEqual(Array.from(VERTICES));
    expect(Array.from(mesh.faces)).toEqual([0, 1, 2, 3, 1, 0, 4, 0, 2, 0, 1, 3]);
  });

  it("reads absolute indices, 16-bit and (when the count says so) 32-bit", () => {
    expect(Array.from(readHps(scan("CC", [4, 0, 7, 4, 0], 3), MESSAGES).faces)).toEqual([0, 1, 2, 3, 1, 0, 4, 2, 1]);
    expect(Array.from(readHps(scan("CA", [4, 8, 4, 0, 0, 0, 2], 3), MESSAGES).faces)).toEqual([0, 1, 2, 4, 1, 0, 1, 0, 2]);
    expect(Array.from(readHps(scan("CA", [4, 7, 4, 0, 0, 0], 2), MESSAGES).faces)).toEqual([0, 1, 2, 4, 1, 0]);
  });

  it("says a locked scan is locked and never reads it", () => {
    const locked = scan("CE", [4], 1);
    expect(hpsKind(locked)).toBe("locked");
    expect(() => readHps(locked, MESSAGES)).toThrow(HpsImportError);
    try { readHps(locked, MESSAGES); } catch (error) { expect((error as HpsImportError).kind).toBe("locked"); }
  });

  it("names a DICOM (CT or X-ray) as one", () => {
    const dicom = new Uint8Array(300);
    dicom.set(new TextEncoder().encode("DICM"), 128);
    expect(hpsKind(dicom)).toBe("dicom");
    expect(() => readHps(dicom, MESSAGES)).toThrow("dicom");
  });

  it("refuses a file that is neither, and a scan whose faces do not add up", () => {
    expect(hpsKind(new TextEncoder().encode("hello"))).toBe("unknown");
    expect(() => readHps(scan("CA", [4, 0, 3, 0, 2], 9), MESSAGES)).toThrow("unknown");
    expect(() => readHps(scan("CA", [4, 7, 9, 0], 2), MESSAGES)).toThrow("unknown");
  });

  it("writes the triangles as a binary STL", () => {
    const stl = hpsMeshToStlBytes(readHps(scan("CA", [4], 1), MESSAGES));
    const view = new DataView(stl.buffer);
    expect(stl.length).toBe(84 + 50);
    expect(view.getUint32(80, true)).toBe(1);
    expect(view.getFloat32(84 + 12 + 12, true)).toBe(10);
  });

  it("drops the long ids exports put round a scan's name", () => {
    expect(cleanScanName("0cf04b07-8119-4f83-89f9-d5250cde2dad-UpperJawScan.dcm")).toBe("UpperJawScan.dcm");
    expect(cleanScanName("folder/LowerJawScan_{0cf04b07-8119-4f83-89f9-d5250cde2dad}.DCM")).toBe("LowerJawScan.DCM");
    expect(cleanScanName("BiteScan.dcm")).toBe("BiteScan.dcm");
    expect(cleanScanName("0cf04b07-8119-4f83-89f9-d5250cde2dad.dcm")).toBe("0cf04b07-8119-4f83-89f9-d5250cde2dad.dcm");
  });
});
