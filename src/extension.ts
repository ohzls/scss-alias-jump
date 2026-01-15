import * as vscode from "vscode";
import * as path from "path";

type AliasMap = Record<string, string>;

const USE_FORWARD_IMPORT_RE = /@(use|forward|import)\s+(['"])([^'"]+)\2/g;
const EXTEND_PLACEHOLDER_RE = /@extend\s+%([A-Za-z0-9_-]+)\b/g;

let out: vscode.OutputChannel | null = null;
const OPEN_EXTEND_PLACEHOLDER_CMD = "scss-alias-jump.openExtendPlaceholder";
const SHOW_PLACEHOLDER_EXTENDS_CMD = "scss-alias-jump.showPlaceholderExtends";
const OPEN_LOCATION_CMD = "scss-alias-jump.openLocation";

function getAliases(): AliasMap {
  const cfg = vscode.workspace.getConfiguration();
  return (cfg.get("scssAliasJump.aliases") as AliasMap) || {};
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getWorkspaceFolderFsPathFor(
  uri: vscode.Uri,
  name?: string
): string | null {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return null;

  if (name) {
    const byName = folders.find((f) => f.name === name);
    if (byName) return byName.uri.fsPath;
  }

  const byUri = vscode.workspace.getWorkspaceFolder(uri);
  if (byUri) return byUri.uri.fsPath;

  return folders[0].uri.fsPath;
}

function expandVars(p: string, uriForWorkspace: vscode.Uri): string {
  // VS Code settings do NOT reliably expand ${workspaceFolder:<name>} for us,
  // so we do it ourselves.
  // Supported:
  // - ${workspaceFolder}
  // - ${workspaceFolder:folderName}
  return p.replace(
    /\$\{workspaceFolder(?::([^}]+))?\}/g,
    (_full, name: string | undefined) => {
      const ws = getWorkspaceFolderFsPathFor(uriForWorkspace, name);
      return ws ?? _full;
    }
  );
}

function isFileUri(u: vscode.Uri) {
  return u.scheme === "file";
}

async function fileExists(fsPath: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(fsPath));
    return true;
  } catch {
    return false;
  }
}

function ensureNoExt(p: string) {
  return p.replace(/\.(scss|sass|css)$/i, "");
}

function toFsPath(p: string) {
  return p.replace(/\\/g, "/");
}

async function resolveSassPath(basePathNoExt: string): Promise<string | null> {
  // basePathNoExt: absolute path without extension
  const dir = path.dirname(basePathNoExt);
  const name = path.basename(basePathNoExt);

  const candidates: string[] = [
    // exact + extensions
    `${basePathNoExt}.scss`,
    `${basePathNoExt}.sass`,
    `${basePathNoExt}.css`,

    // partial _name + extensions
    path.join(dir, `_${name}.scss`),
    path.join(dir, `_${name}.sass`),
    path.join(dir, `_${name}.css`),

    // folder index
    path.join(basePathNoExt, `index.scss`),
    path.join(basePathNoExt, `index.sass`),
    path.join(basePathNoExt, `index.css`),
    path.join(basePathNoExt, `_index.scss`),
    path.join(basePathNoExt, `_index.sass`),
    path.join(basePathNoExt, `_index.css`),
  ];

  for (const c of candidates) {
    if (await fileExists(c)) return c;
  }
  return null;
}

async function readTextFile(uri: vscode.Uri): Promise<string | null> {
  try {
    const buf = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(buf).toString("utf8");
  } catch {
    return null;
  }
}

function countChar(s: string, ch: string) {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s[i] === ch) n++;
  return n;
}

function braceDelta(line: string) {
  // Heuristic: ignore braces after '//' comment start
  const idx = line.indexOf("//");
  const s = idx >= 0 ? line.slice(0, idx) : line;
  return countChar(s, "{") - countChar(s, "}");
}

function tokenBoundaryOk(line: string, idx: number, tokenLen: number) {
  const before = idx === 0 ? "" : line[idx - 1];
  if (before && /[A-Za-z0-9_-]/.test(before)) return false;

  const after = line[idx + tokenLen] ?? "";
  if (after && /[A-Za-z0-9_-]/.test(after)) return false;

  return true;
}

function hasBraceSoon(lines: string[], fromLine: number, tokenEndCh: number) {
  const line = lines[fromLine] ?? "";
  const rest = line.slice(tokenEndCh);
  if (rest.includes("{")) return true;

  for (let j = fromLine + 1; j < Math.min(fromLine + 6, lines.length); j++) {
    const n = (lines[j] ?? "").trim();
    if (n.length === 0) continue;
    return n.includes("{");
  }

  return false;
}

function getPlaceholderNameUnderCursor(
  document: vscode.TextDocument,
  position: vscode.Position
): string | null {
  // Ignore tokens inside line comments.
  const lineText = document.lineAt(position.line).text;
  const commentIdx = lineText.indexOf("//");
  if (commentIdx >= 0 && position.character >= commentIdx) return null;

  const pctRange = document.getWordRangeAtPosition(position, /%[A-Za-z0-9_-]+/);
  if (pctRange) {
    const t = document.getText(pctRange);
    if (t.startsWith("%") && t.length > 1) return t.slice(1);
  }
  return null;
}

