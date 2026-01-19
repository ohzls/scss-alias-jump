import * as path from "path";
import * as vscode from "vscode";
import { readTextFile } from "./fsText";
import { firstNonCommentIdx, tokenBoundaryOk } from "./textScan";

export type ClassUsage = {
  uri: vscode.Uri;
  pos: vscode.Position;
  hint: string | null;
};

type ClassUsageCacheEntry = { ts: number; refs: ClassUsage[] };
const classUsageCache = new Map<string, ClassUsageCacheEntry>();

function fileHintFromPath(uri: vscode.Uri) {
  const b = path.basename(uri.fsPath);
  return b;
}

function lineHasClassUsageSignal(line: string) {
  return (
    line.includes("class=") ||
    line.includes("className=") ||
    line.includes(":class") ||
    line.includes("v-bind:class") ||
    line.includes("class:") ||
    line.includes("clsx(") ||
    line.includes("classnames(")
  );
}

export async function findClassUsages(className: string): Promise<ClassUsage[]> {
  const key = className;
  const cached = classUsageCache.get(key);
  const now = Date.now();
  if (cached && now - cached.ts < 1500) return cached.refs;

  const refs: ClassUsage[] = [];
  const token = className;

  const files = await vscode.workspace.findFiles(
    "**/*.{ts,tsx,js,jsx,vue,svelte,html}",
    "**/{node_modules,dist,build}/**"
  );

  for (const file of files) {
    const text = await readTextFile(file);
    if (!text) continue;
    if (!text.includes(token)) continue;

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i] ?? "";
      const cut = firstNonCommentIdx(raw);
      const line = raw.slice(0, cut);
      if (!line.includes(token)) continue;
      if (!lineHasClassUsageSignal(line)) continue;

      let from = 0;
      while (true) {
        const idx = line.indexOf(token, from);
        if (idx < 0) break;
        from = idx + token.length;
        if (!tokenBoundaryOk(line, idx, token.length)) continue;

        refs.push({
          uri: file,
          pos: new vscode.Position(i, idx),
          hint: fileHintFromPath(file),
        });
        if (refs.length >= 200) break;
      }
      if (refs.length >= 200) break;
    }
    if (refs.length >= 200) break;
  }

  classUsageCache.set(key, { ts: now, refs });
  return refs;
}
