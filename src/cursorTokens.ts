import * as path from "path";
import * as vscode from "vscode";
import { USE_FORWARD_IMPORT_RE } from "./constants";
import { ensureNoExt } from "./sassResolve";
import { splitLines } from "./strings";
import { firstNonCommentIdx } from "./textScan";

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

/**
 * Check if cursor is on & selector (returns full token including &)
 */
export function isOnAmpSelector(
  document: vscode.TextDocument,
  position: vscode.Position
): boolean {
  return getAmpSegmentUnderCursor(document, position) !== null;
}

/**
 * Extract CSS Module class reference (styles.className, layout.className, or $style.className)
 * Returns className and the import variable name
 */
export function getCssModuleClassUnderCursor(
  document: vscode.TextDocument,
  position: vscode.Position,
  allowedImportVars?: readonly string[]
): { className: string; importVar: string } | null {
  const lineText = document.lineAt(position.line).text;
  const allowed = allowedImportVars ? new Set(allowedImportVars) : null;
  
  // Match any imported CSS Module namespace (`styles.foo`, `layout.foo`,
  // `appLayout.foo`, `styles["foo-bar"]`) and Vue's built-in `$style.foo`
  // namespace. Whether the namespace is actually a CSS Module import is
  // validated by the provider before this helper is called.
  const patterns = [
    { re: /(^|[^A-Za-z0-9_$.])([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z0-9_-]+)/g, classNameGroup: 3 },
    { re: /(^|[^A-Za-z0-9_$.])([A-Za-z_$][\w$]*)\s*\[\s*(['"])([A-Za-z0-9_-]+)\3\s*\]/g, classNameGroup: 4 },
  ];
  
  for (const { re: pattern, classNameGroup } of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    
    while ((match = pattern.exec(lineText))) {
      const importVar = match[2];
      const className = match[classNameGroup];
      const matchStart = match.index + match[1].length;
      const matchEnd = match.index + match[0].length;
      if (allowed && !allowed.has(importVar)) continue;
      
      // Allow cursor anywhere in the match (styles.fileItem)
      // User can click on 'styles', '.', or 'fileItem' - all should work
      if (position.character >= matchStart && position.character <= matchEnd) {
        return { className, importVar };
      }
    }
  }
  
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
  const commentIdx = firstNonCommentIdx(line);
  if (positionCh >= commentIdx) return null;

  const searchableLine = line.slice(0, commentIdx);
  USE_FORWARD_IMPORT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = USE_FORWARD_IMPORT_RE.exec(searchableLine))) {
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
 * Supports: class="foo", className="foo", class={"foo"} (Svelte),
 * Vue bound class literal expressions, and class:foo (Svelte).
 */
export function getClassNameUnderCursor(line: string, character: number): string | null {
  // Dynamic bindings must run before static attributes. Otherwise the static
  // `class="..."` matcher can see the `class` substring inside `:class="..."`.
  const boundClassAttr = /(?::class|v-bind:class)\s*=\s*(["'])(.*?)\1/g;
  let boundMatch: RegExpExecArray | null;
  while ((boundMatch = boundClassAttr.exec(line))) {
    const expression = boundMatch[2];
    const expressionStart = boundMatch.index + boundMatch[0].indexOf(expression);
    const expressionEnd = expressionStart + expression.length;
    if (character < expressionStart || character > expressionEnd) continue;

    const literalClass = classFromBoundClassExpression(expression, expressionStart, character);
    if (literalClass) return literalClass;
  }

  const staticPatterns = [
    /(^|[\s<{])(?:class|className)\s*=\s*(["'])([^"']*)\2/g,          // class="foo"
    /(^|[\s<{])(?:class|className)\s*=\s*\{\s*(["'])([^"']*)\2\s*\}/g, // class={"foo"} (Svelte)
  ];

  for (const pattern of staticPatterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line))) {
      const classValue = match[3];
      const valueStart = match.index + match[0].indexOf(classValue);
      const className = classFromSpaceSeparatedValue(classValue, valueStart, character);
      if (className) return className;
    }
  }

  const svelteDirective = /(^|[\s<{])class:([A-Za-z0-9_-]+)/g;
  let directiveMatch: RegExpExecArray | null;
  while ((directiveMatch = svelteDirective.exec(line))) {
    const classValue = directiveMatch[2];
    const classStart = directiveMatch.index + directiveMatch[0].indexOf(classValue);
    const classEnd = classStart + classValue.length;
    if (character >= classStart && character <= classEnd) return classValue;
  }

  return null;
}

function classFromSpaceSeparatedValue(value: string, valueStart: number, character: number): string | null {
  const classToken = /\S+/g;
  let tokenMatch: RegExpExecArray | null;
  while ((tokenMatch = classToken.exec(value))) {
    const className = tokenMatch[0].trim();
    if (!className) continue;
    const classStart = valueStart + tokenMatch.index;
    const classEnd = classStart + className.length;
    if (character >= classStart && character <= classEnd) return className;
  }
  return null;
}

function classFromBoundClassExpression(expression: string, expressionStart: number, character: number): string | null {
  const bareObjectKey = /(^|[{\[,]\s*)([A-Za-z_$][\w$-]*)\s*:/g;
  let bareKeyMatch: RegExpExecArray | null;
  while ((bareKeyMatch = bareObjectKey.exec(expression))) {
    const className = bareKeyMatch[2];
    const classStart = expressionStart + bareKeyMatch.index + bareKeyMatch[0].indexOf(className);
    const classEnd = classStart + className.length;
    if (character >= classStart && character <= classEnd) return className;
  }

  const stringLiteral = /(['"])([^'"]*)\1/g;
  let stringMatch: RegExpExecArray | null;
  while ((stringMatch = stringLiteral.exec(expression))) {
    const afterLiteral = expression.slice(stringMatch.index + stringMatch[0].length);
    if (/^\s*:/.test(afterLiteral)) {
      const quotedKey = classFromSpaceSeparatedValue(
        stringMatch[2],
        expressionStart + stringMatch.index + 1,
        character
      );
      if (quotedKey) return quotedKey;
      continue;
    }
    if (isLikelyNonClassStringLiteral(expression, stringMatch.index)) continue;

    const literalClass = classFromSpaceSeparatedValue(
      stringMatch[2],
      expressionStart + stringMatch.index + 1,
      character
    );
    if (literalClass) return literalClass;
  }

  return null;
}

function isLikelyNonClassStringLiteral(expression: string, literalStart: number): boolean {
  const beforeLiteral = expression.slice(0, literalStart);
  const previousNonSpace = beforeLiteral.trimEnd().slice(-1);
  if (previousNonSpace && /[=<>!]/.test(previousNonSpace)) return true;

  const lastObjectSegmentStart = Math.max(
    beforeLiteral.lastIndexOf("{"),
    beforeLiteral.lastIndexOf(",")
  ) + 1;
  const segment = beforeLiteral.slice(lastObjectSegmentStart);
  const firstColon = segment.indexOf(":");
  if (firstColon < 0) return false;

  const firstQuestion = segment.indexOf("?");
  return firstQuestion < 0 || firstColon < firstQuestion;
}