function getAmpSegmentUnderCursor(
  document: vscode.TextDocument,
  position: vscode.Position
): string | null {
  // Ignore tokens inside line comments.
  const lineText = document.lineAt(position.line).text;
  const commentIdx = lineText.indexOf("//");
  if (commentIdx >= 0 && position.character >= commentIdx) return null;

  const r = document.getWordRangeAtPosition(position, /&[A-Za-z0-9_-]+/);
  if (!r) return null;
  const t = document.getText(r);
  if (t.startsWith("&") && t.length > 1) return t.slice(1);
  return null;
}

function getNamespacedVarRefUnderCursor(
  document: vscode.TextDocument,
  position: vscode.Position
): { namespace: string; varName: string; range: vscode.Range } | null {
  const lineText = document.lineAt(position.line).text;
  const commentIdx = lineText.indexOf("//");
  if (commentIdx >= 0 && position.character >= commentIdx) return null;

  const range = document.getWordRangeAtPosition(
    position,
    /[A-Za-z0-9_-]+\.\$[A-Za-z0-9_-]+/
  );
  if (!range) return null;
  const t = document.getText(range);
  const m = /^([A-Za-z0-9_-]+)\.\$([A-Za-z0-9_-]+)$/.exec(t);
  if (!m) return null;
  return { namespace: m[1], varName: m[2], range };
}

function deriveDefaultNamespace(importPath: string) {
  // Sass default namespace = basename without leading underscore and without extension.
  const p = ensureNoExt(importPath.trim());
  const base = path.posix.basename(p);
  return base.replace(/^_/, "");
}

function parseUseNamespaceMap(text: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = text.split(/\r?\n/);
  // @use 'path' as name;
  // @use "path";
  // @use 'path' as *;
  const re = /@use\s+(['"])([^'"]+)\1(?:\s+as\s+([A-Za-z0-9_-]+|\*))?/;

  for (const raw of lines) {
    const cut = firstNonCommentIdx(raw);
    const line = raw.slice(0, cut);
    if (!line.includes("@use")) continue;
    const m = re.exec(line);
    if (!m) continue;
    const importPath = m[2];
    const asName = m[3];
    if (asName === "*") continue;
    const ns = asName && asName.length > 0 ? asName : deriveDefaultNamespace(importPath);
    map.set(ns, importPath);
  }
  return map;
}

async function resolveSassModuleFromUse(
  importPath: string,
  fromDoc: vscode.TextDocument
): Promise<vscode.Uri | null> {
  const aliases = getAliases();
  const abs = resolveAliasToAbsolute(importPath, fromDoc.uri.fsPath, aliases, fromDoc.uri);
  if (!abs) return null;
  const resolved = await resolveSassPath(ensureNoExt(abs));
  if (!resolved) return null;
  return vscode.Uri.file(resolved);
}

async function findVariableDefinitionInModule(
  moduleUri: vscode.Uri,
  varName: string,
  visited: Set<string>
): Promise<vscode.Location | null> {
  const key = moduleUri.toString();
  if (visited.has(key)) return null;
  visited.add(key);

  const text = await readTextFile(moduleUri);
  if (!text) return null;

  // 1) Direct variable definition
  const re = new RegExp(`\\$${escapeRegExp(varName)}\\s*:`);
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const cut = firstNonCommentIdx(raw);
    const line = raw.slice(0, cut);
    if (!line.includes(`$${varName}`)) continue;
    const idx = line.search(re);
    if (idx < 0) continue;
    return new vscode.Location(moduleUri, new vscode.Position(i, idx));
  }

  // 2) Follow @forward chain (common in variables modules)
  const forwardRe = /@forward\s+(['"])([^'"]+)\1/g;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const cut = firstNonCommentIdx(raw);
    const line = raw.slice(0, cut);
    if (!line.includes("@forward")) continue;

    forwardRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = forwardRe.exec(line))) {
      const importPath = m[2];
      const aliases = getAliases();
      const abs = resolveAliasToAbsolute(importPath, moduleUri.fsPath, aliases, moduleUri);
      if (!abs) continue;
      const resolved = await resolveSassPath(ensureNoExt(abs));
      if (!resolved) continue;
      const nextUri = vscode.Uri.file(resolved);
      const hit = await findVariableDefinitionInModule(nextUri, varName, visited);
      if (hit) return hit;
    }
  }

  return null;
}

function findNearestEnclosingPlaceholderOpenLine(
  lines: string[],
  atLine: number
): { name: string; openLine: number } | null {
  const re = /%([A-Za-z0-9_-]+)/g;
  for (let i = atLine; i >= 0; i--) {
    const line = lines[i] ?? "";
    if (line.includes("@extend")) continue;
    re.lastIndex = 0;
    const m = re.exec(line);
    if (!m) continue;
    const name = m[1];
    const idx = m.index;
    const token = `%${name}`;
    // Ensure this looks like a definition selector line
    if (!tokenBoundaryOk(line, idx, token.length)) continue;
    if (!hasBraceSoon(lines, i, idx + token.length)) continue;

    // Ensure we're inside its block at atLine by tracking braces from the opening brace line
    const braceLine = findOpeningBraceLine(lines, i, 8);
    if (braceLine == null) continue;
    let depth = 0;
    for (let j = braceLine; j <= atLine; j++) {
      depth += braceDelta(lines[j] ?? "");
      if (j === braceLine && depth <= 0) {
        // one-liner block, doesn't enclose anything beyond
        break;
      }
    }
    if (depth > 0) return { name, openLine: braceLine };
  }
  return null;
}

