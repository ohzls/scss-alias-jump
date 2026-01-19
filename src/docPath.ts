import * as path from "path";
import * as vscode from "vscode";

function sanitizeMaybeVirtualFileName(name: string): string {
  const q = name.indexOf("?");
  const h = name.indexOf("#");
  let cut = -1;
  if (q >= 0 && h >= 0) cut = Math.min(q, h);
  else cut = q >= 0 ? q : h;
  return cut >= 0 ? name.slice(0, cut) : name;
}

function decodeURIComponentSafe(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function normalizeMaybeVscodeFsPath(p: string): string {
  let s = decodeURIComponentSafe(p);
  // VS Code sometimes prefixes absolute fs paths with /@fs/ in virtual documents.
  if (s.startsWith("/@fs/")) s = s.slice("/@fs".length);
  // Some encodings may include multiple leading slashes.
  s = s.replace(/^\/{2,}/, "/");
  return s;
}

function asAbsoluteFsPathMaybe(p: string): string | null {
  const sanitized = sanitizeMaybeVirtualFileName(normalizeMaybeVscodeFsPath(p));
  if (!sanitized) return null;
  if (path.isAbsolute(sanitized)) return sanitized;
  // Windows drive letter sometimes appears without leading slash in encoded form.
  if (/^[a-zA-Z]:[\\/]/.test(sanitized)) return sanitized;
  return null;
}

function tryExtractFilePathFromQuery(uri: vscode.Uri): string | null {
  const q = uri.query;
  if (!q) return null;
  // Query can be standard querystring: file=/abs/path.vue&type=style
  try {
    const params = new URLSearchParams(q);
    const keys = ["file", "filepath", "fsPath", "path", "source", "src"];
    for (const k of keys) {
      const v = params.get(k);
      if (!v) continue;
      const abs = asAbsoluteFsPathMaybe(v);
      if (abs) return abs;
    }
  } catch {
    // ignore
  }
  // Fallback: try to find an encoded absolute path in the raw query.
  const m = /(?:^|[?&])(file|filepath|fsPath|path|source|src)=([^&#]+)/.exec(q);
  if (m?.[2]) {
    const abs = asAbsoluteFsPathMaybe(m[2]);
    if (abs) return abs;
  }
  return null;
}

export function getDocFsPath(document: vscode.TextDocument): string | null {
  const uri = document.uri;
  const uriFsPath = uri?.fsPath;
  if (uri?.scheme === "file" && uriFsPath) return uriFsPath;

  const fromQuery = tryExtractFilePathFromQuery(uri);
  if (fromQuery) return fromQuery;

  if (uriFsPath) {
    const abs = asAbsoluteFsPathMaybe(uriFsPath);
    if (abs) return abs;
  }
  const uriPath = uri?.path;
  if (uriPath) {
    const abs = asAbsoluteFsPathMaybe(uriPath);
    if (abs) return abs;
  }

  let name = document.fileName;
  if (!name) return null;

  const schemeIdx = name.indexOf(":");
  if (schemeIdx > 0) {
    const after = name.slice(schemeIdx + 1);
    const abs = asAbsoluteFsPathMaybe(after);
    if (abs) name = abs;
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(name)) {
    try {
      const u = vscode.Uri.parse(name);
      if (u.scheme === "file" && u.fsPath) return u.fsPath;
      const fromQ = tryExtractFilePathFromQuery(u);
      if (fromQ) return fromQ;
      const up = u.path ?? "";
      const absPath = asAbsoluteFsPathMaybe(up);
      if (absPath) return absPath;
      const absFs = asAbsoluteFsPathMaybe(u.fsPath ?? "");
      if (absFs) return absFs;
    } catch {
      // ignore
    }
  }

  const abs = asAbsoluteFsPathMaybe(name);
  if (abs) return abs;
  return null;
}

