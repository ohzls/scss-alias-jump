import * as path from "path";
import * as vscode from "vscode";
import { readTextFile } from "./fsText";
import { stripComments, tokenBoundaryOk } from "./textScan";
import { inferCssClassNameAtLine } from "./cssInference";
import { escapeRegExp, splitLines } from "./strings";
import { AMP_SELECTOR_RE, CLASS_SELECTOR_RE, EXCLUDE_PATTERN, MAX_SEARCH_RESULTS, MAX_DEFINITION_RESULTS, CACHE_TTL_MS } from "./constants";

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
  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.refs;

  const refs: ClassUsage[] = [];
  const token = className;

  const files = await vscode.workspace.findFiles(
    "**/*.{ts,tsx,js,jsx,vue,svelte,html}",
    EXCLUDE_PATTERN
  );

  for (const file of files) {
    const text = await readTextFile(file);
    if (!text) continue;
    if (!text.includes(token)) continue;

    const lines = splitLines(text);
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i] ?? "";
      const line = stripComments(raw);
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
        if (refs.length >= MAX_SEARCH_RESULTS) break;
      }
      if (refs.length >= MAX_SEARCH_RESULTS) break;
    }
    if (refs.length >= MAX_SEARCH_RESULTS) break;
  }

  classUsageCache.set(key, { ts: now, refs });
  return refs;
}

/**
 * Find the column position of a class/selector definition in a line
 * Returns the column of & or . character
 */
function findSelectorPositionInLine(line: string): number | null {
  // Find & position first
  const ampMatch = AMP_SELECTOR_RE.exec(line);
  if (ampMatch) {
    return line.indexOf("&");
  }
  
  // Find . position
  const classMatch = CLASS_SELECTOR_RE.exec(line);
  if (classMatch) {
    return classMatch.index + 1; // +1 to skip the dot
  }
  
  return null;
}

/**
 * Find class definition in a specific document
 * Supports nested SCSS with & operator (e.g., .chat { &-header-actions { ... } })
 */
export async function findClassDefinitionInDocument(
  className: string,
  document: vscode.TextDocument
): Promise<vscode.Location | null> {
  const text = document.getText();
  const lines = splitLines(text);

  // First pass: try direct class match
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const classMatch = new RegExp(`\\.(${escapeRegExp(className)})(?![\\w-])`).exec(line);
    if (classMatch && /\s*[{,:]/.test(line.slice(classMatch.index + classMatch[0].length))) {
      const col = classMatch.index + 1; // +1 to skip the dot
      return new vscode.Location(document.uri, new vscode.Position(i, col));
    }
  }

  // Second pass: check for nested SCSS using existing cssInference logic
  for (let i = 0; i < lines.length; i++) {
    const inferredClassName = inferCssClassNameAtLine(lines, i);
    
    if (inferredClassName === className) {
      const line = lines[i] ?? "";
      const col = findSelectorPositionInLine(line);
      
      if (col !== null) {
        return new vscode.Location(document.uri, new vscode.Position(i, col));
      }
    }
  }

  return null;
}

/**
 * Find class definition in workspace SCSS/CSS files
 * Supports nested SCSS with & operator using existing cssInference logic
 */
export async function findClassDefinitionInWorkspace(
  className: string
): Promise<vscode.Location[]> {
  const locations: vscode.Location[] = [];

  const files = await vscode.workspace.findFiles(
    "**/*.{scss,sass,css,vue,svelte}",
    EXCLUDE_PATTERN
  );

  for (const file of files) {
    const text = await readTextFile(file);
    if (!text) continue;

    // Quick check to avoid processing files that don't contain relevant characters
    if (!text.includes(className) && !text.includes("&")) continue;

    const lines = splitLines(text);
    
    // First pass: direct class match
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      
      const classMatch = new RegExp(`\\.(${escapeRegExp(className)})(?![\\w-])`).exec(line);
      if (classMatch && /\s*[{,:]/.test(line.slice(classMatch.index + classMatch[0].length))) {
        const col = classMatch.index + 1; // +1 to skip the dot
        locations.push(new vscode.Location(file, new vscode.Position(i, col)));
        
        if (locations.length >= MAX_DEFINITION_RESULTS) break;
      }
    }
    
    // Second pass: check for nested SCSS using existing cssInference logic
    if (locations.length < MAX_DEFINITION_RESULTS) {
      for (let i = 0; i < lines.length; i++) {
        const inferredClassName = inferCssClassNameAtLine(lines, i);
        
        if (inferredClassName === className) {
          const line = lines[i] ?? "";
          
          // Avoid duplicates
          const alreadyAdded = locations.some(
            loc => loc.uri.toString() === file.toString() && loc.range.start.line === i
          );
          if (alreadyAdded) continue;
          
          const col = findSelectorPositionInLine(line);
          if (col !== null) {
            locations.push(new vscode.Location(file, new vscode.Position(i, col)));
            if (locations.length >= MAX_DEFINITION_RESULTS) break;
          }
        }
      }
    }
    
    if (locations.length >= MAX_DEFINITION_RESULTS) break;
  }

  return locations;
}
