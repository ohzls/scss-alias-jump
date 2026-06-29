import * as path from "path";
import * as vscode from "vscode";
import { USE_FORWARD_IMPORT_RE } from "../constants";
import { getAliases, isDebugLoggingEnabled } from "../settings";
import { getDocFsPath } from "../docPath";
import { ensureNoExt, resolveSassPathCached } from "../sassResolve";
import { resolveAliasToAbsolute } from "../aliasResolve";
import { debug as dbg } from "../output";
import { firstNonCommentIdx } from "../textScan";

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

  private pushResolvedLink(
    links: vscode.DocumentLink[],
    seen: Set<string>,
    document: vscode.TextDocument,
    start: number,
    end: number,
    resolved: string
  ): void {
    if (end <= start) return;

    const range = new vscode.Range(document.positionAt(start), document.positionAt(end));
    const key = `${range.start.line}:${range.start.character}-${range.end.character}:${resolved}`;
    if (seen.has(key)) return;
    seen.add(key);

    const link = new vscode.DocumentLink(range, vscode.Uri.file(resolved));
    link.tooltip = `SCSS Alias Jump: Open ${path.basename(resolved)}`;

    // Keep the resolved path for resolveDocumentLink as a defensive fallback.
    (link as any).scssAliasJumpTarget = resolved;
    links.push(link);
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

      const lineStart = text.lastIndexOf("\n", m.index) + 1;
      const lineEnd = text.indexOf("\n", m.index);
      const lineText = text.slice(lineStart, lineEnd >= 0 ? lineEnd : text.length);
      const matchStartOnLine = m.index - lineStart;
      if (matchStartOnLine >= firstNonCommentIdx(lineText)) continue;

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

      this.pushResolvedLink(links, seen, document, it.start, it.end, it.resolved);

      // Some built-in Sass document-link providers claim only the basename
      // segment (for example `button` in `@/scss/button`). Add a more specific
      // same-target link on that basename so our resolved absolute target can
      // win when the user Cmd/Ctrl-clicks the visible filename segment.
      const basenameStartInImport = it.importPath.lastIndexOf("/") + 1;
      if (basenameStartInImport > 0 && basenameStartInImport < it.importPath.length) {
        this.pushResolvedLink(
          links,
          seen,
          document,
          it.start + basenameStartInImport,
          it.end,
          it.resolved
        );
      }
    }

    return links;
  }
}
