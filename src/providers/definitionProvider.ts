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
  getCssClassUnderCursor,
  getAmpSegmentUnderCursor,
  getCssModuleClassUnderCursor,
} from "../cursorTokens";
import { findPlaceholderDefinitions } from "../placeholders";
import { findVariableDefinitionInModule, resolveSassModuleFromUse } from "../sassModule";
import { debug as dbg } from "../output";
import { findClassDefinitionInDocument, findClassDefinitionInWorkspace, findClassUsages, findClassUsagesByPrefix } from "../classUsage";
import { parseScssVariables } from "../scssVariables";
import { inferCssClassNameAtLine, buildOpenSelectorStack } from "../cssInference";
import { splitLines } from "../strings";
import { findCssModuleImport, resolveCssModulePath } from "../cssModules";

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

    // 0a) React/TypeScript CSS Modules → SCSS definition jump (styles.fileItem → .fileItem)
    if (document.languageId === "typescript" || document.languageId === "typescriptreact" || 
        document.languageId === "javascript" || document.languageId === "javascriptreact") {
      
      if (debug) {
        dbg(
          this.out,
          `[css-module-check] languageId=${document.languageId}, line="${line}", char=${position.character}`,
          document.uri
        );
      }
      
      const cssModuleRef = getCssModuleClassUnderCursor(document, position);
      
      if (debug && !cssModuleRef) {
        dbg(
          this.out,
          `[css-module-check] getCssModuleClassUnderCursor returned null`,
          document.uri
        );
      }
      
      if (cssModuleRef) {
        if (debug) {
          dbg(
            this.out,
            `[css-module] Clicked on ${cssModuleRef.importVar}.${cssModuleRef.className}`,
            document.uri
          );
        }

        // Find the CSS Module import path
        const text = document.getText();
        const importPath = findCssModuleImport(text, cssModuleRef.importVar);
        
        if (importPath) {
          if (debug) {
            dbg(
              this.out,
              `[css-module] Found import: ${cssModuleRef.importVar} from "${importPath}"`,
              document.uri
            );
          }

          // Resolve to absolute path
          const docFsPath = getDocFsPath(document);
          if (docFsPath) {
            const scssFilePath = await resolveCssModulePath(importPath, docFsPath);
            
            if (scssFilePath) {
              if (debug) {
                dbg(
                  this.out,
                  `[css-module] Resolved to: ${scssFilePath}`,
                  document.uri
                );
              }

              // Open the SCSS file and find the class definition
              const scssUri = vscode.Uri.file(scssFilePath);
              const scssDoc = await vscode.workspace.openTextDocument(scssUri);
              const location = await findClassDefinitionInDocument(cssModuleRef.className, scssDoc);
              
              if (location) {
                if (debug) {
                  dbg(
                    this.out,
                    `[hit] Found .${cssModuleRef.className} in ${scssFilePath}`,
                    document.uri
                  );
                }
                return location;
              }

              // If not found in the same file, search workspace
              const locations = await findClassDefinitionInWorkspace(cssModuleRef.className);
              if (locations.length > 0) {
                if (debug) {
                  dbg(
                    this.out,
                    `[hit] Found .${cssModuleRef.className} in workspace (${locations.length} locations)`,
                    document.uri
                  );
                }
                return locations.length === 1 ? locations[0] : locations;
              }

              if (debug) {
                dbg(
                  this.out,
                  `[miss] .${cssModuleRef.className} not found in ${scssFilePath}`,
                  document.uri
                );
              }
            }
          }
        }
      }
    }

    // 0b) SCSS class/amp selector → Find usages in React/Vue/Svelte (reverse jump)
    if (document.languageId === "scss" || document.languageId === "sass" || document.languageId === "css") {
      const ampSegment = getAmpSegmentUnderCursor(document, position);
      const classResult = getCssClassUnderCursor(document, position);
      
      // Only proceed if user clicked on .class or &amp selector
      if (ampSegment || classResult) {
        // Parse SCSS variables for interpolation support
        const text = document.getText();
        const variables = parseScssVariables(text);
        const lines = splitLines(text);
        
        if (debug) {
          const varList = Array.from(variables.entries()).map(([k, v]) => `$${k}="${v}"`).join(', ');
          dbg(
            this.out,
            `[scss-vars] Parsed ${variables.size} variables: ${varList}`,
            document.uri
          );
          
          // Log stack for debugging
          const stack = buildOpenSelectorStack(lines, position.line, variables);
          const stackInfo = stack.map(s => `[L${s.line + 1}:D${s.depth}]"${s.text}"`).join(' → ');
          dbg(
            this.out,
            `[scss-stack] Stack at line ${position.line + 1}: ${stackInfo}`,
            document.uri
          );
        }
        
        // Infer full class name (handles .class, &Menu, #{$aux} { &Menu, etc.)
        const inferredClassName = inferCssClassNameAtLine(lines, position.line, variables);
        
        if (inferredClassName) {
          if (debug) {
            dbg(
              this.out,
              `[scss-reverse] Clicked on ${ampSegment ? '&' + ampSegment : '.' + (classResult?.className || '')}, inferred: ${inferredClassName}`,
              document.uri
            );
          }

          // Find usages in template files and CSS Modules
          const usages = await findClassUsages(inferredClassName);
          if (usages.length > 0) {
            if (debug) {
              dbg(
                this.out,
                `[hit] Found ${usages.length} usages of ${inferredClassName}`,
                document.uri
              );
            }
            // Convert to locations
            const locations = usages.map(u => new vscode.Location(u.uri, u.pos));
            return locations.length === 1 ? locations[0] : locations;
          }

          if (debug) dbg(this.out, `[miss] No usages found for ${inferredClassName}`, document.uri);
          // Continue to other handlers (like @use/@import)
        }
      }
    }

    // 0c) Template class attribute jump (Vue/Svelte)
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
