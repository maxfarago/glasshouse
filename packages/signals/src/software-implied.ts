const FONT_SOFTWARE: Record<string, string> = {
  "Minion Pro": "Adobe Creative Cloud",
  "Myriad Pro": "Adobe Creative Cloud",
  "Adobe Garamond Pro": "Adobe Creative Cloud",
  "Source Code Pro": "Adobe Creative Cloud",
  "Source Sans 3": "Adobe Creative Cloud",
  Calibri: "Microsoft Office",
  Cambria: "Microsoft Office",
  Consolas: "Microsoft Office",
  Candara: "Microsoft Office",
  "SF Mono": "Apple Developer Tools",
  "Cascadia Code": "Microsoft",
  "JetBrains Mono": "JetBrains",
  "Operator Mono": "Hoefler&Co Operator Mono",
};

export function softwareImplied(hits: string[] | null | undefined): string[] {
  if (!hits || hits.length === 0) return [];
  const names = new Set<string>();
  for (const font of hits) {
    const sw = FONT_SOFTWARE[font];
    if (sw) names.add(sw);
  }
  return [...names].sort();
}