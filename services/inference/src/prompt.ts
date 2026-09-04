import { readFile } from "node:fs/promises";
import path from "node:path";

export function promptPath(version: string, repoRoot: string): string {
  return path.join(repoRoot, "services/inference/prompts", `${version}.md`);
}

export async function loadPrompt(version: string, repoRoot: string): Promise<string> {
  const candidates = [
    path.join(repoRoot, "services/inference/prompts", `${version}.md`),
    path.join(repoRoot, "prompts", `${version}.md`),
  ];
  const errors: string[] = [];
  for (const file of candidates) {
    try {
      return await readFile(file, "utf8");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
      errors.push(file);
    }
  }
  throw new Error(`prompt ${version} not found (tried ${errors.join(", ")})`);
}
