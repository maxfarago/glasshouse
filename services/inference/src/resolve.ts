import { createAnthropicInference } from "./anthropic.ts";
import { loadEnvFile } from "./env.ts";
import { loadPrompt } from "./prompt.ts";
import { stubInference } from "./stub.ts";
import type { Inference } from "./types.ts";

export async function resolveInference(promptVersion: string, repoRoot: string): Promise<Inference> {
  await loadEnvFile(repoRoot);
  if (promptVersion === "stub") return stubInference;
  const system = await loadPrompt(promptVersion, repoRoot);
  return createAnthropicInference({ system });
}