function inferNestedPlaceholderNameAtLine(
  lines: string[],
  lineNo: number
): string | null {
  const base = findNearestEnclosingPlaceholderOpenLine(lines, lineNo);
  if (!base) return null;

  // Walk from base.openLine to lineNo and track nested & blocks by brace depth.
  // This is heuristic but works well for the common style:
  // %chat { &__input { &-docker { ... } } }
  let relDepth = 0;
  const segStack: Array<{ seg: string; depth: number }> = [];
  const ampRe = /&[A-Za-z0-9_-]+/;

  for (let i = base.openLine; i <= lineNo; i++) {
    const line = lines[i] ?? "";
    const depthBefore = relDepth;

    // Pop segments when we leave their depth (after processing previous line's closings)
    while (segStack.length > 0 && depthBefore < segStack[segStack.length - 1].depth) {
      segStack.pop();
    }

    if (i !== base.openLine && depthBefore >= 1) {
      const m = ampRe.exec(line);
      if (m) {
        const seg = m[0].slice(1);
        // Only treat as a nested selector if it actually opens a block (same line).
        // (If brace is on next line, we keep it simple and skip.)
        if (line.includes("{")) {
          // Assume 1-level open for this selector line.
          segStack.push({ seg, depth: depthBefore + 1 });
        }
      }
    }

    relDepth += braceDelta(line);
  }

  const suffix = segStack.map((s) => s.seg).join("");
  return `${base.name}${suffix}`;
}

function inferPlaceholderNameFromOpenStack(
  lines: string[],
  lineNo: number
): string | null {
  // Build a stack of currently-open selector blocks up to `lineNo`,
  // then compose placeholder name as:
  //   %<base> + (& segments after base, without '&', concatenated)
  let depth = 0;
  const stack: Array<{ text: string; depth: number; line: number }> = [];

  for (let i = 0; i <= lineNo; i++) {
    const lineRaw = lines[i] ?? "";
    const cut = firstNonCommentIdx(lineRaw);
    const line = lineRaw.slice(0, cut);
    const depthBefore = depth;

    const braceIdx = line.indexOf("{");
    if (braceIdx >= 0) {
      const sel = line.slice(0, braceIdx).trim();
      if (sel.length > 0) {
        stack.push({ text: sel, depth: depthBefore + 1, line: i });
      }
    }

    depth += braceDelta(lineRaw);
    while (stack.length > 0 && stack[stack.length - 1].depth > depth) stack.pop();
  }

  // Find the innermost placeholder base in the open stack.
  let baseIdx = -1;
  let baseName: string | null = null;
  for (let i = stack.length - 1; i >= 0; i--) {
    const t = stack[i]?.text ?? "";
    const m = /%([A-Za-z0-9_-]+)/.exec(t);
    if (m) {
      baseIdx = i;
      baseName = m[1];
      break;
    }
  }
  if (!baseName) return null;

  const ampRe = /&[A-Za-z0-9_-]+/;
  const suffixParts: string[] = [];
  for (let i = baseIdx + 1; i < stack.length; i++) {
    const t = stack[i]?.text ?? "";
    const m = ampRe.exec(t);
    if (m) suffixParts.push(m[0].slice(1));
  }

  return `${baseName}${suffixParts.join("")}`;
}

type ExtendRef = {
  uri: vscode.Uri;
  pos: vscode.Position;
  containerText: string | null;
  containerLine: number | null;
};

type ExtendRefsCacheEntry2 = { ts: number; refs: ExtendRef[] };
const extendRefsCache2 = new Map<string, ExtendRefsCacheEntry2>();

function firstNonCommentIdx(line: string) {
  const idx = line.indexOf("//");
  return idx >= 0 ? idx : line.length;
}

function pickContainer(stack: Array<{ text: string; depth: number; line: number }>) {
  // Prefer the innermost non at-rule selector; fallback to the innermost item.
  for (let i = stack.length - 1; i >= 0; i--) {
    const t = stack[i]?.text?.trim() ?? "";
    if (t.length === 0) continue;
    if (!t.startsWith("@")) return stack[i];
  }
  return stack.length > 0 ? stack[stack.length - 1] : null;
}

function scanExtendRefsInText(
  uri: vscode.Uri,
  text: string,
  placeholderName: string
): ExtendRef[] {
  const refs: ExtendRef[] = [];
  // NOTE: We do NOT use `\\b` here because '-' is not a "word" character, so
  // `%chat__sources` would incorrectly match `%chat__sources--overlay`.
  // We want an identifier boundary where next char is NOT [A-Za-z0-9_-].
  const re = new RegExp(
    `@extend\\s+%${escapeRegExp(placeholderName)}(?![A-Za-z0-9_-])`,
    "g"
  );
  const token = `%${placeholderName}`;

  // Track nested blocks to infer "which selector block contains this @extend"
  let depth = 0;
  const stack: Array<{ text: string; depth: number; line: number }> = [];

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const lineRaw = lines[i] ?? "";
    const cut = firstNonCommentIdx(lineRaw);
    const line = lineRaw.slice(0, cut);
    const depthBefore = depth;

    // 1) collect @extend matches (based on current container stack)
    if (line.includes("@extend") && line.includes(token)) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line))) {
        const container = pickContainer(stack);
        refs.push({
          uri,
          pos: new vscode.Position(i, m.index),
          containerText: container?.text ?? null,
          containerLine: container?.line ?? null,
        });
      }
    }

    // 2) push selector blocks that open here (heuristic)
    const braceIdx = line.indexOf("{");
    if (braceIdx >= 0) {
      const sel = line.slice(0, braceIdx).trim();
      if (sel.length > 0) {
        // We record the depth *inside* this new block.
        stack.push({ text: sel, depth: depthBefore + 1, line: i });
      }
    }

    depth += braceDelta(lineRaw);
    while (stack.length > 0 && stack[stack.length - 1].depth > depth) stack.pop();
    if (refs.length >= 200) break;
  }

  return refs;
}

