import * as vscode from "vscode";
import {
  DEFAULT_SCAN_EXCLUDE_PATTERN,
  MAX_CONCURRENT_WORKSPACE_SCANS,
  SCAN_YIELD_FILE_INTERVAL,
} from "./constants";
import { getScanConfigCacheKey, getScanExcludePatterns, getScanMaxFiles } from "./settings";

export type WorkspaceScanOptions = {
  token?: vscode.CancellationToken;
  forUri?: vscode.Uri;
  maxFiles?: number;
  timeoutMs?: number;
  workspaceFolders?: readonly vscode.WorkspaceFolder[];
};

type InFlightScanEntry<T = unknown> = {
  promise: Promise<T>;
  cts: vscode.CancellationTokenSource;
  reject: (error: unknown) => void;
  releaseTurn: () => void;
  startedAt: number;
};

const inFlightScans = new Map<string, InFlightScanEntry>();
type ScanWaiter = {
  resolve: () => void;
  reject: (error: unknown) => void;
  cancelled: boolean;
  dispose?: vscode.Disposable;
};
const scanWaitQueue: ScanWaiter[] = [];
let activeScanCount = 0;

export function isCancellationError(error: unknown): boolean {
  return error instanceof vscode.CancellationError;
}

export function throwIfCancellationRequested(token?: vscode.CancellationToken): void {
  if (token?.isCancellationRequested) {
    throw new vscode.CancellationError();
  }
}

function toSlashPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegExp(pattern: string): RegExp {
  const normalized = toSlashPath(pattern);
  let out = "";
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    const next = normalized[i + 1];
    if (ch === "*" && next === "*") {
      const after = normalized[i + 2];
      if (after === "/") {
        out += "(?:.*/)?";
        i += 2;
      } else {
        out += ".*";
        i += 1;
      }
    } else if (ch === "*") {
      out += "[^/]*";
    } else if (ch === "?") {
      out += "[^/]";
    } else {
      out += escapeRegExp(ch);
    }
  }
  return new RegExp(`^${out}$`);
}

function getWorkspaceRelativePath(uri: vscode.Uri, folder: vscode.WorkspaceFolder): string | null {
  const file = toSlashPath(uri.fsPath);
  const root = toSlashPath(folder.uri.fsPath);
  if (file === root) return "";
  if (!file.startsWith(root + "/")) return null;
  return file.slice(root.length + 1);
}

function getWorkspaceFoldersInSearchOrder(forUri?: vscode.Uri): readonly vscode.WorkspaceFolder[] {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length <= 1 || !forUri) return folders;

  const primary = vscode.workspace.getWorkspaceFolder(forUri);
  if (!primary) return folders;

  return [primary, ...folders.filter((f) => f.uri.toString() !== primary.uri.toString())];
}

function isExcludedByUserGlobs(uri: vscode.Uri, patterns: readonly string[]): boolean {
  if (patterns.length === 0) return false;

  const fullPath = toSlashPath(uri.fsPath);
  const folders = vscode.workspace.workspaceFolders ?? [];
  const candidates = [fullPath];
  for (const folder of folders) {
    const rel = getWorkspaceRelativePath(uri, folder);
    if (rel != null) candidates.push(rel);
  }

  return patterns.some((pattern) => {
    const re = globToRegExp(pattern);
    return candidates.some((candidate) => re.test(candidate));
  });
}

function waitForTurn(token?: vscode.CancellationToken): Promise<void> {
  throwIfCancellationRequested(token);
  if (activeScanCount < MAX_CONCURRENT_WORKSPACE_SCANS) {
    activeScanCount += 1;
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const waiter: ScanWaiter = { resolve, reject, cancelled: false };
    waiter.dispose = token?.onCancellationRequested(() => {
      waiter.cancelled = true;
      waiter.dispose?.dispose();
      reject(new vscode.CancellationError());
    });

    scanWaitQueue.push(waiter);
  });
}

function releaseTurn(): void {
  activeScanCount = Math.max(0, activeScanCount - 1);
  while (scanWaitQueue.length > 0) {
    const next = scanWaitQueue.shift();
    if (!next || next.cancelled) continue;
    next.dispose?.dispose();
    activeScanCount += 1;
    next.resolve();
    return;
  }
}

function waitForCancellation<T>(promise: Promise<T>, token?: vscode.CancellationToken): Promise<T> {
  if (!token) return promise;
  if (token.isCancellationRequested) return Promise.reject(new vscode.CancellationError());

  return new Promise<T>((resolve, reject) => {
    const dispose = token.onCancellationRequested(() => {
      dispose?.dispose();
      reject(new vscode.CancellationError());
    });
    promise.then(
      (value) => {
        dispose.dispose();
        resolve(value);
      },
      (error) => {
        dispose.dispose();
        reject(error);
      }
    );
  });
}

function cancellationError(): vscode.CancellationError {
  return new vscode.CancellationError();
}

export function scanCacheKey(kind: string, query: string, options: WorkspaceScanOptions = {}): string {
  const scopeFolder = options.forUri
    ? (vscode.workspace.getWorkspaceFolder(options.forUri)?.uri.toString() ?? "no-workspace-folder")
    : "all-workspace-folders";
  const scopeMode = options.workspaceFolders
    ? `explicit:${options.workspaceFolders.map((folder) => folder.uri.toString()).join(",")}`
    : options.forUri
      ? "primary-then-fallback"
      : "all";
  const config = getScanConfigCacheKey(options.forUri);
  const timeoutMs = options.timeoutMs ?? null;
  return JSON.stringify({ kind, query, scopeFolder, scopeMode, config, timeoutMs });
}

