import * as vscode from "vscode";
import * as path from "path";

type AliasMap = Record<string, string>;

const USE_FORWARD_IMPORT_RE = /@(use|forward|import)\s+(['"])([^'"]+)\2/g;
const EXTEND_PLACEHOLDER_RE = /@extend\s+%([A-Za-z0-9_-]+)\b/g;

let out: vscode.OutputChannel | null = null;
const OPEN_EXTEND_PLACEHOLDER_CMD = "scss-alias-jump.openExtendPlaceholder";

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
      const needle = `&${remainingParts[0]}`;
      const hitAt = line.indexOf(needle);
      if (hitAt >= 0) {
        const openJ = findOpeningBraceLine(lines, i, 6);
        if (openJ != null && openJ <= blockEndLine) {
          const nestedEnd = findBlockEndLine(lines, openJ);
          if (remainingParts.length === 1) return { line: i, ch: hitAt };
          const deeper = findNestedChainInBlock(
            lines,
            openJ,
            Math.min(nestedEnd, blockEndLine),
            remainingParts.slice(1)
          );
          if (deeper) return deeper;
        }
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

async function findPlaceholderDefinition(
  placeholderName: string,
  forUri: vscode.Uri
): Promise<vscode.Location | null> {
  const folders = getWorkspaceFoldersInSearchOrder(forUri);
  const token = `%${placeholderName}`;

  // Heuristic: placeholder definition appears in selector context, not in @extend lines.
  // We'll accept lines that contain the token and are followed by "{" (same line or next non-empty line).
  for (const folder of folders) {
    const pattern = new vscode.RelativePattern(folder, "**/*.{scss,sass}");
    const files = await vscode.workspace.findFiles(pattern, "**/{node_modules,dist,build}/**");

    for (const file of files) {
      const text = await readTextFile(file);
      if (!text || !text.includes(token)) continue;

      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.includes(token)) continue;
        if (line.includes("@extend")) continue;

        // Try to ensure we're in selector definition context
        const idx = line.indexOf(token);
        if (idx < 0) continue;

        // Basic boundary checks
        const before = idx === 0 ? "" : line[idx - 1];
        if (before && /[A-Za-z0-9_-]/.test(before)) continue;

        const after = line[idx + token.length] ?? "";
        if (after && /[A-Za-z0-9_-]/.test(after)) continue;

        const rest = line.slice(idx + token.length);
        const hasBraceSameLine = rest.includes("{");

        let hasBraceSoon = hasBraceSameLine;
        if (!hasBraceSoon) {
          // look ahead to next non-empty line
          for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
            const n = lines[j].trim();
            if (n.length === 0) continue;
            hasBraceSoon = n.includes("{");
            break;
          }
        }

        if (!hasBraceSoon) continue;

        const uri = file;
        out?.appendLine(`[hit] @extend %${placeholderName} -> ${uri.fsPath}:${i + 1}`);
        return new vscode.Location(uri, new vscode.Position(i, idx));
      }
    }
  }

  // 2) Nested placeholder definition by walking "&..." blocks recursively, e.g.
  // %chat { &__result { &-list { &__dt { ... }}}}
  const split = splitPlaceholderName(placeholderName);
  const prefixes = buildPrefixCandidates(split.root, split.parts);

  for (const folder of folders) {
    const pattern = new vscode.RelativePattern(folder, "**/*.{scss,sass}");
    const files = await vscode.workspace.findFiles(pattern, "**/{node_modules,dist,build}/**");

    for (const file of files) {
      const text = await readTextFile(file);
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
          const before = idx === 0 ? "" : line[idx - 1];
          if (before && /[A-Za-z0-9_-]/.test(before)) continue;

          const braceLine = findOpeningBraceLine(lines, i);
          if (braceLine == null) continue;
          const endLine = findBlockEndLine(lines, braceLine);

          const remaining = split.parts.slice(pref.usedParts);
          const found = findNestedChainInBlock(lines, braceLine, endLine, remaining);
          if (found) {
            out?.appendLine(
              `[hit] @extend %${placeholderName} -> %${pref.prefix} + &chain @ ${file.fsPath}:${found.line + 1}`
            );
            return new vscode.Location(file, new vscode.Position(found.line, found.ch));
          }
        }
      }
    }
  }

  out?.appendLine(`[miss] @extend %${placeholderName} (placeholder definition not found)`);
  return null;
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

    // 0) @extend %placeholder jump
    EXTEND_PLACEHOLDER_RE.lastIndex = 0;
    let em: RegExpExecArray | null;
    while ((em = EXTEND_PLACEHOLDER_RE.exec(line))) {
      const placeholder = em[1];
      const token = `%${placeholder}`;
      const startIdx = em.index + em[0].indexOf(token);
      const endIdx = startIdx + token.length;

      if (position.character >= startIdx && position.character <= endIdx) {
        const loc = await findPlaceholderDefinition(placeholder, document.uri);
        return loc;
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

export function activate(context: vscode.ExtensionContext) {
  out = vscode.window.createOutputChannel("SCSS Alias Jump");
  out.appendLine(`[activate] SCSS Alias Jump 활성화됨`);

  const provider = new ScssAliasDefinitionProvider();
  const linkProvider = new ScssAliasDocumentLinkProvider();

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
    vscode.commands.registerCommand(
      OPEN_EXTEND_PLACEHOLDER_CMD,
      async (fromUriString: string, placeholder: string) => {
        try {
          const fromUri = vscode.Uri.parse(fromUriString);
          out?.appendLine(`[cmd] openExtendPlaceholder: %${placeholder} (from ${fromUri.fsPath})`);

          const loc = await findPlaceholderDefinition(placeholder, fromUri);
          if (!loc) {
            vscode.window.showInformationMessage(
              `SCSS Alias Jump: %${placeholder} 정의를 찾지 못했어요. (Output: SCSS Alias Jump 확인)`
            );
            return;
          }

          await vscode.window.showTextDocument(loc.uri, {
            selection: loc.range,
            preview: true,
            preserveFocus: false,
          });
        } catch (e) {
          out?.appendLine(`[err] openExtendPlaceholder failed: ${String(e)}`);
        }
      }
    )
  );

  context.subscriptions.push(out);
}

export function deactivate() {}

