import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd());
const pkgPath = path.join(repoRoot, "package.json");
const readmePath = path.join(repoRoot, "README.md");

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function bump(version, kind) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) die(`Invalid version "${version}" (expected x.y.z)`);
  let [maj, min, pat] = m.slice(1).map((n) => Number(n));
  if (kind === "major") {
    maj += 1;
    min = 0;
    pat = 0;
  } else if (kind === "minor") {
    min += 1;
    pat = 0;
  } else if (kind === "patch") {
    pat += 1;
  } else {
    die(`Unknown bump kind: ${kind}`);
  }
  return `${maj}.${min}.${pat}`;
}

function ensureHistoryEntry(readme, version) {
  const header = "### History";
  const idx = readme.indexOf(header);
  if (idx < 0) die(`README.md missing "${header}" section`);

  const afterHeaderIdx = idx + header.length;
  const rest = readme.slice(afterHeaderIdx);

  const entryRe = new RegExp(`\\n- \\*\\*${version.replaceAll(".", "\\.")}\\*\\*\\n`);
  if (entryRe.test(readme)) return readme; // already exists

  // Insert new entry at the top of History list (right after the header block).
  // We keep it minimal; you can fill details manually after.
  const insertion = `\n\n- **${version}**\n  - (fill)\n`;

  // If the section already has blank lines, normalize to one insertion point.
  const restTrimmed = rest.startsWith("\n") ? rest.slice(1) : rest;
  return readme.slice(0, afterHeaderIdx) + insertion + "\n" + restTrimmed;
}

const kind = process.argv[2];
if (!kind) {
  die("Usage: node ./scripts/release.mjs <patch|minor|major|set> [version]");
}

const pkg = readJson(pkgPath);
const prev = pkg.version;
if (!prev) die("package.json missing version");

let next = prev;
if (kind === "set") {
  const v = process.argv[3];
  if (!v) die("Usage: node ./scripts/release.mjs set <version>");
  next = v;
} else {
  next = bump(prev, kind);
}

pkg.version = next;
writeJson(pkgPath, pkg);

if (!fs.existsSync(readmePath)) die("README.md not found");
const readme = fs.readFileSync(readmePath, "utf8");
const updated = ensureHistoryEntry(readme, next);
fs.writeFileSync(readmePath, updated, "utf8");

console.log(`Version bumped: ${prev} -> ${next}`);
