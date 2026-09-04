import { readdir } from "node:fs/promises";
import path from "node:path";
import { asSignalSet, fixtureSchema, isSignalId, sourceOf, type Fixture, type SignalSet, type SignalTier } from "@glasshouse/schema";

export type LoadedFixture = Fixture & { source: "local" | "sanitized"; path: string };

function repoRoot(from = import.meta.dirname): string {
  return path.resolve(from, "../../..");
}

export function clipToTiers(signals: SignalSet, tiers: SignalTier[]): SignalSet {
  const allowed = new Set<string>(tiers);
  const out: SignalSet = {};
  for (const [key, value] of Object.entries(signals)) {
    if (!isSignalId(key)) continue;
    const src = sourceOf(key);
    if (src === "derived") continue;
    if (allowed.has(src)) out[key] = value;
  }
  return out;
}

async function jsonFiles(dir: string): Promise<string[]> {
  try {
    const names = await readdir(dir);
    return names.filter((n) => n.endsWith(".json")).sort();
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw err;
  }
}

export async function loadFixtures(root = repoRoot()): Promise<LoadedFixture[]> {
  const publicDir = path.join(root, "evals/fixtures");
  const localDir = path.join(root, "evals/fixtures.local");
  const publicNames = await jsonFiles(publicDir);
  const localNames = await jsonFiles(localDir);
  const names = [...new Set([...publicNames, ...localNames])].sort();
  const loaded: LoadedFixture[] = [];
  for (const name of names) {
    const localPath = path.join(localDir, name);
    const publicPath = path.join(publicDir, name);
    const useLocal = localNames.includes(name);
    const filePath = useLocal ? localPath : publicPath;
    const { readFile } = await import("node:fs/promises");
    const raw = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    const fixture = fixtureSchema.parse(raw);
    loaded.push({
      ...fixture,
      signals: asSignalSet(fixture.signals as Record<string, unknown>),
      source: useLocal ? "local" : "sanitized",
      path: filePath,
    });
  }
  return loaded;
}
