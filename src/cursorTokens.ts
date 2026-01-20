import * as path from "path";
import * as vscode from "vscode";
import { USE_FORWARD_IMPORT_RE } from "./constants";
import { ensureNoExt } from "./sassResolve";
import { splitLines } from "./strings";

export function getPlaceholderNameUnderCursor(
  document: vscode.TextDocument,
  position: vscode.Position
): string | null {
  const lineText = document.lineAt(position.line).text;
  const commentIdx = lineText.indexOf("//");
  if (commentIdx >= 0 && position.character >= commentIdx) return null;

  const pctRange = document.getWordRangeAtPosition(position, /%[A-Za-z0-9_-]+/);
  if (pctRange) {
    const t = document.getText(pctRange);
    if (t.startsWith("%") && t.length > 1) return t.slice(1);
  }
  return null;
}

export function getAmpSegmentUnderCursor(
  document: vscode.TextDocument,
  position: vscode.Position
): string | null {
  const lineText = document.lineAt(position.line).text;
  const commentIdx = lineText.indexOf("//");
  if (commentIdx >= 0 && position.character >= commentIdx) return null;

  const r = document.getWordRangeAtPosition(position, /&[A-Za-z0-9_-]+/);
  if (!r) return null;
  const t = document.getText(r);
  if (t.startsWith("&") && t.length > 1) return t.slice(1);
  return null;
}

export function getNamespacedVarRefUnderCursor(
  document: vscode.TextDocument,
  position: vscode.Position
): { namespace: string; varName: string; range: vscode.Range } | null {
  const lineText = document.lineAt(position.line).text;
  const commentIdx = lineText.indexOf("//");
  if (commentIdx >= 0 && position.character >= commentIdx) return null;

  const range = document.getWordRangeAtPosition(position, /[A-Za-z0-9_-]+\.\$[A-Za-z0-9_-]+/);
  if (!range) return null;
  const t = document.getText(range);
  const m = /^([A-Za-z0-9_-]+)\.\$([A-Za-z0-9_-]+)$/.exec(t);
  if (!m) return null;
  return { namespace: m[1], varName: m[2], range };
}

export function getImportPathUnderCursorOnLine(
  line: string,
  positionCh: number
): { importPath: string; startIdx: number; endIdx: number } | null {
  USE_FORWARD_IMPORT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = USE_FORWARD_IMPORT_RE.exec(line))) {
    const full = match[0];
    const importPath = match[3];
    const q = match[2];
    const q1 = match.index + full.indexOf(q);
    const q2 = match.index + full.lastIndexOf(q);
    // Prefer linking/selecting just the path inside quotes to avoid overlapping generic link providers.
    const startIdx = q1 >= 0 ? q1 + 1 : match.index + full.indexOf(importPath);
    const endIdx = q2 >= 0 ? q2 : match.index + full.indexOf(importPath) + importPath.length;
    if (positionCh >= startIdx && positionCh <= endIdx) {
      return { importPath, startIdx, endIdx }; // endIdx is exclusive for vscode.Range
    }
  }
  return null;
}

export function deriveDefaultNamespace(importPath: string) {
  const p = ensureNoExt(importPath.trim());
  const base = path.posix.basename(p);
  return base.replace(/^_/, "");
}

export function parseUseNamespaceMap(text: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = splitLines(text);
  const re = /@use\s+(['"])([^'"]+)\1(?:\s+as\s+([A-Za-z0-9_-]+|\*))?/;

  for (const raw of lines) {
    const idx = raw.indexOf("//");
    const line = raw.slice(0, idx >= 0 ? idx : raw.length);
    if (!line.includes("@use")) continue;
    const m = re.exec(line);
    if (!m) continue;
    const importPath = m[2];
    const asName = m[3];
    if (asName === "*") continue;
    const ns = asName && asName.length > 0 ? asName : deriveDefaultNamespace(importPath);
    map.set(ns, importPath);
  }

  return map;
}

export function getCssClassUnderCursor(
  document: vscode.TextDocument,
  position: vscode.Position
): { className: string; range: vscode.Range } | null {
  const lineText = document.lineAt(position.line).text;
  const commentIdx = lineText.indexOf("//");
  if (commentIdx >= 0 && position.character >= commentIdx) return null;

  const range = document.getWordRangeAtPosition(position, /\.[A-Za-z0-9_-]+/);
  if (!range) return null;
  const t = document.getText(range);
  if (!t.startsWith(".") || t.length <= 1) return null;
  return { className: t.slice(1), range };
}

/**
 * Extract class name from template class attribute (Vue/Svelte)
 * Supports: class="foo", className="foo", :class="foo", v-bind:class="foo", class:foo
 * Also supports: class={foo} (Svelte), class={"foo"} (Svelte)
 */
export function getClassNameUnderCursor(line: string, character: number): string | null {
  // Patterns for class attributes
  const patterns = [
    /(?:class|className)\s*=\s*["']([^"']+)["']/g,        // class="foo"
    /(?:class|className)\s*=\s*\{["']([^"']+)["']\}/g,    // class={"foo"} (Svelte)
    /:class\s*=\s*["']([^"']+)["']/g,                     // :class="foo" (Vue)
    /v-bind:class\s*=\s*["']([^"']+)["']/g,               // v-bind:class="foo" (Vue)
    /class:([A-Za-z0-9_-]+)/g,                            // class:foo (Svelte)
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    
    while ((match = pattern.exec(line))) {
      const fullMatch = match[0];
      const classValue = match[1];
      const matchStart = match.index;
      const matchEnd = matchStart + fullMatch.length;

      // Check if cursor is within this match
      if (character >= matchStart && character <= matchEnd) {
        // If the class value contains multiple classes, find which one is under cursor
        if (classValue.includes(" ")) {
          const classes = classValue.split(/\s+/);
          const valueStart = matchStart + fullMatch.indexOf(classValue);
          
          let offset = valueStart;
          for (const cls of classes) {
            const clsStart = offset;
            const clsEnd = offset + cls.length;
            
            if (character >= clsStart && character <= clsEnd && cls.trim()) {
              return cls.trim();
            }
            
            offset = clsEnd + 1; // +1 for space
          }
        } else if (classValue.trim()) {
          return classValue.trim();
        }
      }
    }
  }

  return null;
}
