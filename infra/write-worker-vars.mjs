#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const out = path.resolve(process.cwd(), "../apps/worker/.dev.vars");

function aws(args) {
  const r = spawnSync("aws", args, { encoding: "utf8" });
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", status: r.status ?? 1 };
}

mkdirSync(path.dirname(out), { recursive: true });
const listed = aws(["iam", "list-access-keys", "--user-name", "gh-worker"]);
if (listed.status !== 0) {
  console.error(listed.stderr);
  process.exit(1);
}
const keys = JSON.parse(listed.stdout);
if (keys.AccessKeyMetadata.length >= 2) {
  console.error("gh-worker already has two access keys; write .dev.vars by hand");
  process.exit(1);
}
const created = aws(["iam", "create-access-key", "--user-name", "gh-worker"]);
if (created.status !== 0) {
  console.error(created.stderr);
  process.exit(1);
}
const payload = JSON.parse(created.stdout);
writeFileSync(
  out,
  `AWS_ACCESS_KEY_ID=${payload.AccessKey.AccessKeyId}\nAWS_SECRET_ACCESS_KEY=${payload.AccessKey.SecretAccessKey}\n`,
  { mode: 0o600 },
);
console.error("wrote apps/worker/.dev.vars");