async function findExtendReferences(
  placeholderName: string
): Promise<ExtendRef[]> {
  const key = placeholderName;
  const cached = extendRefsCache2.get(key);
  const now = Date.now();
  if (cached && now - cached.ts < 1500) return cached.refs;

  const files = await vscode.workspace.findFiles(
    "**/*.{scss,sass}",
    "**/{node_modules,dist,build}/**"
  );

  const refs: ExtendRef[] = [];

  // Scan each file line-by-line so we can return stable (line, ch) positions + container selector.
  for (const file of files) {
    const text = await readTextFile(file);
    if (!text) continue;
    if (!text.includes("@extend") || !text.includes(`%${placeholderName}`)) continue;

    const found = scanExtendRefsInText(file, text, placeholderName);
    for (const r of found) {
      refs.push(r);
      if (refs.length >= 200) break;
    }
    if (refs.length >= 200) break;
  }

  extendRefsCache2.set(key, { ts: now, refs });
  return refs;
}

function findDirectPlaceholderDefinitionOnLine(
  lines: string[],
  lineNo: number,
  token: string
): { line: number; ch: number } | null {
  const line = lines[lineNo] ?? "";
  if (!line.includes(token)) return null;
  if (line.includes("@extend")) return null;

  const idx = line.indexOf(token);
  if (idx < 0) return null;
  if (!tokenBoundaryOk(line, idx, token.length)) return null;
  if (!hasBraceSoon(lines, lineNo, idx + token.length)) return null;

  return { line: lineNo, ch: idx };
}

function findOpeningBraceLine(
  lines: string[],
  fromLine: number,
  lookaheadLines = 8
): number | null {
  for (let i = fromLine; i < Math.min(lines.length, fromLine + lookaheadLines); i++) {
    if (lines[i].includes("{")) return i;
  }
  return null;
}

function findBlockEndLine(lines: string[], openLine: number): number {
  // Returns the inclusive end line index where depth returns to 0.
  let depth = 0;
  for (let i = openLine; i < lines.length; i++) {
    depth += braceDelta(lines[i]);
    // We only consider block started once we saw at least one '{'
    if (i === openLine && depth <= 0) {
      // One-liner like "... { ... }"
      return i;
    }
    if (i > openLine && depth <= 0) return i;
  }
  return lines.length - 1;
}

function splitPlaceholderName(placeholderName: string): {
  root: string;
  parts: string[]; // parts include separators, e.g. ["__result","-list","__dt"]
} {
  const seps = ["__", "--", "_", "-"] as const;

  const findNextSep = (s: string, from: number) => {
    let bestIdx = -1;
    let bestSep: (typeof seps)[number] | null = null;
    for (const sep of seps) {
      const idx = s.indexOf(sep, from);
      if (idx === -1) continue;
      if (bestIdx === -1 || idx < bestIdx || (idx === bestIdx && sep.length > (bestSep?.length ?? 0))) {
        bestIdx = idx;
        bestSep = sep;
      }
    }
    return { idx: bestIdx, sep: bestSep };
  };

  const first = findNextSep(placeholderName, 1);
  if (first.idx === -1 || !first.sep) {
    return { root: placeholderName, parts: [] };
  }

  const root = placeholderName.slice(0, first.idx);
  const parts: string[] = [];
  let pos = first.idx;
  while (pos < placeholderName.length) {
    const { idx, sep } = findNextSep(placeholderName, pos);
    if (idx !== pos || !sep) break;
    pos += sep.length;

    const next = findNextSep(placeholderName, pos);
    const end = next.idx === -1 ? placeholderName.length : next.idx;
    const seg = placeholderName.slice(pos, end);
    parts.push(sep + seg);
    pos = end;
  }

  return { root, parts };
}

function buildPrefixCandidates(root: string, parts: string[]) {
  // Returns prefix names at each boundary: root, root+parts[0], root+parts[0]+parts[1], ...
  const out: Array<{ prefix: string; usedParts: number }> = [];
  let acc = root;
  out.push({ prefix: acc, usedParts: 0 });
  for (let i = 0; i < parts.length; i++) {
    acc += parts[i];
    out.push({ prefix: acc, usedParts: i + 1 });
  }
  // Prefer longer prefix first (more specific)
  return out.sort((a, b) => b.usedParts - a.usedParts);
}

