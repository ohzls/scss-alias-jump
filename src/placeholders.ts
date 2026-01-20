import * as vscode from "vscode";
import { readTextFile } from "./fsText";
import { escapeRegExp, splitLines } from "./strings";
import { braceDelta, hasBraceSoon, tokenBoundaryOk, firstNonCommentIdx } from "./textScan";
import { debug as dbg } from "./output";
import { buildOpenSelectorStack } from "./cssInference";
import { AMP_SELECTOR_RE, PLACEHOLDER_SELECTOR_RE, EXCLUDE_PATTERN } from "./constants";

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
  let depth = 0;
  for (let i = openLine; i < lines.length; i++) {
    depth += braceDelta(lines[i] ?? "");
    if (i === openLine && depth <= 0) {
      return i;
    }
    if (i > openLine && depth <= 0) return i;
  }
  return lines.length - 1;
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
    if (!tokenBoundaryOk(line, idx, token.length)) continue;
    if (!hasBraceSoon(lines, i, idx + token.length)) continue;

    const braceLine = findOpeningBraceLine(lines, i, 8);
    if (braceLine == null) continue;
    let depth = 0;
    for (let j = braceLine; j <= atLine; j++) {
      depth += braceDelta(lines[j] ?? "");
      if (j === braceLine && depth <= 0) {
        break;
      }
    }
    if (depth > 0) return { name, openLine: braceLine };
  }
  return null;
}

export function inferNestedPlaceholderNameAtLine(lines: string[], lineNo: number): string | null {
  const base = findNearestEnclosingPlaceholderOpenLine(lines, lineNo);
  if (!base) return null;

  let relDepth = 0;
  const segStack: Array<{ seg: string; depth: number }> = [];

  for (let i = base.openLine; i <= lineNo; i++) {
    const line = lines[i] ?? "";
    const depthBefore = relDepth;

    while (segStack.length > 0 && depthBefore < segStack[segStack.length - 1].depth) {
      segStack.pop();
    }

    if (i != base.openLine && depthBefore >= 1) {
      const m = AMP_SELECTOR_RE.exec(line);
      if (m) {
        const seg = m[0].slice(1);
        if (line.includes("{")) {
          segStack.push({ seg, depth: depthBefore + 1 });
        }
      }
    }

    relDepth += braceDelta(line);
  }

  const suffix = segStack.map((s) => s.seg).join("");
  return `${base.name}${suffix}`;
}

export function inferPlaceholderNameFromOpenStack(lines: string[], lineNo: number): string | null {
  const stack = buildOpenSelectorStack(lines, lineNo);

  let baseIdx = -1;
  let baseName: string | null = null;
  for (let i = stack.length - 1; i >= 0; i--) {
    const t = stack[i]?.text ?? "";
    const m = PLACEHOLDER_SELECTOR_RE.exec(t);
    if (m) {
      baseIdx = i;
      baseName = m[1];
      break;
    }
  }
  if (!baseName) return null;

  const suffixParts: string[] = [];
  for (let i = baseIdx + 1; i < stack.length; i++) {
    const t = stack[i]?.text ?? "";
    const m = AMP_SELECTOR_RE.exec(t);
    if (m) suffixParts.push(m[0].slice(1));
  }

  return `${baseName}${suffixParts.join("")}`;
}

function splitPlaceholderName(placeholderName: string): { root: string; parts: string[] } {
  const seps = ["__", "--", "_", "-"] as const;

  const splitCamel = (s: string) => {
    const parts: string[] = [];
    let start = 0;
    for (let i = 1; i < s.length; i++) {
      const prev = s[i - 1] ?? "";
      const cur = s[i] ?? "";
      const next = s[i + 1] ?? "";
      const prevIsLowerOrDigit = /[a-z0-9]/.test(prev);
      const curIsUpper = /[A-Z]/.test(cur);
      const prevIsUpper = /[A-Z]/.test(prev);
      const nextIsLower = /[a-z]/.test(next);

      const boundary = (curIsUpper && prevIsLowerOrDigit) || (prevIsUpper && curIsUpper && nextIsLower);
      if (boundary) {
        const seg = s.slice(start, i);
        if (seg) parts.push(seg);
        start = i;
      }
    }
    const last = s.slice(start);
    if (last) parts.push(last);
    return parts;
  };

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
    if (/[A-Z]/.test(placeholderName)) {
      const camelParts = splitCamel(placeholderName);
      if (camelParts.length >= 2) {
        return { root: camelParts[0], parts: camelParts.slice(1) };
      }
    }
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
  const out: Array<{ prefix: string; usedParts: number }> = [];
  let acc = root;
  out.push({ prefix: acc, usedParts: 0 });
  for (let i = 0; i < parts.length; i++) {
    acc += parts[i];
    out.push({ prefix: acc, usedParts: i + 1 });
  }
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
    const out: Array<{ needle: string; consume: number }> = [];
    for (let k = parts.length; k >= 1; k--) {
      out.push({ needle: `&${parts.slice(0, k).join("")}`, consume: k });
    }
    return out;
  };

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

