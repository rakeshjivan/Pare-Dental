import { describe, expect, it, vi } from "vitest";
import {
  fetchVersionInfo,
  highlightsAfter,
  isNewBuild,
  looksLikeMissingProgramFile,
  parseVersionInfo,
  type VersionInfo,
} from "@/lib/newVersionWatch";
import { precachePaths, versionFileSource } from "../../scripts/generate-service-worker.mjs";

const title = (en: string) => ({ de: `${en} (de)`, en });
const info = (build: string, version = "1.67.0"): VersionInfo => ({
  version,
  build,
  highlights: [
    { version: "1.67.0", title: title("Newest") },
    { version: "1.66.0", title: title("Save into your own file") },
    { version: "1.65.0", title: title("Older") },
  ],
});

describe("an open page noticing an update (#update-notice)", () => {


  it("asks past every cache, with a fresh address each time", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ version: "1.67.0", build: "b1" })));
    expect(await fetchVersionInfo(fetchFn as unknown as typeof fetch, 1234)).toEqual({ version: "1.67.0", build: "b1", highlights: [] });
    expect(fetchFn).toHaveBeenCalledWith("/version.json?t=1234", { cache: "no-store" });
  });

  it("answers null without a file, an answer or valid JSON", async () => {
    expect(await fetchVersionInfo((async () => new Response("", { status: 404 })) as unknown as typeof fetch)).toBeNull();
    expect(await fetchVersionInfo((async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toBeNull();
    expect(await fetchVersionInfo((async () => new Response("<html>")) as unknown as typeof fetch)).toBeNull();
  });

  it("calls a different build new, the same one not", () => {
    expect(isNewBuild(info("a"), info("a"))).toBe(false);
    expect(isNewBuild(info("a"), info("b"))).toBe(true);
    // A deploy that changes nothing keeps the build, so nothing is offered.
    expect(isNewBuild(info("a", "1.66.0"), info("a", "1.66.0"))).toBe(false);
  });

  it("lists what came after the running version, newest first", () => {
    expect(highlightsAfter("1.65.0", info("b")).map((entry) => entry.title.en)).toEqual(["Newest", "Save into your own file"]);
    expect(highlightsAfter("1.67.0", info("b"))).toEqual([]);
    // A copy without a version number is told nothing.
    expect(highlightsAfter("", info("b"))).toEqual([]);
  });

  it("takes a missing program file or worker for a sign of an update", () => {
    expect(looksLikeMissingProgramFile("ChunkLoadError: Loading chunk 402 failed.")).toBe(true);
    expect(looksLikeMissingProgramFile("OpenCascade sketch worker failed to start")).toBe(true);
    expect(looksLikeMissingProgramFile("Failed to fetch dynamically imported module: /_next/static/x.js")).toBe(true);
    expect(looksLikeMissingProgramFile("Cannot read properties of undefined")).toBe(false);
  });

  it("keeps version.json out of the offline copy, so the page always asks the server", () => {
    expect(precachePaths(["index.html", "version.json", "sw.js"])).toEqual(["/"]);
  });
});
