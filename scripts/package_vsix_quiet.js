/* eslint-disable no-console */
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      ...opts,
    });

    let out = "";
    let err = "";

    p.stdout.on("data", (d) => (out += d.toString("utf8")));
    p.stderr.on("data", (d) => (err += d.toString("utf8")));

    p.on("error", reject);
    p.on("close", (code) => {
      resolve({ code, out, err });
    });
  });
}

function filterNodeWarnings(s) {
  // Keep vsce output; remove Node runtime warnings that are noisy under Node 24+
  const lines = s.split(/\r?\n/);
  const drop = [
    "DeprecationWarning:",
    "ExperimentalWarning:",
    "[DEP",
    "Use `node --trace-warnings`",
    "Use `node --trace-deprecation`",
  ];
  return lines
    .filter((ln) => !drop.some((k) => ln.includes(k)))
    .join("\n")
    .trim();
}

async function main() {
  const cwd = process.cwd();

  // 1) Ensure dist/extension.js exists
  const pre = await run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "vscode:prepublish"], { cwd });
  if (pre.code !== 0) {
    console.error(pre.out);
    console.error(pre.err);
    process.exit(pre.code || 1);
  }

  // 2) Run vsce (local bin)
  const vsceBin = process.platform === "win32"
    ? path.join(cwd, "node_modules", ".bin", "vsce.cmd")
    : path.join(cwd, "node_modules", ".bin", "vsce");

  if (!fs.existsSync(vsceBin)) {
    console.error("vsce binary not found. Run `npm ci` first (devDependencies include @vscode/vsce).");
    process.exit(2);
  }

  const env = { ...process.env, NODE_NO_WARNINGS: "1" };
  const res = await run(vsceBin, ["package", "--no-dependencies"], { cwd, env });

  const out = filterNodeWarnings(res.out);
  const err = filterNodeWarnings(res.err);

  if (out) console.log(out);
  if (err) console.error(err);

  if (res.code !== 0) {
    process.exit(res.code);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
