import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

let cached: string | undefined;

export async function anthropicKey(): Promise<string> {
  if (cached) return cached;
  if (process.env.ANTHROPIC_API_KEY) {
    cached = process.env.ANTHROPIC_API_KEY;
    return cached;
  }
  const id = process.env.GH_ANTHROPIC_SECRET;
  if (!id) throw new Error("ANTHROPIC_API_KEY or GH_ANTHROPIC_SECRET is not set");
  const sm = new SecretsManagerClient({});
  const out = await sm.send(new GetSecretValueCommand({ SecretId: id }));
  const raw = out.SecretString;
  if (!raw) throw new Error("anthropic secret is empty");
  cached = raw.startsWith("{")
    ? (JSON.parse(raw) as { ANTHROPIC_API_KEY?: string }).ANTHROPIC_API_KEY ?? raw
    : raw;
  return cached;
}
