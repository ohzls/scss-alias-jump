import * as vscode from "vscode";
import { readTextFile } from "./fsText";
import { braceDelta, stripComments, pruneStack } from "./textScan";
import { escapeRegExp, splitLines } from "./strings";
import { CACHE_TTL_MS, MAX_SEARCH_RESULTS, SCAN_LINE_CANCELLATION_INTERVAL } from "./constants";
import {
  findWorkspaceFiles,
  runDedupedCancellableScan,
  scanCacheKey,
  throwIfCancellationRequested,
  WorkspaceScanOptions,
  yieldToExtensionHostIfNeeded,
} from "./scan";

export type ExtendRef = {
  uri: vscode.Uri;
  pos: vscode.Position;
  containerText: string | null;
  containerLine: number | null;
};

type ExtendRefsCacheEntry2 = { ts: number; refs: ExtendRef[] };
const extendRefsCache2 = new Map<string, ExtendRefsCacheEntry2>();

function pickContainer(stack: Array<{ text: string; depth: number; line: number }>) {
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
  placeholderName: string,
  token?: vscode.CancellationToken
): ExtendRef[] {
  const refs: ExtendRef[] = [];
  const re = new RegExp(`@extend\\s+%${escapeRegExp(placeholderName)}(?![A-Za-z0-9_-])`, "g");
  const tokenText = `%${placeholderName}`;

  let depth = 0;
  const stack: Array<{ text: string; depth: number; line: number }> = [];

  const lines = splitLines(text);
  for (let i = 0; i < lines.length; i++) {
    if (i % SCAN_LINE_CANCELLATION_INTERVAL === 0) throwIfCancellationRequested(token);
    const lineRaw = lines[i] ?? "";
    const line = stripComments(lineRaw);
    const depthBefore = depth;

    if (line.includes("@extend") && line.includes(tokenText)) {
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

    const braceIdx = line.indexOf("{");
    if (braceIdx >= 0) {
      const sel = line.slice(0, braceIdx).trim();
      if (sel.length > 0) {
        stack.push({ text: sel, depth: depthBefore + 1, line: i });
      }
    }

    depth += braceDelta(lineRaw);
    pruneStack(stack, depth);
    if (refs.length >= MAX_SEARCH_RESULTS) break;
  }

  return refs;
}

export async function findExtendReferences(
  placeholderName: string,
  options: WorkspaceScanOptions = {}
): Promise<ExtendRef[]> {
  const key = scanCacheKey("extend-refs", placeholderName, options);
  const cached = extendRefsCache2.get(key);
  const now = Date.now();
  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.refs;

  return runDedupedCancellableScan(key, options, async (token) => {
    const refs: ExtendRef[] = [];
    const files = await findWorkspaceFiles("**/*.{scss,sass}", { ...options, token });

    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      throwIfCancellationRequested(token);
      const file = files[fileIndex];
      const text = await readTextFile(file, { token });
      if (!text) continue;
      if (!text.includes("@extend") || !text.includes(`%${placeholderName}`)) continue;

      const found = scanExtendRefsInText(file, text, placeholderName, token);
      for (const r of found) {
        refs.push(r);
        if (refs.length >= MAX_SEARCH_RESULTS) break;
      }
      if (refs.length >= MAX_SEARCH_RESULTS) break;
      await yieldToExtensionHostIfNeeded(fileIndex + 1, token);
    }

    throwIfCancellationRequested(token);
    extendRefsCache2.set(key, { ts: now, refs });
    return refs;
  });
}
