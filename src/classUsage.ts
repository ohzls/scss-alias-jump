import * as path from "path";
import * as vscode from "vscode";
import { readTextFile } from "./fsText";
import { findCssModuleImportVars } from "./cssModules";
import { stripComments, tokenBoundaryOk } from "./textScan";
import { inferCssClassNameAtLine } from "./cssInference";
import { escapeRegExp, splitLines } from "./strings";
import {
  AMP_SELECTOR_RE,
  CACHE_TTL_MS,
  CLASS_SELECTOR_RE,
  MAX_DEFINITION_RESULTS,
  MAX_SEARCH_RESULTS,
  SCAN_LINE_CANCELLATION_INTERVAL,
} from "./constants";
import {
  findWorkspaceFiles,
  runDedupedCancellableScan,
  scanCacheKey,
  throwIfCancellationRequested,
  WorkspaceScanOptions,
  yieldToExtensionHostIfNeeded,
} from "./scan";

export type ClassUsage = {
  uri: vscode.Uri;
  pos: vscode.Position;
  hint: string | null;
};

type ClassUsageCacheEntry = { ts: number; refs: ClassUsage[] };
const classUsageCache = new Map<string, ClassUsageCacheEntry>();

export function clearClassUsageCache(): number {
  const size = classUsageCache.size;
  classUsageCache.clear();
  return size;
}

function fileHintFromPath(uri: vscode.Uri) {
  const b = path.basename(uri.fsPath);
  return b;
}

function lineHasClassUsageSignal(line: string, cssModuleImportVars: readonly string[] = []) {
  return (
    line.includes("class=") ||
    line.includes("className=") ||
    line.includes(":class") ||
    line.includes("v-bind:class") ||
    line.includes("class:") ||
    line.includes("clsx(") ||
    line.includes("classnames(") ||
    line.includes("styles.") ||      // CSS Modules (React/Vue)
    line.includes("styles[") ||      // CSS Modules bracket access
    line.includes("$style.") ||       // CSS Modules (Vue)
    line.includes("$style[") ||       // CSS Modules bracket access (Vue)
    cssModuleImportVars.some((importVar) => line.includes(`${importVar}.`) || line.includes(`${importVar}[`))
  );
}

type CssModuleUsagePattern = {
  re: RegExp;
  classStart: (match: RegExpExecArray) => number;
};

function classNameStart(match: RegExpExecArray, tokenText: string): number {
  return match.index + match[0].lastIndexOf(tokenText);
}

function buildCssModuleUsagePatterns(importVars: readonly string[], tokenText: string): CssModuleUsagePattern[] {
  const token = escapeRegExp(tokenText);
  const patterns = importVars.flatMap((importVar) => {
    const ns = escapeRegExp(importVar);
    return [
      {
        re: new RegExp(`\\b${ns}\\.${token}(?![A-Za-z0-9_])`, "g"),
        classStart: (match: RegExpExecArray) => classNameStart(match, tokenText),
      },
      {
        re: new RegExp(`\\b${ns}\\s*\\[\\s*(['"])${token}\\1\\s*\\]`, "g"),
        classStart: (match: RegExpExecArray) => classNameStart(match, tokenText),
      },
    ];
  });
  patterns.push(
    {
      re: new RegExp(`\\$style\\.${token}(?![A-Za-z0-9_])`, "g"),
      classStart: (match: RegExpExecArray) => classNameStart(match, tokenText),
    },
    {
      re: new RegExp(`\\$style\\s*\\[\\s*(['"])${token}\\1\\s*\\]`, "g"),
      classStart: (match: RegExpExecArray) => classNameStart(match, tokenText),
    }
  );
  return patterns;
}

export async function findClassUsages(
  className: string,
  options: WorkspaceScanOptions = {}
): Promise<ClassUsage[]> {
  const key = scanCacheKey("class-usages", className, options);
  const cached = classUsageCache.get(key);
  const now = Date.now();
  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.refs;

  return runDedupedCancellableScan(key, options, async (token) => {
    const refs: ClassUsage[] = [];
    const tokenText = className;

    const files = await findWorkspaceFiles("**/*.{ts,tsx,js,jsx,vue,svelte,html}", { ...options, token });

    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      throwIfCancellationRequested(token);
      const file = files[fileIndex];
      const text = await readTextFile(file, { token });
      if (!text) continue;
      if (!text.includes(tokenText)) continue;
      const cssModuleImportVars = findCssModuleImportVars(text);

      const lines = splitLines(text);
      for (let i = 0; i < lines.length; i++) {
        if (i % SCAN_LINE_CANCELLATION_INTERVAL === 0) throwIfCancellationRequested(token);
        const raw = lines[i] ?? "";
        const line = stripComments(raw);
        if (!line.includes(tokenText)) continue;
        if (!lineHasClassUsageSignal(line, cssModuleImportVars)) continue;

        // First check for CSS Modules usage (`styles.mainMenu`, `layout.mainMenu`,
        // or Vue `$style.mainMenu`).
        const cssModulesPatterns = buildCssModuleUsagePatterns(cssModuleImportVars, tokenText);

        let foundCssModules = false;
        for (const usagePattern of cssModulesPatterns) {
          usagePattern.re.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = usagePattern.re.exec(line))) {
            refs.push({
              uri: file,
              pos: new vscode.Position(i, usagePattern.classStart(match)),
              hint: fileHintFromPath(file),
            });
            foundCssModules = true;
            if (refs.length >= MAX_SEARCH_RESULTS) break;
          }
          if (refs.length >= MAX_SEARCH_RESULTS) break;
        }

        // Then check for regular class usage (class="mainMenu") only if not CSS Modules
        if (!foundCssModules) {
          let from = 0;
          while (true) {
            const idx = line.indexOf(tokenText, from);
            if (idx < 0) break;
            from = idx + tokenText.length;
            if (!tokenBoundaryOk(line, idx, tokenText.length)) continue;

            refs.push({
              uri: file,
              pos: new vscode.Position(i, idx),
              hint: fileHintFromPath(file),
            });
            if (refs.length >= MAX_SEARCH_RESULTS) break;
          }
        }

        if (refs.length >= MAX_SEARCH_RESULTS) break;
      }
      if (refs.length >= MAX_SEARCH_RESULTS) break;
      await yieldToExtensionHostIfNeeded(fileIndex + 1, token);
    }

    throwIfCancellationRequested(token);
    classUsageCache.set(key, { ts: now, refs });
    return refs;
  });
}