function findNestedChainInBlock(
  lines: string[],
  blockOpenLine: number,
  blockEndLine: number,
  remainingParts: string[]
): { line: number; ch: number } | null {
  if (remainingParts.length === 0) return null;

  const buildNeedles = (parts: string[]) => {
    // Allow merged parts on a single selector line, e.g.
    // remainingParts ["__input","-dock"] can appear as "&__input-dock { ... }"
    // Try longest merged needle first.
    const out: Array<{ needle: string; consume: number }> = [];
    for (let k = parts.length; k >= 1; k--) {
      out.push({ needle: `&${parts.slice(0, k).join("")}`, consume: k });
    }
    return out;
  };

  // We only consider selectors at the "top-level" inside this block.
  // We'll walk and track relative depth; when depthBefore === 1, we're at top-level inside the block.
  let depth = 0;
  for (let i = blockOpenLine; i <= blockEndLine; i++) {
    const depthBefore = depth;
    const line = lines[i] ?? "";

    if (i === blockOpenLine) {
      depth += braceDelta(line);
      continue;
    }

    if (depthBefore === 1) {
      for (const cand of buildNeedles(remainingParts)) {
        const hitAt = line.indexOf(cand.needle);
        if (hitAt < 0) continue;

        const openJ = findOpeningBraceLine(lines, i, 6);
        if (openJ == null || openJ > blockEndLine) continue;

        const nestedEnd = findBlockEndLine(lines, openJ);
        if (cand.consume === remainingParts.length) return { line: i, ch: hitAt };

        const deeper = findNestedChainInBlock(
          lines,
          openJ,
          Math.min(nestedEnd, blockEndLine),
          remainingParts.slice(cand.consume)
        );
        if (deeper) return deeper;
      }
    }

    depth += braceDelta(line);
  }

  return null;
}

function getWorkspaceFoldersInSearchOrder(
  forUri: vscode.Uri
): readonly vscode.WorkspaceFolder[] {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length <= 1) return folders;

  const primary = vscode.workspace.getWorkspaceFolder(forUri);
  if (!primary) return folders;

  return [primary, ...folders.filter((f) => f.uri.toString() !== primary.uri.toString())];
}

async function findPlaceholderDefinitions(
  placeholderName: string,
  forUri: vscode.Uri
): Promise<vscode.Location[]> {
  const folders = getWorkspaceFoldersInSearchOrder(forUri);
  const token = `%${placeholderName}`;
  const hitKey = (loc: vscode.Location) =>
    `${loc.uri.toString()}::${loc.range.start.line}:${loc.range.start.character}`;
  const hits: vscode.Location[] = [];
  const seen = new Set<string>();

  const filesCache = new Map<string, readonly vscode.Uri[]>();
  const textCache = new Map<string, string | null>();

  const listFiles = async (folder: vscode.WorkspaceFolder) => {
    const key = folder.uri.toString();
    const cached = filesCache.get(key);
    if (cached) return cached;
    const pattern = new vscode.RelativePattern(folder, "**/*.{scss,sass}");
    const files = await vscode.workspace.findFiles(
      pattern,
      "**/{node_modules,dist,build}/**"
    );
    filesCache.set(key, files);
    return files;
  };

  const getText = async (file: vscode.Uri) => {
    const key = file.toString();
    if (textCache.has(key)) return textCache.get(key) ?? null;
    const t = await readTextFile(file);
    textCache.set(key, t);
    return t;
  };

  const pushHit = (loc: vscode.Location) => {
    const k = hitKey(loc);
    if (seen.has(k)) return;
    seen.add(k);
    hits.push(loc);
  };

  // Heuristic: placeholder definition appears in selector context, not in @extend lines.
  // We'll accept lines that contain the token and are followed by "{" (same line or next non-empty line).
  for (const folder of folders) {
    const files = await listFiles(folder);

    for (const file of files) {
      const text = await getText(file);
      if (!text || !text.includes(token)) continue;

      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const direct = findDirectPlaceholderDefinitionOnLine(lines, i, token);
        if (!direct) continue;
        pushHit(new vscode.Location(file, new vscode.Position(direct.line, direct.ch)));
      }
    }
  }

  // 2) Nested placeholder definition by walking "&..." blocks recursively, e.g.
  // %chat { &__result { &-list { &__dt { ... }}}}
  const split = splitPlaceholderName(placeholderName);
  const prefixes = buildPrefixCandidates(split.root, split.parts);

  for (const folder of folders) {
    const files = await listFiles(folder);

    for (const file of files) {
      const text = await getText(file);
      if (!text) continue;

      // Quick filter: file must contain at least one prefix token.
      if (!prefixes.some((p) => text.includes(`%${p.prefix}`))) continue;

      const lines = text.split(/\r?\n/);
      for (const pref of prefixes) {
        const baseToken = `%${pref.prefix}`;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!line.includes(baseToken)) continue;
          if (line.includes("@extend")) continue;

          const idx = line.indexOf(baseToken);
          if (idx < 0) continue;
          if (!tokenBoundaryOk(line, idx, baseToken.length)) continue;

          const braceLine = findOpeningBraceLine(lines, i);
          if (braceLine == null) continue;
          const endLine = findBlockEndLine(lines, braceLine);

          const remaining = split.parts.slice(pref.usedParts);
          const found = findNestedChainInBlock(lines, braceLine, endLine, remaining);
          if (found) {
            pushHit(new vscode.Location(file, new vscode.Position(found.line, found.ch)));
          }
        }
      }
    }
  }

  // 3) Fallback: if exact/nested didn't resolve (common for interpolation like &-#{$k}),
  // jump to the nearest "family" placeholder definition, e.g. %inner-padding-max -> %inner-padding
  if (hits.length === 0) {
    const shorterPrefixes = prefixes
      .filter((p) => p.usedParts < split.parts.length)
      .sort((a, b) => b.usedParts - a.usedParts);

    for (const pref of shorterPrefixes) {
      const baseToken = `%${pref.prefix}`;
      for (const folder of folders) {
        const files = await listFiles(folder);
        for (const file of files) {
          const text = await getText(file);
          if (!text || !text.includes(baseToken)) continue;
          const lines = text.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            const direct = findDirectPlaceholderDefinitionOnLine(lines, i, baseToken);
            if (!direct) continue;
            out?.appendLine(
              `[fallback] @extend %${placeholderName} -> %${pref.prefix} @ ${file.fsPath}:${direct.line + 1}`
            );
            return [new vscode.Location(file, new vscode.Position(direct.line, direct.ch))];
          }
        }
      }
    }

    // 4) Fallback: placeholder defined with interpolation, e.g. %inner-padding-#{$k} { ... }
    for (const pref of shorterPrefixes) {
      const re = new RegExp(`%${escapeRegExp(pref.prefix)}(?:__|--|_|-)?#\\{`, "g");
      for (const folder of folders) {
        const files = await listFiles(folder);
        for (const file of files) {
          const text = await getText(file);
          if (!text || !re.test(text)) continue;
          const lines = text.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i] ?? "";
            const m = line.match(re);
            if (!m) continue;
            const idx = line.search(re);
            if (idx < 0) continue;
            if (line.includes("@extend")) continue;
            // Try to ensure it's a selector-like definition
            if (!hasBraceSoon(lines, i, idx + 2)) continue;
            out?.appendLine(
              `[fallback] @extend %${placeholderName} -> %${pref.prefix}{interpolation} @ ${file.fsPath}:${i + 1}`
            );
            return [new vscode.Location(file, new vscode.Position(i, idx))];
          }
        }
      }
    }
  }

  if (hits.length === 0) {
    out?.appendLine(`[miss] @extend %${placeholderName} (placeholder definition not found)`);
    return [];
  }

  // When multiple definitions exist, return all so VS Code can show a choice (Peek Definitions).
  out?.appendLine(`[hit] @extend %${placeholderName} -> ${hits.length}개 정의 후보`);
  return hits;
}

