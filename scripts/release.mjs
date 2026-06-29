#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd());
const pkgPath = path.join(repoRoot, "package.json");
const lockPath = path.join(repoRoot, "package-lock.json");
const constantsPath = path.join(repoRoot, "src", "constants.ts");
const changelogPath = path.join(repoRoot, "CHANGELOG.md");

function die(message) {
  console.error(message);
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assertSemver(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    die(`Invalid version "${version}" (expected x.y.z)`);
  }
}

function bump(version, kind) {
  assertSemver(version);
  let [major, minor, patch] = version.split(".").map((part) => Number(part));

  if (kind === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (kind === "minor") {
    minor += 1;
    patch = 0;
  } else if (kind === "patch") {
    patch += 1;
  } else {
    die(`Unknown bump kind: ${kind}`);
  }

  return `${major}.${minor}.${patch}`;
}

function localIsoDate() {
  const now = new Date();
  const yyyy = String(now.getFullYear()).padStart(4, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function preflightReleaseFiles() {
  if (fs.existsSync(lockPath)) readJson(lockPath);
  if (!fs.existsSync(constantsPath)) die("src/constants.ts not found");
  const constants = fs.readFileSync(constantsPath, "utf8");
  if (!/EXT_VERSION\s*=\s*"[^"]+"/.test(constants)) {
    die('src/constants.ts missing EXT_VERSION = "..."');
  }
  if (!fs.existsSync(changelogPath)) die("CHANGELOG.md not found");
  fs.readFileSync(changelogPath, "utf8");
}

function updatePackageVersion(nextVersion) {
  const pkg = readJson(pkgPath);
  const previousVersion = pkg.version;
  if (!previousVersion) die("package.json missing version");
  assertSemver(previousVersion);

  pkg.version = nextVersion;
  writeJson(pkgPath, pkg);
  return previousVersion;
}

function updatePackageLockVersion(nextVersion) {
  if (!fs.existsSync(lockPath)) return false;

  const lock = readJson(lockPath);
  lock.version = nextVersion;
  if (lock.packages?.[""]) {
    lock.packages[""].version = nextVersion;
  }
  writeJson(lockPath, lock);
  return true;
}

function updateExtensionConstantVersion(nextVersion) {
  if (!fs.existsSync(constantsPath)) die("src/constants.ts not found");

  const source = fs.readFileSync(constantsPath, "utf8");
  const updated = source.replace(
    /EXT_VERSION\s*=\s*"[^"]+"/,
    `EXT_VERSION = "${nextVersion}"`
  );
  if (updated === source) {
    die('src/constants.ts missing EXT_VERSION = "..."');
  }
  fs.writeFileSync(constantsPath, updated, "utf8");
}

function ensureChangelogEntry(nextVersion) {
  if (!fs.existsSync(changelogPath)) die("CHANGELOG.md not found");

  const changelog = fs.readFileSync(changelogPath, "utf8");
  const escapedVersion = nextVersion.replaceAll(".", "\\.");
  const existingHeader = new RegExp(`^## \\[${escapedVersion}\\] - \\d{4}-\\d{2}-\\d{2}`, "m");
  if (existingHeader.test(changelog)) return false;

  const entry =
    `## [${nextVersion}] - ${localIsoDate()}\n\n` +
    "### Changed\n" +
    `- Prepared release metadata for ${nextVersion}.\n\n`;

  const firstRelease = /^## \[\d+\.\d+\.\d+\] - \d{4}-\d{2}-\d{2}/m.exec(changelog);
  if (firstRelease?.index != null) {
    const updated = `${changelog.slice(0, firstRelease.index)}${entry}${changelog.slice(firstRelease.index)}`;
    fs.writeFileSync(changelogPath, updated, "utf8");
    return true;
  }

  const trimmed = changelog.trimEnd();
  fs.writeFileSync(changelogPath, `${trimmed}\n\n${entry}`, "utf8");
  return true;
}

function printHelp() {
  console.log("Usage: node ./scripts/release.mjs <patch|minor|major|set> [version]");
  console.log("");
  console.log("Updates package.json, package-lock.json, src/constants.ts, and CHANGELOG.md together.");
  console.log("After running, replace the generated CHANGELOG note with release-specific details before publishing.");
}

const kind = process.argv[2];
if (!kind || kind === "-h" || kind === "--help") {
  printHelp();
  process.exit(kind ? 0 : 1);
}

const current = readJson(pkgPath).version;
if (!current) die("package.json missing version");

let next = current;
if (kind === "set") {
  next = process.argv[3];
  if (!next) die("Usage: node ./scripts/release.mjs set <version>");
  assertSemver(next);
} else {
  next = bump(current, kind);
}

preflightReleaseFiles();

const previous = updatePackageVersion(next);
const lockUpdated = updatePackageLockVersion(next);
updateExtensionConstantVersion(next);
const changelogAdded = ensureChangelogEntry(next);

console.log(`Version metadata updated: ${previous} -> ${next}`);
console.log(`- package-lock.json: ${lockUpdated ? "updated" : "not present"}`);
console.log(`- src/constants.ts: updated`);
console.log(`- CHANGELOG.md: ${changelogAdded ? "added dated section" : "section already existed"}`);
