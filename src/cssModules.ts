import * as path from "path";
import * as vscode from "vscode";
import { splitLines } from "./strings";

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
  const patterns = [
    // With full extension: .module.scss, .module.sass, .module.css
    new RegExp(`import\\s+${importVarName}\\s+from\\s+['"]([^'"]+\\.module\\.(?:scss|sass|css))['"]`),
    // With partial extension: .module (TypeScript auto-resolves)
    new RegExp(`import\\s+${importVarName}\\s+from\\s+['"]([^'"]+\\.module)['"]`),
    // With * as syntax
    new RegExp(`import\\s+\\*\\s+as\\s+${importVarName}\\s+from\\s+['"]([^'"]+\\.module(?:\\.(?:scss|sass|css))?)['"]`),
    // Regular CSS import (non-module)
    new RegExp(`import\\s+${importVarName}\\s+from\\s+['"]([^'"]+\\.(?:scss|sass|css))['"]`),
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

/**
 * Resolve CSS Module import path to absolute file path
 * Tries multiple extensions if not specified
 */
export async function resolveCssModulePath(
  importPath: string,
  fromFilePath: string
): Promise<string | null> {
  const fromDir = path.dirname(fromFilePath);
  
  // If import path already has extension, try it directly
  if (importPath.endsWith('.scss') || importPath.endsWith('.sass') || importPath.endsWith('.css')) {
    const resolved = path.resolve(fromDir, importPath);
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(resolved));
      return resolved;
    } catch {
      return null;
    }
  }
  
  // If no extension or only .module, try common extensions
  const basePath = path.resolve(fromDir, importPath);
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
