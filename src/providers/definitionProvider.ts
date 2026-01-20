import * as vscode from "vscode";
import { EXTEND_PLACEHOLDER_RE, USE_FORWARD_IMPORT_RE } from "../constants";
import { getAliases, isDebugLoggingEnabled } from "../settings";
import { getDocFsPath } from "../docPath";
import { ensureNoExt, resolveSassPathCached } from "../sassResolve";
import { resolveAliasToAbsolute } from "../aliasResolve";
import {
  getImportPathUnderCursorOnLine,
  getNamespacedVarRefUnderCursor,
  parseUseNamespaceMap,
  getClassNameUnderCursor,
} from "../cursorTokens";
import { findPlaceholderDefinitions } from "../placeholders";
import { findVariableDefinitionInModule, resolveSassModuleFromUse } from "../sassModule";
import { debug as dbg } from "../output";
import { findClassDefinitionInDocument, findClassDefinitionInWorkspace } from "../classUsage";

export class ScssAliasDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private out: vscode.OutputChannel) {}

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Definition | vscode.DefinitionLink[] | null> {
    const debug = isDebugLoggingEnabled(document.uri);
    if (token.isCancellationRequested) return null;

    const docFsPath = getDocFsPath(document);
    if (!docFsPath) {
      const line = document.lineAt(position.line).text;
      if (line.includes("@use") || line.includes("@forward") || line.includes("@import")) {
        if (debug) {
          dbg(
            this.out,
            `[miss-doc] cannot determine fsPath (scheme=${document.uri.scheme}, fileName="${document.fileName}")`,
            document.uri
          );
        }
      }
      return null;
    }

    const line = document.lineAt(position.line).text;

    // 0) Template class attribute jump (Vue/Svelte)
    if (document.languageId === "vue" || document.languageId === "svelte") {
      const classMatch = getClassNameUnderCursor(line, position.character);
      if (classMatch) {
        if (debug) {
          dbg(
            this.out,
            `[class] Vue/Svelte template class="${classMatch}" at line ${position.line + 1}`,
            document.uri
          );
        }

        // First, try to find in the same document (for SFC with <style> block)
        const localDef = await findClassDefinitionInDocument(classMatch, document);
        if (localDef) {
          if (debug) dbg(this.out, `[hit] class "${classMatch}" found in same document`, document.uri);
          return localDef;
        }

        // Then search in workspace
        const workspaceDefs = await findClassDefinitionInWorkspace(classMatch);
        if (workspaceDefs.length > 0) {
          if (debug) {
            dbg(
              this.out,
              `[hit] class "${classMatch}" found in workspace (${workspaceDefs.length} locations)`,
              document.uri
            );
          }
          return workspaceDefs.length === 1 ? workspaceDefs[0] : workspaceDefs;
        }

        if (debug) dbg(this.out, `[miss] class "${classMatch}" not found`, document.uri);
      }
    }

    // 1) namespace.$var jump
    const varRef = getNamespacedVarRefUnderCursor(document, position);
    if (varRef) {
      if (token.isCancellationRequested) return null;
      const uses = parseUseNamespaceMap(document.getText());
      const importPath = uses.get(varRef.namespace);
      if (!importPath) return null;

      const moduleUri = await resolveSassModuleFromUse(importPath, document);
      if (token.isCancellationRequested) return null;
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
      const tok = `%${placeholder}`;
      const startIdx = em.index + em[0].indexOf(tok);
      const endIdx = startIdx + tok.length;

      if (position.character >= startIdx && position.character <= endIdx) {
        const locs = await findPlaceholderDefinitions(placeholder, document.uri, this.out);
        if (locs.length === 0) return null;
        return locs.length === 1 ? locs[0] : locs;
      }
    }

    // 2) @use/@forward/@import path jump
    USE_FORWARD_IMPORT_RE.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = USE_FORWARD_IMPORT_RE.exec(line))) {
      if (token.isCancellationRequested) return null;
      const importPath = match[3];
      const span = getImportPathUnderCursorOnLine(line, position.character);
      if (!span) continue;
      const startIdx = span.startIdx;
      const endIdx = span.endIdx;

      if (position.character >= startIdx && position.character <= endIdx) {
        if (debug) {
          dbg(
            this.out,
            `[use] from=${docFsPath} uri=${document.uri.scheme} line=${position.line + 1} char=${position.character} path="${importPath}" (range: ${startIdx}-${endIdx})`,
            document.uri
          );
        }

        const aliases = getAliases(document.uri);
        const abs = resolveAliasToAbsolute(importPath, docFsPath, aliases, document.uri);
        if (!abs) {
          if (debug) dbg(this.out, `[miss] @use "${importPath}" (no alias/relative match)`, document.uri);
          return null;
        }

        const absNoExt = ensureNoExt(abs);
        const resolved = await resolveSassPathCached(absNoExt);
        if (!resolved) {
          if (debug) {
            dbg(
              this.out,
              `[miss] @use "${importPath}" -> ${absNoExt} (no candidate file found)`,
              document.uri
            );
          }
          return null;
        }

        const uri = vscode.Uri.file(resolved);
        if (debug) dbg(this.out, `[hit] @use "${importPath}" -> ${resolved}`, document.uri);

        const defLink: vscode.DefinitionLink = {
          targetUri: uri,
          targetRange: new vscode.Range(0, 0, 0, 0),
          targetSelectionRange: new vscode.Range(0, 0, 0, 0),
          originSelectionRange: new vscode.Range(position.line, startIdx, position.line, endIdx),
        };

        if (debug) {
          dbg(
            this.out,
            `[ret] @use -> DefinitionLink (${uri.fsPath}) with originRange: line=${position.line + 1}, chars=${startIdx}-${endIdx}`,
            document.uri
          );
        }

        return [defLink];
      }
    }

    return null;
  }
}
