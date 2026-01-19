import * as path from "path";
import * as vscode from "vscode";
import type { AliasMap } from "./settings";

function toFsPath(p: string) {
  return p.replace(/\\/g, "/");
}

function pickWorkspaceFolderForDocPath(docFsPath: string): string | null {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) return null;
  const doc = toFsPath(docFsPath);
  let best: string | null = null;
  let bestLen = -1;
  for (const f of folders) {
    const fp = toFsPath(f.uri.fsPath);
    if (doc === fp || doc.startsWith(fp + "/")) {
      if (fp.length > bestLen) {
        best = f.uri.fsPath;
        bestLen = fp.length;
      }
    }
  }
  return best;
}

function getWorkspaceFolderFsPathFor(uri: vscode.Uri, name?: string): string | null {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return null;

  if (name) {
    const byName =
      folders.find((f) => f.name === name) ??
      folders.find((f) => path.basename(f.uri.fsPath) === name);
    if (byName) return byName.uri.fsPath;
  }

  const byUri = vscode.workspace.getWorkspaceFolder(uri);
  if (byUri) return byUri.uri.fsPath;

  return folders[0].uri.fsPath;
}

export function expandVars(p: string, uriForWorkspace: vscode.Uri): string {
  return p.replace(/\$\{workspaceFolder(?::([^}]+))?\}/g, (_full, name: string | undefined) => {
    const ws = getWorkspaceFolderFsPathFor(uriForWorkspace, name);
    return ws ?? _full;
  });
}

export function expandVarsWithDocWorkspace(
  p: string,
  uriForWorkspace: vscode.Uri,
  docWorkspaceFsPath: string | null
): string {
  const base = docWorkspaceFsPath ? p.replace(/\$\{workspaceFolder\}/g, docWorkspaceFsPath) : p;
  return base.replace(/\$\{workspaceFolder:([^}]+)\}/g, (_full: string, name: string) => {
    const ws = getWorkspaceFolderFsPathFor(uriForWorkspace, name);
    return ws ?? _full;
  });
}

export function resolveAliasToAbsolute(
  importPath: string,
  docFsPath: string,
  aliases: AliasMap,
  uriForWorkspace: vscode.Uri
): string | null {
  const p = importPath.trim();

  const wsFsPath =
    pickWorkspaceFolderForDocPath(docFsPath) ??
    getWorkspaceFolderFsPathFor(uriForWorkspace) ??
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  const keys = Object.keys(aliases).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const variants = key.endsWith("/") ? [key, key.slice(0, -1)] : [key];
    let matched: string | null = null;
    for (const v of variants) {
      if (v.length === 0) continue;
      if (p === v || p.startsWith(v + "/")) {
        matched = v;
        break;
      }
    }
    if (matched) {
      let targetRoot = expandVarsWithDocWorkspace(aliases[key], uriForWorkspace, wsFsPath ?? null);
      const rest =
        p === matched
          ? ""
          : p.startsWith(matched + "/")
            ? p.slice(matched.length + 1)
            : p.slice(matched.length);

      if (key === "@" && wsFsPath && path.isAbsolute(targetRoot)) {
        const folders = vscode.workspace.workspaceFolders ?? [];
        const current = wsFsPath;
        for (const f of folders) {
          const fp = f.uri.fsPath;
          if (fp === current) continue;
          if (toFsPath(targetRoot).startsWith(toFsPath(fp) + "/")) {
            const tail = targetRoot.slice(fp.length);
            targetRoot = path.resolve(current, "." + tail);
            break;
          }
        }
      }

      return path.resolve(targetRoot, rest);
    }
  }

  if (p.startsWith(".")) {
    return path.resolve(path.dirname(docFsPath), p);
  }

  if (p.startsWith("/")) {
    const ws = wsFsPath;
    if (ws) return path.resolve(ws, "." + p);
  }

  return null;
}
