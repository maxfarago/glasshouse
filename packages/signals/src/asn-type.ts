export type AsnType =
  | "residential"
  | "mobile"
  | "datacenter"
  | "corporate"
  | "education"
  | "government"
  | "unknown";

const RULES: Array<{ type: AsnType; test: RegExp }> = [
  { type: "datacenter", test: /\b(mullvad|amazon|aws|digitalocean|hetzner|ovh|linode|cloudflare|google llc|microsoft|akamai|leaseweb|datacamp|choopa|m247|private relay)\b/i },
  { type: "education", test: /\b(university|universiteit|college|school|\.edu)\b/i },
  { type: "government", test: /\b(government|ministerie|rijksoverheid|\.gov)\b/i },
  { type: "mobile", test: /\b(t-mobile|vodafone|orange|verizon wireless|tmobile|kpn mobiel|tele2)\b/i },
  { type: "corporate", test: /\b(cisco|ibm|oracle|salesforce|corporate)\b/i },
  { type: "residential", test: /\b(comcast|verizon|at&t|kpn|ziggo|xs4all|odido|bt |sky |cox |charter)\b/i },
];

export function asnType(asOrg: string | null | undefined): AsnType {
  if (!asOrg) return "unknown";
  for (const rule of RULES) {
    if (rule.test.test(asOrg)) return rule.type;
  }
  return "unknown";
}
