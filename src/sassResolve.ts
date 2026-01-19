import * as path from "path";
import * as vscode from "vscode";

async function fileExists(fsPath: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(fsPath));
    return true;
  } catch {
    return false;
  }
}

export function ensureNoExt(p: string) {
  return p.replace(/\.(scss|sass|css)$/i, "");
}

async function resolveSassPath(basePathNoExt: string): Promise<string | null> {
  const dir = path.dirname(basePathNoExt);
  const name = path.basename(basePathNoExt);

  const candidates: string[] = [
    `${basePathNoExt}.scss`,
    `${basePathNoExt}.sass`,
    `${basePathNoExt}.css`,
    path.join(dir, `_${name}.scss`),
    path.join(dir, `_${name}.sass`),
    path.join(dir, `_${name}.css`),
    path.join(basePathNoExt, `index.scss`),
    path.join(basePathNoExt, `index.sass`),
    path.join(basePathNoExt, `index.css`),
    path.join(basePathNoExt, `_index.scss`),
    path.join(basePathNoExt, `_index.sass`),
    path.join(basePathNoExt, `_index.css`),
  ];

  for (const c of candidates) {
    if (await fileExists(c)) return c;
  }
  return null;
}

const resolveCache = new Map<string, Promise<string | null>>();

export function resolveSassPathCached(basePathNoExt: string): Promise<string | null> {
  const key = basePathNoExt;
  const hit = resolveCache.get(key);
  if (hit) return hit;
  const p = resolveSassPath(key).catch(() => null);
  resolveCache.set(key, p);
  return p;
}