function resolveAliasToAbsolute(
  importPath: string,
  docFsPath: string,
  aliases: AliasMap,
  uriForWorkspace: vscode.Uri
): string | null {
  const p = importPath.trim();

  // 1) alias match (longest key first)
  const keys = Object.keys(aliases).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (p === key || p.startsWith(key + "/")) {
      const targetRoot = expandVars(aliases[key], uriForWorkspace);
      const rest =
        p === key
          ? ""
          : p.startsWith(key + "/")
            ? p.slice(key.length + 1)
            : p.slice(key.length);
      const abs = path.resolve(targetRoot, rest);
      return abs;
    }
  }

  // 2) relative
  if (p.startsWith(".")) {
    return path.resolve(path.dirname(docFsPath), p);
  }

  // 3) absolute-like from workspace root (optional)
  // If user writes "/src/..." treat as workspace folder root
  if (p.startsWith("/")) {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (ws) return path.resolve(ws, "." + p);
  }

  return null;
}

class ScssAliasDefinitionProvider implements vscode.DefinitionProvider {
  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Definition | null> {
    if (!isFileUri(document.uri)) return null;

    const line = document.lineAt(position.line).text;

    // 0) namespace.$var jump (Sass module variables)
    const varRef = getNamespacedVarRefUnderCursor(document, position);
    if (varRef) {
      const uses = parseUseNamespaceMap(document.getText());
      const importPath = uses.get(varRef.namespace);
      if (!importPath) return null;

      const moduleUri = await resolveSassModuleFromUse(importPath, document);
      if (!moduleUri) return null;

      const loc =
        (await findVariableDefinitionInModule(moduleUri, varRef.varName, new Set())) ??
        new vscode.Location(moduleUri, new vscode.Position(0, 0));
      return loc;
    }

    // 1) @extend %placeholder jump
    EXTEND_PLACEHOLDER_RE.lastIndex = 0;
    let em: RegExpExecArray | null;
    while ((em = EXTEND_PLACEHOLDER_RE.exec(line))) {
      const placeholder = em[1];
      const token = `%${placeholder}`;
      const startIdx = em.index + em[0].indexOf(token);
      const endIdx = startIdx + token.length;

      if (position.character >= startIdx && position.character <= endIdx) {
        const locs = await findPlaceholderDefinitions(placeholder, document.uri);
        if (locs.length === 0) return null;
        return locs.length === 1 ? locs[0] : locs;
      }
    }

    // Find if cursor is inside an import string on this line
    // We'll scan matches and check range
    USE_FORWARD_IMPORT_RE.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = USE_FORWARD_IMPORT_RE.exec(line))) {
      const full = match[0];
      const importPath = match[3];

      const startIdx = match.index + full.indexOf(importPath);
      const endIdx = startIdx + importPath.length;

      if (position.character >= startIdx && position.character <= endIdx) {
        const aliases = getAliases();
        const abs = resolveAliasToAbsolute(
          importPath,
          document.uri.fsPath,
          aliases,
          document.uri
        );
        if (!abs) {
          out?.appendLine(
            `[miss] line ${position.line + 1}: "${importPath}" (no alias/relative match)`
          );
          return null;
        }

        const absNoExt = ensureNoExt(abs);
        const resolved = await resolveSassPath(absNoExt);
        if (!resolved) {
          out?.appendLine(
            `[miss] "${importPath}" -> ${absNoExt} (no candidate file found)`
          );
          return null;
        }

        const uri = vscode.Uri.file(resolved);
        out?.appendLine(`[hit] "${importPath}" -> ${resolved}`);
        return new vscode.Location(uri, new vscode.Position(0, 0));
      }
    }

    return null;
  }
}

