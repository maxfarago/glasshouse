#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const varsPath = path.resolve(process.cwd(), "../apps/worker/.dev.vars");
const env = {};
for (const line of readFileSync(varsPath, "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq <= 0) continue;
  env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
}

for (const name of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]) {
  const value = env[name];
  if (!value) {
    console.error(`missing ${name} in apps/worker/.dev.vars`);
    process.exit(1);
  }
  const r = spawnSync(
    "pnpm",
    ["exec", "wrangler", "secret", "put", name],
    {
      cwd: path.resolve(process.cwd(), "../apps/worker"),
      input: value,
      encoding: "utf8",
      stdio: ["pipe", "inherit", "inherit"],
    },
  );
  if (r.status !== 0) process.exit(r.status ?? 1);
}
console.error("wrote worker secrets");
