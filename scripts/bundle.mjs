#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const pkgPath = path.join(repoRoot, "package.json");

function die(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function npmBin() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function npxBin() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function run(command, args) {
  console.log(`\n$ ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    die(`Failed to run ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    die(`Command failed (${result.status}): ${[command, ...args].join(" ")}`, result.status ?? 1);
  }
}

function getArgValue(args, name) {
  const idx = args.indexOf(name);
  if (idx < 0) return null;
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) die(`Missing value for ${name}`);
  return value;
}

function printHelp() {
  console.log(`Usage: node ./scripts/bundle.mjs [options]\n\nOptions:\n  --out <path>          Output VSIX path. Defaults to <name>-<version>.vsix.\n  --install-cursor      Install the generated VSIX into Cursor after packaging.\n  --cursor-bin <cmd>    Cursor CLI command. Defaults to $CURSOR_BIN, macOS Cursor.app CLI, or cursor.\n  -h, --help            Show this help.\n\nThe script always runs compile, stability guard, vscode:prepublish, then vsce package.`);
}

const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) {
  printHelp();
  process.exit(0);
}

const unknown = args.filter((arg, idx) => {
  if (["--install-cursor"].includes(arg)) return false;
  if (["--out", "--cursor-bin"].includes(arg)) return false;
  if (idx > 0 && ["--out", "--cursor-bin"].includes(args[idx - 1])) return false;
  return arg.startsWith("-");
});
if (unknown.length > 0) die(`Unknown option(s): ${unknown.join(", ")}`);

const pkg = readJson(pkgPath);
if (!pkg.name || !pkg.version) die("package.json must include name and version");

const outArg = getArgValue(args, "--out");
const outPath = path.resolve(repoRoot, outArg ?? `${pkg.name}-${pkg.version}.vsix`);
const installCursor = args.includes("--install-cursor");
const cursorBinArg = getArgValue(args, "--cursor-bin") ?? process.env.CURSOR_BIN;
const cursorBin = cursorBinArg ?? (() => {
  const macAppCli = "/Applications/Cursor.app/Contents/Resources/app/bin/cursor";
  return fs.existsSync(macAppCli) ? macAppCli : "cursor";
})();

console.log(`Bundling ${pkg.name}@${pkg.version}`);
console.log(`Output: ${outPath}`);

run(npmBin(), ["run", "compile"]);
run(npmBin(), ["run", "verify:stability"]);
run(npmBin(), ["run", "vscode:prepublish"]);

if (fs.existsSync(outPath)) {
  fs.unlinkSync(outPath);
}

run(npxBin(), ["vsce", "package", "--out", outPath]);

if (!fs.existsSync(outPath)) {
  die(`VSIX was not created: ${outPath}`);
}

const stat = fs.statSync(outPath);
console.log(`\nCreated VSIX: ${outPath} (${stat.size.toLocaleString()} bytes)`);

if (installCursor) {
  run(cursorBin, ["--install-extension", outPath, "--force"]);
  console.log("\nInstalled into Cursor. Restart Cursor or reload the extension host if the old extension is still active.");
} else {
  console.log("\nInstall into Cursor with:");
  console.log(`  ${cursorBin} --install-extension ${outPath} --force`);
}