class ScssAliasDocumentLinkProvider implements vscode.DocumentLinkProvider {
  async provideDocumentLinks(
    document: vscode.TextDocument
  ): Promise<vscode.DocumentLink[]> {
    if (!isFileUri(document.uri)) return [];

    const aliases = getAliases();
    const links: vscode.DocumentLink[] = [];

    for (let lineNo = 0; lineNo < document.lineCount; lineNo++) {
      const line = document.lineAt(lineNo).text;

      USE_FORWARD_IMPORT_RE.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = USE_FORWARD_IMPORT_RE.exec(line))) {
        const full = match[0];
        const importPath = match[3];

        const startIdx = match.index + full.indexOf(importPath);
        const endIdx = startIdx + importPath.length;

        const abs = resolveAliasToAbsolute(
          importPath,
          document.uri.fsPath,
          aliases,
          document.uri
        );
        if (!abs) continue;

        const resolved = await resolveSassPath(ensureNoExt(abs));
        if (!resolved) continue;

        const range = new vscode.Range(
          new vscode.Position(lineNo, startIdx),
          new vscode.Position(lineNo, endIdx)
        );
        const link = new vscode.DocumentLink(range, vscode.Uri.file(resolved));
        links.push(link);
      }

      // @extend %placeholder -> command link (so hover shows pointer/underline)
      EXTEND_PLACEHOLDER_RE.lastIndex = 0;
      let em: RegExpExecArray | null;
      while ((em = EXTEND_PLACEHOLDER_RE.exec(line))) {
        const placeholder = em[1];
        const token = `%${placeholder}`;
        const startIdx = em.index + em[0].indexOf(token);
        const endIdx = startIdx + token.length;
        if (startIdx < 0) continue;

        const range = new vscode.Range(
          new vscode.Position(lineNo, startIdx),
          new vscode.Position(lineNo, endIdx)
        );

        // Command URI expects JSON-encoded args array.
        const args = [document.uri.toString(), placeholder];
        const target = vscode.Uri.parse(
          `command:${OPEN_EXTEND_PLACEHOLDER_CMD}?${encodeURIComponent(
            JSON.stringify(args)
          )}`
        );
        links.push(new vscode.DocumentLink(range, target));
      }
    }

    if (links.length > 0) out?.appendLine(`[links] 제공: ${links.length}개`);
    return links;
  }
}

class ScssAliasHoverProvider implements vscode.HoverProvider {
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | null> {
    if (!isFileUri(document.uri)) return null;

    // Sass module variable hover: namespace.$var
    {
      const varRef = getNamespacedVarRefUnderCursor(document, position);
      if (varRef) {
        const uses = parseUseNamespaceMap(document.getText());
        const importPath = uses.get(varRef.namespace);
        if (importPath) {
          const moduleUri = await resolveSassModuleFromUse(importPath, document);
          if (moduleUri) {
            const loc =
              (await findVariableDefinitionInModule(moduleUri, varRef.varName, new Set())) ??
              new vscode.Location(moduleUri, new vscode.Position(0, 0));

            const md = new vscode.MarkdownString();
            md.isTrusted = true;
            md.appendMarkdown(`**${varRef.namespace}.$${varRef.varName}**\n\n`);

            const openArgs = [loc.uri.toString(), loc.range.start.line, loc.range.start.character];
            const openUri = vscode.Uri.parse(
              `command:${OPEN_LOCATION_CMD}?${encodeURIComponent(JSON.stringify(openArgs))}`
            );
            md.appendMarkdown(`[Go to definition](${openUri.toString()})\n\n`);
            md.appendMarkdown(`- module: \`${moduleUri.fsPath}\`\n`);
            md.appendMarkdown(`- line: ${loc.range.start.line + 1}\n`);

            return new vscode.Hover(md);
          }
        }
      }
    }

    const lines = document.getText().split(/\r?\n/);

    // 1) Direct %placeholder hover
    const direct = getPlaceholderNameUnderCursor(document, position);

    // 2) Nested & chain hover (infer flattened placeholder name)
    // Prefer this when hovering inside an `&...` selector context.
    let inferred: string | null = null;
    const amp = getAmpSegmentUnderCursor(document, position);
    if (amp) {
      inferred =
        inferPlaceholderNameFromOpenStack(lines, position.line) ??
        inferNestedPlaceholderNameAtLine(lines, position.line);
    }

    const name = inferred ?? direct;
    if (!name) return null;

    // Avoid showing this hover on @extend lines (it gets noisy)
    const lineText = document.lineAt(position.line).text;
    if (lineText.includes("@extend")) return null;

    const refs = await findExtendReferences(name);
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.appendMarkdown(`**%${name}**\n\n`);
    md.appendMarkdown(`@extend references in workspace: **${refs.length}**\n\n`);

    const showAllArgs = [document.uri.toString(), name];
    const showAllUri = vscode.Uri.parse(
      `command:${SHOW_PLACEHOLDER_EXTENDS_CMD}?${encodeURIComponent(JSON.stringify(showAllArgs))}`
    );
    md.appendMarkdown(`[Show all references](${showAllUri.toString()})\n\n`);

    const top = refs.slice(0, 8);
    if (top.length > 0) {
      md.appendMarkdown(`**Top matches**\n\n`);
      for (const r of top) {
        const openArgs = [r.uri.toString(), r.pos.line, r.pos.character];
        const openUri = vscode.Uri.parse(
          `command:${OPEN_LOCATION_CMD}?${encodeURIComponent(JSON.stringify(openArgs))}`
        );
        const container =
          r.containerText && r.containerText.length > 0 ? `\`${r.containerText}\` — ` : "";
        md.appendMarkdown(
          `- ${container}[${path.basename(r.uri.fsPath)}:${r.pos.line + 1}](${openUri.toString()})\n`
        );
      }
      if (refs.length > top.length) md.appendMarkdown(`\n… and ${refs.length - top.length} more\n`);
    }

    return new vscode.Hover(md);
  }
}

