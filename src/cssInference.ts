import { braceDelta, firstNonCommentIdx } from "./textScan";

function buildOpenSelectorStack(
  lines: string[],
  lineNo: number
): Array<{ text: string; depth: number; line: number }> {
  let depth = 0;
  const stack: Array<{ text: string; depth: number; line: number }> = [];

  for (let i = 0; i <= lineNo; i++) {
    const raw = lines[i] ?? "";
    const cut = firstNonCommentIdx(raw);
    const line = raw.slice(0, cut);
    const depthBefore = depth;

    const braceIdx = line.indexOf("{");
    if (braceIdx >= 0) {
      const sel = line.slice(0, braceIdx).trim();
      if (sel.length > 0) {
        stack.push({ text: sel, depth: depthBefore + 1, line: i });
      }
    }

    depth += braceDelta(raw);
    while (stack.length > 0 && stack[stack.length - 1].depth > depth) stack.pop();
  }

  return stack;
}

export function inferCssClassNameAtLine(lines: string[], lineNo: number): string | null {
  const stack = buildOpenSelectorStack(lines, lineNo);
  const classRe = /\.([A-Za-z0-9_-]+)/;
  const ampRe = /&[A-Za-z0-9_-]+/;

  let baseIdx = -1;
  let baseClass: string | null = null;
  for (let i = stack.length - 1; i >= 0; i--) {
    const t = stack[i]?.text ?? "";
    const m = classRe.exec(t);
    if (m) {
      baseIdx = i;
      baseClass = m[1];
      break;
    }
  }
  if (!baseClass) return null;

  let outName = baseClass;
  for (let i = baseIdx + 1; i < stack.length; i++) {
    const t = stack[i]?.text ?? "";
    const m = ampRe.exec(t);
    if (!m) continue;
    const seg = m[0].slice(1);
    if (!/^[A-Za-z0-9_-]+$/.test(seg)) continue;
    outName += seg;
  }
  return outName;
}
