#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const region = process.env.AWS_REGION ?? "us-east-1";
const name = "glasshouse/anthropic";
const envPath = path.resolve(process.cwd(), "../.env");
const raw = readFileSync(envPath, "utf8");
let key = "";
for (const line of raw.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const kv = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
  const eq = kv.indexOf("=");
  if (eq <= 0) continue;
  if (kv.slice(0, eq) !== "ANTHROPIC_API_KEY") continue;
  let value = kv.slice(eq + 1);
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  key = value;
}
if (!key) {
  console.error("ANTHROPIC_API_KEY missing from .env");
  process.exit(1);
}

const dir = mkdtempSync(path.join(tmpdir(), "gh-secret-"));
const file = path.join(dir, "secret.json");
try {
  writeFileSync(file, JSON.stringify({ Name: name, SecretString: key }), { mode: 0o600 });
  const created = spawnSync(
    "aws",
    ["secretsmanager", "create-secret", "--region", region, "--cli-input-json", `file://${file}`],
    { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
  );
  if (created.status === 0) {
    console.error("created secret", name);
    process.exit(0);
  }
  const err = `${created.stderr}${created.stdout}`;
  if (!err.includes("ResourceExistsException") && !err.includes("already exists")) {
    console.error(created.stderr || created.stdout);
    process.exit(created.status ?? 1);
  }
  writeFileSync(file, JSON.stringify({ SecretId: name, SecretString: key }), { mode: 0o600 });
  const updated = spawnSync(
    "aws",
    ["secretsmanager", "put-secret-value", "--region", region, "--cli-input-json", `file://${file}`],
    { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
  );
  if (updated.status !== 0) {
    console.error(updated.stderr || updated.stdout);
    process.exit(updated.status ?? 1);
  }
  console.error("updated secret", name);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