export function activate(context: vscode.ExtensionContext) {
  out = vscode.window.createOutputChannel("SCSS Alias Jump");
  out.appendLine(`[activate] SCSS Alias Jump 활성화됨`);

  const provider = new ScssAliasDefinitionProvider();
  const linkProvider = new ScssAliasDocumentLinkProvider();
  const hoverProvider = new ScssAliasHoverProvider();

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      [{ language: "scss" }, { language: "sass" }, { language: "css" }],
      provider
    )
  );
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(
      [{ language: "scss" }, { language: "sass" }, { language: "css" }],
      linkProvider
    )
  );
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      [{ language: "scss" }, { language: "sass" }],
      hoverProvider
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      OPEN_EXTEND_PLACEHOLDER_CMD,
      async (fromUriString: string, placeholder: string) => {
        try {
          const fromUri = vscode.Uri.parse(fromUriString);
          out?.appendLine(`[cmd] openExtendPlaceholder: %${placeholder} (from ${fromUri.fsPath})`);

          const locs = await findPlaceholderDefinitions(placeholder, fromUri);
          if (locs.length === 0) {
            vscode.window.showInformationMessage(
              `SCSS Alias Jump: %${placeholder} 정의를 찾지 못했어요. (Output: SCSS Alias Jump 확인)`
            );
            return;
          }

          const chosen =
            locs.length === 1
              ? locs[0]
              : await (async () => {
                  const items = locs.map((l) => ({
                    label: `${path.basename(l.uri.fsPath)}:${l.range.start.line + 1}`,
                    description: l.uri.fsPath,
                    loc: l,
                  }));
                  const picked = await vscode.window.showQuickPick(items, {
                    placeHolder: `%${placeholder} 정의가 여러 개예요. 이동할 위치를 선택하세요.`,
                    matchOnDescription: true,
                  });
                  return picked?.loc ?? locs[0];
                })();

          await vscode.window.showTextDocument(chosen.uri, {
            selection: chosen.range,
            preview: true,
            preserveFocus: false,
          });
        } catch (e) {
          out?.appendLine(`[err] openExtendPlaceholder failed: ${String(e)}`);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      SHOW_PLACEHOLDER_EXTENDS_CMD,
      async (_fromUriString: string, placeholder: string) => {
        try {
          out?.appendLine(`[cmd] showPlaceholderExtends: %${placeholder}`);
          const refs = await findExtendReferences(placeholder);
          if (refs.length === 0) {
            vscode.window.showInformationMessage(
              `SCSS Alias Jump: @extend %${placeholder} 사용처를 찾지 못했어요.`
            );
            return;
          }

          const items = refs.map((r) => ({
            label: `${r.containerText ? `${r.containerText} — ` : ""}${path.basename(r.uri.fsPath)}:${r.pos.line + 1}`,
            description: r.uri.fsPath,
            loc: new vscode.Location(r.uri, r.pos),
          }));

          const picked = await vscode.window.showQuickPick(items, {
            placeHolder: `@extend %${placeholder} 사용처 (${refs.length}개)`,
            matchOnDescription: true,
          });
          if (!picked) return;

          await vscode.window.showTextDocument(picked.loc.uri, {
            selection: picked.loc.range,
            preview: true,
            preserveFocus: false,
          });
        } catch (e) {
          out?.appendLine(`[err] showPlaceholderExtends failed: ${String(e)}`);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      OPEN_LOCATION_CMD,
      async (uriString: string, line: number, ch: number) => {
        try {
          const uri = vscode.Uri.parse(uriString);
          await vscode.window.showTextDocument(uri, {
            selection: new vscode.Range(line, ch, line, ch),
            preview: true,
            preserveFocus: false,
          });
        } catch (e) {
          out?.appendLine(`[err] openLocation failed: ${String(e)}`);
        }
      }
    )
  );

  context.subscriptions.push(out);
}

export function deactivate() {}