export async function runDedupedCancellableScan<T>(
  key: string,
  options: WorkspaceScanOptions,
  scan: (token: vscode.CancellationToken) => Promise<T>
): Promise<T> {
  const existing = inFlightScans.get(key) as InFlightScanEntry<T> | undefined;
  if (existing) {
    return waitForCancellation(existing.promise, options.token);
  }

  const cts = new vscode.CancellationTokenSource();
  const requestDispose = options.token?.onCancellationRequested(() => cts.cancel());
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  let turnAcquired = false;
  let turnReleased = false;

  const releaseTurnOnce = () => {
    if (!turnAcquired || turnReleased) return;
    turnReleased = true;
    releaseTurn();
  };

  let rejectFromReset: (error: unknown) => void = () => undefined;
  const resetPromise = new Promise<T>((_resolve, reject) => {
    rejectFromReset = reject;
  });

  const scanPromise = (async () => {
    await waitForTurn(cts.token);
    turnAcquired = true;
    try {
      throwIfCancellationRequested(cts.token);
      return await scan(cts.token);
    } finally {
      releaseTurnOnce();
    }
  })();

  const timeoutPromise =
    options.timeoutMs == null
      ? null
      : new Promise<T>((_resolve, reject) => {
          timeoutTimer = setTimeout(() => {
            cts.cancel();
            releaseTurnOnce();
            reject(cancellationError());
          }, options.timeoutMs);
        });

  const promise = Promise.race(
    timeoutPromise ? [scanPromise, resetPromise, timeoutPromise] : [scanPromise, resetPromise]
  ).finally(() => {
    if (timeoutTimer) clearTimeout(timeoutTimer);
    requestDispose?.dispose();
    cts.dispose();
    inFlightScans.delete(key);
  });

  inFlightScans.set(key, {
    promise,
    cts,
    reject: rejectFromReset,
    releaseTurn: releaseTurnOnce,
    startedAt: Date.now(),
  });
  return waitForCancellation(promise, options.token);
}

export type ClearWorkspaceScanStateOptions = {
  minAgeMs?: number;
};

export function clearWorkspaceScanState(options: ClearWorkspaceScanStateOptions = {}): { inFlight: number; queued: number } {
  const now = Date.now();
  const entriesToClear = [...inFlightScans.entries()].filter(([_key, entry]) => {
    return options.minAgeMs == null || now - entry.startedAt >= options.minAgeMs;
  });

  const inFlight = entriesToClear.length;
  const queued = inFlight > 0 || options.minAgeMs == null ? scanWaitQueue.length : 0;

  if (queued > 0) {
    while (scanWaitQueue.length > 0) {
      const waiter = scanWaitQueue.shift();
      if (!waiter) continue;
      waiter.cancelled = true;
      waiter.dispose?.dispose();
      waiter.reject(cancellationError());
    }
  }

  for (const [key, entry] of entriesToClear) {
    entry.cts.cancel();
    entry.releaseTurn();
    entry.reject(cancellationError());
    inFlightScans.delete(key);
  }

  return { inFlight, queued };
}

export function getWorkspaceScanStateStats(): { inFlight: number; queued: number; oldestInFlightMs: number } {
  const now = Date.now();
  let oldestInFlightMs = 0;
  for (const entry of inFlightScans.values()) {
    oldestInFlightMs = Math.max(oldestInFlightMs, now - entry.startedAt);
  }
  return { inFlight: inFlightScans.size, queued: scanWaitQueue.length, oldestInFlightMs };
}

export async function findWorkspaceFiles(
  include: string,
  options: WorkspaceScanOptions = {}
): Promise<vscode.Uri[]> {
  const token = options.token;
  throwIfCancellationRequested(token);

  const maxFiles = options.maxFiles ?? getScanMaxFiles(options.forUri);
  const userExcludes = getScanExcludePatterns(options.forUri);
  const folders = options.workspaceFolders ?? getWorkspaceFoldersInSearchOrder(options.forUri);
  const results: vscode.Uri[] = [];
  const seen = new Set<string>();

  const pushFile = (uri: vscode.Uri) => {
    if (results.length >= maxFiles) return;
    const key = uri.toString();
    if (seen.has(key)) return;
    if (isExcludedByUserGlobs(uri, userExcludes)) return;
    seen.add(key);
    results.push(uri);
  };

  if (folders.length === 0) {
    const found = await vscode.workspace.findFiles(include, DEFAULT_SCAN_EXCLUDE_PATTERN, maxFiles, token);
    for (const uri of found) pushFile(uri);
    return results;
  }

  for (const folder of folders) {
    throwIfCancellationRequested(token);
    const remaining = maxFiles - results.length;
    if (remaining <= 0) break;
    const pattern = new vscode.RelativePattern(folder, include);
    const found = await vscode.workspace.findFiles(pattern, DEFAULT_SCAN_EXCLUDE_PATTERN, remaining, token);
    for (const uri of found) pushFile(uri);
  }

  throwIfCancellationRequested(token);
  return results;
}

export async function yieldToExtensionHostIfNeeded(
  count: number,
  token?: vscode.CancellationToken,
  interval = SCAN_YIELD_FILE_INTERVAL
): Promise<void> {
  throwIfCancellationRequested(token);
  if (count > 0 && count % interval === 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    throwIfCancellationRequested(token);
  }
}
