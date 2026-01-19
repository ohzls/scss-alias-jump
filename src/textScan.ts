export function countChar(s: string, ch: string) {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s[i] === ch) n++;
  return n;
}

export function braceDelta(line: string) {
  // Heuristic: ignore braces after '//' comment start
  const idx = line.indexOf("//");
  const s = idx >= 0 ? line.slice(0, idx) : line;
  return countChar(s, "{") - countChar(s, "}");
}

export function firstNonCommentIdx(line: string) {
  const idx = line.indexOf("//");
  return idx >= 0 ? idx : line.length;
}

export function tokenBoundaryOk(line: string, idx: number, tokenLen: number) {
  const before = idx === 0 ? "" : line[idx - 1];
  if (before && /[A-Za-z0-9_-]/.test(before)) return false;

  const after = line[idx + tokenLen] ?? "";
  if (after && /[A-Za-z0-9_-]/.test(after)) return false;

  return true;
}

export function hasBraceSoon(lines: string[], fromLine: number, tokenEndCh: number) {
  const line = lines[fromLine] ?? "";
  const rest = line.slice(tokenEndCh);
  if (rest.includes("{")) return true;

  for (let j = fromLine + 1; j < Math.min(fromLine + 6, lines.length); j++) {
    const n = (lines[j] ?? "").trim();
    if (n.length === 0) continue;
    return n.includes("{");
  }

  return false;
}
