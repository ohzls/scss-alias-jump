#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const pkgPath = path.join(repoRoot, "package.json");
const lockPath = path.join(repoRoot, "package-lock.json");
const changelogPath = path.join(repoRoot, "CHANGELOG.md");

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

function run(command, args, options = {}) {
  const printable = [command, ...args].join(" ");
  console.log(`\n$ ${printable}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, ...(options.env ?? {}) },
  });

  if (result.error) die(`Failed to run ${command}: ${result.error.message}`);
  if (result.status !== 0) die(`Command failed (${result.status}): ${printable}`, result.status ?? 1);
}

function getArgValue(args, name) {
  const idx = args.indexOf(name);
  if (idx < 0) return null;
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) die(`Missing value for ${name}`);
  return value;
}

function hasArg(args, name) {
  return args.includes(name);
}

function printHelp() {
  console.log(`Usage: node ./scripts/publish.mjs [options]\n\nOptions:\n  --dry-run              Build and validate the VSIX, then print the publish step without publishing.\n  --out <path>           VSIX path to create/publish. Defaults to <name>-<version>.vsix.\n  --package-path <path>  Publish an existing VSIX instead of creating a new one.\n  --pat-env <name>       Environment variable containing the Marketplace PAT. Defaults to VSCE_PAT.\n  --skip-duplicate       Pass --skip-duplicate to vsce publish.\n  --pre-release          Pass --pre-release to vsce publish.\n  -h, --help             Show this help.\n\nThis script validates package metadata, ensures the current version has a CHANGELOG entry,\nbuilds the verified VSIX via scripts/bundle.mjs, then publishes that exact VSIX with\n'vsce publish --packagePath'. It never prints the PAT.`);
}

function validateReleaseMetadata(pkg) {
  if (!pkg.name) die("package.json missing name");
  if (!pkg.version) die("package.json missing version");
  if (!pkg.publisher) die("package.json missing publisher; Marketplace publish requires a publisher id");

  if (fs.existsSync(lockPath)) {
    const lock = readJson(lockPath);
    const lockVersion = lock.packages?.[""]?.version ?? lock.version;
    if (lockVersion !== pkg.version) {
      die(`package-lock.json version (${lockVersion}) does not match package.json version (${pkg.version})`);
    }
  }

  if (!fs.existsSync(changelogPath)) die("CHANGELOG.md not found");
  const changelog = fs.readFileSync(changelogPath, "utf8");
  const versionHeader = new RegExp(`^## \\[${pkg.version.replaceAll(".", "\\.")}\\] - \\d{4}-\\d{2}-\\d{2}`, "m");
  if (!versionHeader.test(changelog)) {
    die(`CHANGELOG.md missing dated section for ${pkg.version}`);
  }
}

const args = process.argv.slice(2);
if (hasArg(args, "-h") || hasArg(args, "--help")) {
  printHelp();
  process.exit(0);
}

const knownValueArgs = new Set(["--out", "--package-path", "--pat-env"]);
const knownBooleanArgs = new Set(["--dry-run", "--skip-duplicate", "--pre-release"]);
const unknown = args.filter((arg, idx) => {
  if (knownBooleanArgs.has(arg) || knownValueArgs.has(arg)) return false;
  if (idx > 0 && knownValueArgs.has(args[idx - 1])) return false;
  return arg.startsWith("-");
});
if (unknown.length > 0) die(`Unknown option(s): ${unknown.join(", ")}`);

const pkg = readJson(pkgPath);
validateReleaseMetadata(pkg);

const dryRun = hasArg(args, "--dry-run");
const skipDuplicate = hasArg(args, "--skip-duplicate");
const preRelease = hasArg(args, "--pre-release");
const patEnvName = getArgValue(args, "--pat-env") ?? "VSCE_PAT";
const packagePathArg = getArgValue(args, "--package-path");
const outArg = getArgValue(args, "--out");
const defaultVsix = path.join(repoRoot, `${pkg.name}-${pkg.version}.vsix`);
const vsixPath = path.resolve(repoRoot, packagePathArg ?? outArg ?? defaultVsix);

console.log(`Publishing ${pkg.publisher}.${pkg.name}@${pkg.version}`);
console.log(`VSIX: ${vsixPath}`);

if (packagePathArg) {
  if (!fs.existsSync(vsixPath)) die(`Existing VSIX not found: ${vsixPath}`);
} else {
  run(process.execPath, [path.join("scripts", "bundle.mjs"), "--out", vsixPath]);
}

if (!fs.existsSync(vsixPath)) die(`VSIX not found after bundle step: ${vsixPath}`);

const publishArgs = ["vsce", "publish", "--packagePath", vsixPath];
if (skipDuplicate) publishArgs.push("--skip-duplicate");
if (preRelease) publishArgs.push("--pre-release");

if (dryRun) {
  console.log("\nDry run complete. Publish command would be:");
  console.log(`  ${npxBin()} ${publishArgs.join(" ")}`);
  console.log(`  # with ${patEnvName}=<Marketplace PAT> in the environment`);
  process.exit(0);
}

const pat = process.env[patEnvName];
if (!pat) {
  die(`Missing ${patEnvName}. Create a Marketplace PAT and run with ${patEnvName}=<token>.`);
}

run(npxBin(), publishArgs, { env: { VSCE_PAT: pat } });
console.log(`\nPublished ${pkg.publisher}.${pkg.name}@${pkg.version} to the VS Code Marketplace.`);
