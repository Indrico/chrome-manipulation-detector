import { spawnSync } from "node:child_process";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const groq = process.argv[2] === "--groq";
const origin = groq ? "http://127.0.0.1:18767" : "http://127.0.0.1:18766";
const build = ".output/online-test/chrome-mv3";
const fixture = ".output/online-test/permission-fixture";
const env = {
  ...process.env,
  MD_ONLINE_ORIGIN: groq ? "" : origin,
  MD_GROQ_TEST_ORIGIN: groq ? origin : "",
  MD_ONLINE_TEST: "1",
  MD_ONLINE_E2E_ORIGIN: groq ? "" : origin,
  MD_GROQ_E2E_ORIGIN: groq ? origin : "",
  MD_ONLINE_E2E_UNGRANTED: build,
  MD_EXTENSION_PATH: fixture,
};

function npm(...args) {
  const run = spawnSync(process.execPath, [process.env.npm_execpath, ...args], {
    env,
    stdio: "inherit",
  });
  if (run.status !== 0) process.exit(run.status ?? 1);
}

npm("run", "build");
const manifest = JSON.parse(readFileSync(join(build, "manifest.json"), "utf8"));
if (
  manifest.host_permissions ||
  manifest.optional_host_permissions?.join() !== "http://127.0.0.1/*"
)
  throw new Error("Unexpected online build permissions");
// Playwright cannot answer the native Chrome permission prompt. Grant only the loopback
// origin in an isolated fixture copy so the normal opt-in and traffic are still exercised.
cpSync(build, fixture, { recursive: true });
manifest.host_permissions = manifest.optional_host_permissions;
delete manifest.optional_host_permissions;
writeFileSync(join(fixture, "manifest.json"), JSON.stringify(manifest));
npm(
  "run",
  "test:e2e",
  "--",
  groq ? "x-groq.spec.ts" : "x-online.spec.ts",
  ...process.argv.slice(groq ? 3 : 2),
);
