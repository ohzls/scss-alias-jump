import * as path from "path";
import * as vscode from "vscode";
import { USE_FORWARD_IMPORT_RE } from "../constants";
import { getAliases, isDebugLoggingEnabled } from "../settings";
import { getDocFsPath } from "../docPath";
import { ensureNoExt, resolveSassPathCached } from "../sassResolve";
import { resolveAliasToAbsolute } from "../aliasResolve";
import { debug as dbg } from "../output";

export class ScssAliasDocumentLinkProvider implements vscode.DocumentLinkProvider {
  constructor(private out: vscode.OutputChannel) {}

  // Resolve link to ensure our target always wins over other providers
  async resolveDocumentLink(
    link: vscode.DocumentLink,
    token: vscode.CancellationToken
  ): Promise<vscode.DocumentLink | null> {
    if (token.isCancellationRequested) return null;
    
    // If link has our marker, set target
    const storedTarget = (link as any).scssAliasJumpTarget;
    if (storedTarget && typeof storedTarget === "string") {
      link.target = vscode.Uri.file(storedTarget);
    }
    
    return link;
  }

  private async mapLimit<T, R>(
    items: readonly T[],
    limit: number,
    fn: (item: T) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let idx = 0;
    const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
      while (true) {
        const cur = idx++;
        if (cur >= items.length) return;
        results[cur] = await fn(items[cur]);
      }
    });
    await Promise.all(workers);
    return results;
  }

  async provideDocumentLinks(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.DocumentLink[]> {
    // Debug logging removed for performance
    
    const docFsPath = getDocFsPath(document);
    if (!docFsPath) {
      return [];
    }

    const aliases = getAliases(document.uri);
    const text = document.getText();
    const matches: Array<{ importPath: string; start: number; end: number; lineNo: number }> = [];

    USE_FORWARD_IMPORT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = USE_FORWARD_IMPORT_RE.exec(text))) {
      if (token.isCancellationRequested) break;
      const full = m[0];
      const importPath = m[3];
      if (!importPath) continue;
      if (importPath.startsWith("sass:")) continue;

      const q = m[2];
      const qRel1 = full.indexOf(q);
      const qRel2 = full.lastIndexOf(q);
      const startOff = qRel1 >= 0 ? m.index + qRel1 + 1 : m.index + full.indexOf(importPath);
      const endOff =
        qRel2 >= 0 ? m.index + qRel2 : m.index + full.indexOf(importPath) + importPath.length;
      if (startOff < 0 || endOff <= startOff) continue;

      const pos = document.positionAt(startOff);
      matches.push({ importPath, start: startOff, end: endOff, lineNo: pos.line });
    }

    const seen = new Set<string>();
    const links: vscode.DocumentLink[] = [];

    // Resolve targets in parallel to avoid cancellation/timeouts on large Vue files.
    const resolvedItems = await this.mapLimit(matches, 8, async (it) => {
      if (token.isCancellationRequested) return null;
      const abs = resolveAliasToAbsolute(it.importPath, docFsPath, aliases, document.uri);
      if (!abs) return null;
      const absNoExt = ensureNoExt(abs);
      const resolved = await resolveSassPathCached(absNoExt);
      if (!resolved) return null;
      return { ...it, resolved };
    });

    for (const it of resolvedItems) {
      if (!it) continue;
      if (token.isCancellationRequested) break;

      if (path.resolve(it.resolved) === path.resolve(docFsPath)) continue;

      const range = new vscode.Range(document.positionAt(it.start), document.positionAt(it.end));
      // Create link WITHOUT target for lazy resolution (forces VSCode to call resolveDocumentLink)
      const link = new vscode.DocumentLink(range);
      link.tooltip = `SCSS Alias Jump: Open ${path.basename(it.resolved)}`;
      
      // Store resolved path for resolveDocumentLink
      (link as any).scssAliasJumpTarget = it.resolved;

      const key = `${range.start.line}:${range.start.character}-${range.end.character}:${it.resolved}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push(link);
    }

    return links;
  }
}
