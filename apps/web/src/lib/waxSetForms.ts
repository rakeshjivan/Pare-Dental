/**
 * Build 108: the tooth sets Wax-up Studio offers, by arch and form. Every library's six-tooth front sets
 * (Pare's, Dr Adam Nulty's and Teethy's - no pontics, no full arches) are sorted by the form of their
 * centrals and named by it: Square 1, Square 2, Oval 1... The authors are credited on the Licences &
 * credits page, not in the tool. A set not listed here is not offered (it still opens in a design made with it).
 */
export type WaxSetForm = "square" | "oval" | "round";
export const WAX_SET_FORM_ORDER: WaxSetForm[] = ["square", "oval", "round"];

const FORMS: Array<[id: string, arch: "upper" | "lower", form: WaxSetForm]> = [
  // Upper
  ["pare-square-upper-front", "upper", "square"],
  ["pare-square-oval-upper-front", "upper", "square"],
  ["pare-youthful-upper-front", "upper", "square"],
  ["nulty-a01-upper-front", "upper", "square"],
  ["teethy-4", "upper", "square"],
  ["teethy-5", "upper", "square"],
  ["teethy-7", "upper", "square"],
  ["pare-tapered-upper-front", "upper", "oval"],
  ["pare-oval-upper-front", "upper", "oval"],
  ["teethy-1", "upper", "oval"],
  ["teethy-2", "upper", "oval"],
  ["teethy-8", "upper", "oval"],
  ["pare-smile-square-round-upper-front", "upper", "round"],
  ["nulty-f01-upper-front", "upper", "round"],
  ["teethy-3", "upper", "round"],
  ["teethy-6", "upper", "round"],
  ["teethy-9", "upper", "round"],
  // Lower
  ["nulty-a01-lower-front", "lower", "square"],
  ["nulty-f01-lower-front", "lower", "square"],
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
