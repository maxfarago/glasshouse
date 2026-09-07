import type { AsnType } from "./asn-type.ts";

export type PathVsBody = "aligned" | "mixed" | "indeterminate";

function phoneClass(family: string | null): boolean {
  if (!family) return false;
  const s = family.toLowerCase();
  return s.includes("iphone") || s.includes("phone") || s.includes("ipad");
}

export function pathVsBody(family: string | null, asn: AsnType): PathVsBody {
  if (!family || asn === "unknown") return "indeterminate";
  const phone = phoneClass(family);
  if (phone && asn === "mobile") return "aligned";
  if (!phone && (asn === "residential" || asn === "corporate" || asn === "education" || asn === "government")) {
    return "aligned";
  }
  if (phone && asn === "residential") return "mixed";
  if (!phone && asn === "mobile") return "mixed";
  if (asn === "datacenter") return "mixed";
  return "indeterminate";
}