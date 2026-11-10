import { describe, expect, it } from "vitest";
import { contactNeighbour, moveContact } from "@/lib/waxContacts";
import { NO_EDIT } from "@/lib/waxToothEdit";

/** Build 284: a contact is one thing that moves - the tooth beside gives way, nothing else moves. */
const order = [13, 12, 11, 21, 22, 23];

describe("contactNeighbour", () => {
  it("finds the tooth sharing each contact, and which side of it", () => {
    expect(contactNeighbour(order, 11, "distal")).toEqual({ fdi: 12, side: "mesial" });
    expect(contactNeighbour(order, 12, "mesial")).toEqual({ fdi: 11, side: "distal" });
    expect(contactNeighbour(order, 11, "mesial")).toEqual({ fdi: 21, side: "mesial" });
    expect(contactNeighbour(order, 21, "mesial")).toEqual({ fdi: 11, side: "mesial" });
    expect(contactNeighbour(order, 22, "distal")).toEqual({ fdi: 23, side: "mesial" });
    expect(contactNeighbour(order, 13, "distal")).toBeNull();
    expect(contactNeighbour(order, 23, "distal")).toBeNull();
  });
});

describe("moveContact", () => {
  it("widens one side only and narrows the neighbour by as much; no other tooth changes", () => {
    const next = moveContact({}, order, 11, "distal", 0.6, false);
    expect(next[11].distal).toBeCloseTo(0.6);
    expect(next[11].mesial).toBe(0);
    expect(next[12].mesial).toBeCloseTo(-0.6);
    expect(Object.keys(next).map(Number).sort()).toEqual([11, 12]);
  });

  it("mirrors across the midline when asked", () => {
    const next = moveContact({}, order, 12, "mesial", -0.4, true);
    expect(next[12].mesial).toBeCloseTo(-0.4);
    expect(next[11].distal).toBeCloseTo(0.4);
    expect(next[22].mesial).toBeCloseTo(-0.4);
    expect(next[21].distal).toBeCloseTo(0.4);
  });

  it("moves the midline contact as one contact (never mirrored)", () => {
    const next = moveContact({}, order, 11, "mesial", 0.5, true);
    expect(next[11].mesial).toBeCloseTo(0.5);
    expect(next[21].mesial).toBeCloseTo(-0.5);
    expect(Object.keys(next).length).toBe(2);
  });

  it("stops where either tooth can take no more, so the contact never opens or overlaps", () => {
    const own = { 12: { ...NO_EDIT, mesial: -2.2 } };
    const next = moveContact(own, order, 11, "distal", 1, false);
    expect(next[12].mesial).toBeCloseTo(-2.5);
    expect(next[11].distal).toBeCloseTo(0.3);
  });

  it("moves a canine's distal side alone, and a side whose neighbour is held alone", () => {
    expect(Object.keys(moveContact({}, order, 13, "distal", 0.5, false))).toEqual(["13"]);
    const next = moveContact({}, order, 11, "distal", 0.5, false, (fdi) => fdi !== 12);
    expect(next[11].distal).toBeCloseTo(0.5);
    expect(next[12]).toBeUndefined();
  });
});
