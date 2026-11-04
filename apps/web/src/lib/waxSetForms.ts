/**
 * Build 108: the tooth sets Wax-up Studio offers, by arch and form. Every library's six-tooth front sets
 * (Pare's, Dr Adam Nulty's and Teethy's - no pontics, no full arches) are sorted by the form of their
 * centrals and named by it: Square 1, Square 2, Oval 1... The authors are credited on the Licences &
 * credits page, not in the tool. A set not listed here is not offered (it still opens in a design made with it).
 * Build 117: Christian Brenes's sets only (Pare's library) - the library Prof Meyers works with; Dr Nulty's and
 * Teethy's are no longer offered.
 */
export type WaxSetForm = "square" | "oval" | "round";
export const WAX_SET_FORM_ORDER: WaxSetForm[] = ["square", "oval", "round"];

const FORMS: Array<[id: string, arch: "upper" | "lower", form: WaxSetForm]> = [
  // Upper
  ["pare-square-upper-front", "upper", "square"],
  ["pare-square-oval-upper-front", "upper", "square"],
  ["pare-youthful-upper-front", "upper", "square"],
  ["pare-tapered-upper-front", "upper", "oval"],
  ["pare-oval-upper-front", "upper", "oval"],
  ["pare-smile-square-round-upper-front", "upper", "round"],
  // Lower
  ["pare-lower-front", "lower", "oval"],
];

/** Each offered set's arch, form and name ("Square 2"), in the order shown. */
export const WAX_SET_FORMS: ReadonlyMap<string, { arch: "upper" | "lower"; form: WaxSetForm; index: number; order: number }> = (() => {
  const out = new Map<string, { arch: "upper" | "lower"; form: WaxSetForm; index: number; order: number }>();
  const count = new Map<string, number>();
  FORMS.forEach(([id, arch, form], order) => {
    const key = `${arch}:${form}`;
    const index = (count.get(key) ?? 0) + 1;
    count.set(key, index);
    out.set(id, { arch, form, index, order });
  });
  return out;
})();