function getWorkspaceFoldersInSearchOrder(forUri: vscode.Uri): readonly vscode.WorkspaceFolder[] {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length <= 1) return folders;

  const primary = vscode.workspace.getWorkspaceFolder(forUri);
  if (!primary) return folders;

  return [primary, ...folders.filter((f) => f.uri.toString() !== primary.uri.toString())];
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

export async function findPlaceholderDefinitions(
  placeholderName: string,
  forUri: vscode.Uri,
  out?: vscode.OutputChannel
): Promise<vscode.Location[]> {
  const folders = getWorkspaceFoldersInSearchOrder(forUri);
  const token = `%${placeholderName}`;
  const hitKey = (loc: vscode.Location) => `${loc.uri.toString()}::${loc.range.start.line}:${loc.range.start.character}`;
  const hits: vscode.Location[] = [];
  const seen = new Set<string>();

  const filesCache = new Map<string, readonly vscode.Uri[]>();
  const textCache = new Map<string, string | null>();

  const listFiles = async (folder: vscode.WorkspaceFolder) => {
    const key = folder.uri.toString();
    const cached = filesCache.get(key);
    if (cached) return cached;
    const pattern = new vscode.RelativePattern(folder, "**/*.{scss,sass}");
    const files = await vscode.workspace.findFiles(pattern, EXCLUDE_PATTERN);
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

  for (const folder of folders) {
    const files = await listFiles(folder);
    for (const file of files) {
      const text = await getText(file);
      if (!text || !text.includes(token)) continue;

      const lines = splitLines(text);
      for (let i = 0; i < lines.length; i++) {
        const direct = findDirectPlaceholderDefinitionOnLine(lines, i, token);
        if (!direct) continue;
        pushHit(new vscode.Location(file, new vscode.Position(direct.line, direct.ch)));
      }
    }
  }

  const split = splitPlaceholderName(placeholderName);
  const prefixes = buildPrefixCandidates(split.root, split.parts);

  for (const folder of folders) {
    const files = await listFiles(folder);
    for (const file of files) {
      const text = await getText(file);
      if (!text) continue;
      if (!prefixes.some((p) => text.includes(`%${p.prefix}`))) continue;

      const lines = splitLines(text);
      for (const pref of prefixes) {
        const baseToken = `%${pref.prefix}`;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i] ?? "";
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
          const lines = splitLines(text);
          for (let i = 0; i < lines.length; i++) {
            const direct = findDirectPlaceholderDefinitionOnLine(lines, i, baseToken);
            if (!direct) continue;
            if (out) {
              dbg(
                out,
                `[fallback] @extend %${placeholderName} -> %${pref.prefix} @ ${file.fsPath}:${direct.line + 1}`
              );
            }
            return [new vscode.Location(file, new vscode.Position(direct.line, direct.ch))];
          }
        }
      }
    }

    for (const pref of shorterPrefixes) {
      const re = new RegExp(`%${escapeRegExp(pref.prefix)}(?:__|--|_|-)?#\\{`, "g");
      for (const folder of folders) {
        const files = await listFiles(folder);
        for (const file of files) {
          const text = await getText(file);
          if (!text || !re.test(text)) continue;
          const lines = splitLines(text);
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i] ?? "";
            const m = line.match(re);
            if (!m) continue;
            const idx = line.search(re);
            if (idx < 0) continue;
            if (line.includes("@extend")) continue;
            if (!hasBraceSoon(lines, i, idx + 2)) continue;
            if (out) {
              dbg(
                out,
                `[fallback] @extend %${placeholderName} -> %${pref.prefix}{interpolation} @ ${file.fsPath}:${i + 1}`
              );
            }
            return [new vscode.Location(file, new vscode.Position(i, idx))];
          }
        }
      }
    }
  }

  if (hits.length === 0) {
    if (out) dbg(out, `[miss] @extend %${placeholderName} (placeholder definition not found)`);
    return [];
  }

  if (out) dbg(out, `[hit] @extend %${placeholderName} -> ${hits.length}개 정의 후보`);
  return hits;
}