/**
 * Find class usages that start with a given prefix
 * Useful for SCSS interpolation blocks: #{$aux} { &Menu, &Item, etc. }
 */
export async function findClassUsagesByPrefix(
  classPrefix: string,
  options: WorkspaceScanOptions = {}
): Promise<ClassUsage[]> {
  const key = scanCacheKey("class-usages-prefix", classPrefix, options);
  return runDedupedCancellableScan(key, options, async (token) => {
    const refs: ClassUsage[] = [];

    const files = await findWorkspaceFiles("**/*.{ts,tsx,js,jsx,vue,svelte,html}", { ...options, token });

    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      throwIfCancellationRequested(token);
      const file = files[fileIndex];
      const text = await readTextFile(file, { token });
      if (!text) continue;
      const cssModuleImportVars = findCssModuleImportVars(text);

      const lines = splitLines(text);
      for (let i = 0; i < lines.length; i++) {
        if (i % SCAN_LINE_CANCELLATION_INTERVAL === 0) throwIfCancellationRequested(token);
        const raw = lines[i] ?? "";
        const line = stripComments(raw);
        if (!lineHasClassUsageSignal(line, cssModuleImportVars)) continue;

        const cssModulesPatterns = [
          ...cssModuleImportVars.map(
            (importVar) => new RegExp(`\\b${escapeRegExp(importVar)}\\.(${escapeRegExp(classPrefix)}[A-Za-z0-9_-]*)(?![A-Za-z0-9_])`, "g")
          ),
          new RegExp(`\\$style\\.(${escapeRegExp(classPrefix)}[A-Za-z0-9_-]*)(?![A-Za-z0-9_])`, "g"),
        ];
        for (const cssModulesPattern of cssModulesPatterns) {
          let match: RegExpExecArray | null;
          cssModulesPattern.lastIndex = 0;
          while ((match = cssModulesPattern.exec(line))) {
            const fullClassName = match[1]; // auxMenu, auxItem, etc.
            const dotIdx = match.index + match[0].indexOf(".");
            refs.push({
              uri: file,
              pos: new vscode.Position(i, dotIdx + 1),
              hint: `${fileHintFromPath(file)} (${fullClassName})`,
            });
            if (refs.length >= MAX_SEARCH_RESULTS) break;
          }
          if (refs.length >= MAX_SEARCH_RESULTS) break;
        }

        if (refs.length >= MAX_SEARCH_RESULTS) break;
      }
      if (refs.length >= MAX_SEARCH_RESULTS) break;
      await yieldToExtensionHostIfNeeded(fileIndex + 1, token);
    }

    throwIfCancellationRequested(token);
    return refs;
  });
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
  document: vscode.TextDocument,
  token?: vscode.CancellationToken
): Promise<vscode.Location | null> {
  const text = document.getText();
  const lines = splitLines(text);

  // First pass: try direct class match
  for (let i = 0; i < lines.length; i++) {
    if (i % SCAN_LINE_CANCELLATION_INTERVAL === 0) throwIfCancellationRequested(token);
    const line = lines[i] ?? "";
    const classMatch = new RegExp(`\\.(${escapeRegExp(className)})(?![\\w-])`).exec(line);
    if (classMatch && /\s*[{,:]/.test(line.slice(classMatch.index + classMatch[0].length))) {
      const col = classMatch.index + 1; // +1 to skip the dot
      return new vscode.Location(document.uri, new vscode.Position(i, col));
    }
  }

  // Second pass: check for nested SCSS using existing cssInference logic
  for (let i = 0; i < lines.length; i++) {
    if (i % SCAN_LINE_CANCELLATION_INTERVAL === 0) throwIfCancellationRequested(token);
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
  className: string,
  options: WorkspaceScanOptions = {}
): Promise<vscode.Location[]> {
  const key = scanCacheKey("class-definitions", className, options);
  return runDedupedCancellableScan(key, options, async (token) => {
    const locations: vscode.Location[] = [];
    const files = await findWorkspaceFiles("**/*.{scss,sass,css,vue,svelte}", { ...options, token });

    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      throwIfCancellationRequested(token);
      const file = files[fileIndex];
      const text = await readTextFile(file, { token });
      if (!text) continue;

      // Quick check to avoid processing files that don't contain relevant characters
      if (!text.includes(className) && !text.includes("&")) continue;

      const lines = splitLines(text);

      // First pass: direct class match
      for (let i = 0; i < lines.length; i++) {
        if (i % SCAN_LINE_CANCELLATION_INTERVAL === 0) throwIfCancellationRequested(token);
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
          if (i % SCAN_LINE_CANCELLATION_INTERVAL === 0) throwIfCancellationRequested(token);
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
      await yieldToExtensionHostIfNeeded(fileIndex + 1, token);
    }

    throwIfCancellationRequested(token);
    return locations;
  });
}
