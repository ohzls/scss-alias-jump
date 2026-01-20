import * as path from "path";
import * as vscode from "vscode";
import { SHOW_CLASS_USAGES_CMD, SHOW_PLACEHOLDER_EXTENDS_CMD, OPEN_LOCATION_CMD, SEARCH_TIMEOUT_MS } from "../constants";
import { getDocFsPath } from "../docPath";
import { withTimeout } from "../async";
import { isHoverWorkspaceScanEnabled } from "../settings";
import { splitLines, formatFileLocation } from "../strings";
import { parseScssVariables } from "../scssVariables";
import {
  getAmpSegmentUnderCursor,
  getCssClassUnderCursor,
  getNamespacedVarRefUnderCursor,
  getPlaceholderNameUnderCursor,
  parseUseNamespaceMap,
} from "../cursorTokens";
import { inferCssClassNameAtLine } from "../cssInference";
import { findClassUsages } from "../classUsage";
import { findExtendReferences } from "../extendRefs";
import { inferNestedPlaceholderNameAtLine, inferPlaceholderNameFromOpenStack } from "../placeholders";
import { findVariableDefinitionInModule, resolveSassModuleFromUse } from "../sassModule";

export class ScssAliasHoverProvider implements vscode.HoverProvider {
  // NOTE: currently no logging/output needed here; keep constructor empty for future extension.
  constructor() {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Hover | null> {
    const docFsPath = getDocFsPath(document);
    if (!docFsPath) return null;
    if (token.isCancellationRequested) return null;

    // Sass module variable hover: namespace.$var
    {
      const varRef = getNamespacedVarRefUnderCursor(document, position);
      if (varRef) {
        if (token.isCancellationRequested) return null;
        const uses = parseUseNamespaceMap(document.getText());
        const importPath = uses.get(varRef.namespace);
        if (importPath) {
          const moduleUri = await resolveSassModuleFromUse(importPath, document);
          if (token.isCancellationRequested) return null;
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

    const text = document.getText();
    const lines = splitLines(text);
    const variables = parseScssVariables(text);

    // CSS class usage hover
    {
      const directClass = getCssClassUnderCursor(document, position);
      const amp = getAmpSegmentUnderCursor(document, position);
      const inferred = amp ? inferCssClassNameAtLine(lines, position.line, variables) : null;
      const className = directClass?.className ?? inferred;

      if (className) {
        if (!isHoverWorkspaceScanEnabled(document.uri)) return null;
        if (token.isCancellationRequested) return null;
        const lineText = document.lineAt(position.line).text;
        if (!lineText.includes("@extend")) {
          const refs = await withTimeout(findClassUsages(className), SEARCH_TIMEOUT_MS).catch(() => []);
          const md = new vscode.MarkdownString();
          md.isTrusted = true;
          md.appendMarkdown(`**.${className}**\n\n`);
          md.appendMarkdown(`class usages in workspace: **${refs.length}**\n\n`);

          const showAllArgs = [document.uri.toString(), className];
          const showAllUri = vscode.Uri.parse(
            `command:${SHOW_CLASS_USAGES_CMD}?${encodeURIComponent(JSON.stringify(showAllArgs))}`
          );
          md.appendMarkdown(`[Show all usages](${showAllUri.toString()})\n\n`);

          const top = refs.slice(0, 8);
          if (top.length > 0) {
            md.appendMarkdown(`**Top matches**\n\n`);
            for (const r of top) {
              const openArgs = [r.uri.toString(), r.pos.line, r.pos.character];
              const openUri = vscode.Uri.parse(
                `command:${OPEN_LOCATION_CMD}?${encodeURIComponent(JSON.stringify(openArgs))}`
              );
              const hint = r.hint ? `\`${r.hint}\` — ` : "";
              md.appendMarkdown(
                `- ${hint}[${formatFileLocation(r.uri, r.pos.line)}](${openUri.toString()})\n`
              );
            }
            if (refs.length > top.length) md.appendMarkdown(`\n… and ${refs.length - top.length} more\n`);
          }

          return new vscode.Hover(md);
        }
      }
    }

    // %placeholder hover
    const direct = getPlaceholderNameUnderCursor(document, position);
    let inferredName: string | null = null;
    const amp = getAmpSegmentUnderCursor(document, position);
    if (amp) {
      inferredName =
        inferPlaceholderNameFromOpenStack(lines, position.line) ??
        inferNestedPlaceholderNameAtLine(lines, position.line);
    }

    const name = inferredName ?? direct;
    if (!name) return null;
    if (!isHoverWorkspaceScanEnabled(document.uri)) return null;
    if (token.isCancellationRequested) return null;

    const lineText = document.lineAt(position.line).text;
    if (lineText.includes("@extend")) return null;

    const refs = await withTimeout(findExtendReferences(name), SEARCH_TIMEOUT_MS).catch(() => []);
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
        const container = r.containerText && r.containerText.length > 0 ? `\`${r.containerText}\` — ` : "";
        md.appendMarkdown(
          `- ${container}[${formatFileLocation(r.uri, r.pos.line)}](${openUri.toString()})\n`
        );
      }
      if (refs.length > top.length) md.appendMarkdown(`\n… and ${refs.length - top.length} more\n`);
    }

    return new vscode.Hover(md);
  }
}
