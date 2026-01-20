import { braceDelta, stripComments, pruneStack } from "./textScan";
import { AMP_SELECTOR_RE, CLASS_SELECTOR_RE } from "./constants";
import { parseScssVariables, resolveInterpolation, extractClassName } from "./scssVariables";

export function buildOpenSelectorStack(
  lines: string[],
  lineNo: number,
  variables?: Map<string, string>
): Array<{ text: string; depth: number; line: number }> {
  let depth = 0;
  const stack: Array<{ text: string; depth: number; line: number }> = [];

  for (let i = 0; i <= lineNo; i++) {
    const raw = lines[i] ?? "";
    const line = stripComments(raw);
    const depthBefore = depth;

    // Find the opening brace for a block, but skip interpolation braces #{...}
    let braceIdx = -1;
    let searchFrom = 0;
    while (true) {
      const idx = line.indexOf("{", searchFrom);
      if (idx < 0) break;
      
      // Check if this is part of interpolation #{ ... }
      if (idx > 0 && line[idx - 1] === "#") {
        // Find the closing }
        const closeIdx = line.indexOf("}", idx);
        if (closeIdx >= 0) {
          searchFrom = closeIdx + 1;
          continue;
        }
      }
      
      // This is a block opening brace
      braceIdx = idx;
      break;
    }

    if (braceIdx >= 0) {
      let sel = line.slice(0, braceIdx).trim();
      
      // Resolve SCSS interpolation if variables provided
      if (variables && sel.includes("#{")) {
        const resolved = resolveInterpolation(sel, variables);
        if (resolved) {
          sel = resolved;
        }
      }
      
      if (sel.length > 0) {
        stack.push({ text: sel, depth: depthBefore + 1, line: i });
      }
    }

    depth += braceDelta(raw);
    pruneStack(stack, depth);
  }

  return stack;
}

export function inferCssClassNameAtLine(
  lines: string[], 
  lineNo: number,
  variables?: Map<string, string>
): string | null {
  const stack = buildOpenSelectorStack(lines, lineNo, variables);

  // Find the LAST (most recent) class selector in the stack
  // This handles cases where #{$aux} creates a new base selector
  let baseIdx = -1;
  let baseClass: string | null = null;
  for (let i = stack.length - 1; i >= 0; i--) {
    const t = stack[i]?.text ?? "";
    const m = CLASS_SELECTOR_RE.exec(t);
    if (m) {
      baseIdx = i;
      baseClass = m[1];
      break;
    }
  }
  if (!baseClass) return null;

  // Combine base class with all following & segments
  let outName = baseClass;
  for (let i = baseIdx + 1; i < stack.length; i++) {
    const t = stack[i]?.text ?? "";
    const m = AMP_SELECTOR_RE.exec(t);
    if (!m) continue;
    const seg = m[0].slice(1);
    if (!/^[A-Za-z0-9_-]+$/.test(seg)) continue;
    outName += seg;
  }
  return outName;
}
