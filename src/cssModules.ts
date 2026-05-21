import * as path from "path";
import * as vscode from "vscode";
import { resolveAliasToAbsolute } from "./aliasResolve";
import type { AliasMap } from "./settings";
import { splitLines } from "./strings";

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

/**
 * Find the CSS Module import path for a given variable name
 * Example: import styles from './ChatInput.module.scss'
 */
export function findCssModuleImport(
  text: string,
  importVarName: string
): string | null {
  const lines = splitLines(text);
  
  // Match: import styles from './ChatInput.module.scss'
  // or: import styles from './ChatInput.module' (extension omitted)
  // or: import * as styles from './ChatInput.module.scss'
  const importVarPattern = escapeRegExp(importVarName);
  const patterns = [
    // With full extension: .module.scss, .module.sass, .module.css
    new RegExp(`import\\s+${importVarPattern}\\s+from\\s+['"]([^'"]+\\.module\\.(?:scss|sass|css))['"]`),
    // With partial extension: .module (TypeScript auto-resolves)
    new RegExp(`import\\s+${importVarPattern}\\s+from\\s+['"]([^'"]+\\.module)['"]`),
    // With * as syntax
    new RegExp(`import\\s+\\*\\s+as\\s+${importVarPattern}\\s+from\\s+['"]([^'"]+\\.module(?:\\.(?:scss|sass|css))?)['"]`),
    // Regular CSS import (non-module)
    new RegExp(`import\\s+${importVarPattern}\\s+from\\s+['"]([^'"]+\\.(?:scss|sass|css))['"]`),
  ];
  
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = pattern.exec(line);
      if (match) {
        return match[1];
      }
    }
  }
  
  return null;
}

export function findCssModuleImportVars(text: string): string[] {
  const lines = splitLines(text);
  const vars = new Set<string>();
  const patterns = [
    /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+\.module(?:\.(?:scss|sass|css))?)['"]/g,
    /import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+\.module(?:\.(?:scss|sass|css))?)['"]/g,
    /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+\.(?:scss|sass|css))['"]/g,
  ];

  for (const line of lines) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(line))) {
        vars.add(match[1]);
      }
    }
  }

  return [...vars];
}

/**
 * Resolve CSS Module import path to absolute file path
 * Tries multiple extensions if not specified
 */
export async function resolveCssModulePath(
  importPath: string,
  fromFilePath: string,
  aliases: AliasMap = {},
  uriForWorkspace: vscode.Uri = vscode.Uri.file(fromFilePath)
): Promise<string | null> {
  const fromDir = path.dirname(fromFilePath);
  const aliasResolved = resolveAliasToAbsolute(importPath, fromFilePath, aliases, uriForWorkspace);
  const basePath = aliasResolved ?? path.resolve(fromDir, importPath);
  
  // If import path already has extension, try it directly
  if (importPath.endsWith('.scss') || importPath.endsWith('.sass') || importPath.endsWith('.css')) {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(basePath));
      return basePath;
    } catch {
      return null;
    }
  }
  
  // If no extension or only .module, try common extensions
  const candidates = [
    basePath + '.scss',
    basePath + '.sass',
    basePath + '.css',
  ];
  
  for (const candidate of candidates) {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(candidate));
      return candidate;
    } catch {
      // Continue to next candidate
    }
  }
  
  return null;
}
