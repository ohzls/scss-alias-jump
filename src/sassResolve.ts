import * as path from "path";
import * as vscode from "vscode";
import { debug as dbg } from "./output";

const POSITIVE_CACHE_TTL_MS = 60_000;
const NEGATIVE_CACHE_TTL_MS = 1_500;

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

type ResolveCacheEntry = {
  ts: number;
  promise: Promise<string | null>;
};

const resolveCache = new Map<string, ResolveCacheEntry>();

export function clearSassResolveCache(): void {
  resolveCache.clear();
}

export function resolveSassPathCached(basePathNoExt: string): Promise<string | null> {
  const key = basePathNoExt;
  const now = Date.now();
  const hit = resolveCache.get(key);
  if (hit) {
    return hit.promise.then((value) => {
      const ttl = value ? POSITIVE_CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS;
      if (Date.now() - hit.ts < ttl) return value;
      resolveCache.delete(key);
      return resolveSassPathCached(key);
    });
  }

  const entry: ResolveCacheEntry = {
    ts: now,
    promise: resolveSassPath(key).catch(() => null),
  };
  resolveCache.set(key, entry);
  return entry.promise;
}

export function registerSassResolveCacheInvalidation(
  context: vscode.ExtensionContext,
  out?: vscode.OutputChannel
): void {
  const clear = (reason: string) => {
    clearSassResolveCache();
    if (out) dbg(out, `[sass-cache] cleared (${reason})`);
  };

  // Watch create/delete only. Content changes do not affect Sass partial candidate paths,
  // and clearing on every edit can add avoidable extension-host work in large workspaces.
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.{scss,sass,css}", false, true, false);
  context.subscriptions.push(
    watcher,
    watcher.onDidCreate(() => clear("file-created")),
    watcher.onDidDelete(() => clear("file-deleted")),
    vscode.workspace.onDidChangeWorkspaceFolders(() => clear("workspace-folders")),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("scssAliasJump.aliases")) clear("aliases-config");
    })
  );
}
