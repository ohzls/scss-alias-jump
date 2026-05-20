import * as vscode from "vscode";
import { clearClassUsageCache } from "./classUsage";
import { clearExtendRefsCache } from "./extendRefs";
import { debug, info } from "./output";
import { clearSassResolveCache } from "./sassResolve";
import { clearWorkspaceScanState, getWorkspaceScanStateStats } from "./scan";
import { getCacheAutoClearIntervalMs } from "./settings";

function isSupportedStyleDocument(document: vscode.TextDocument | undefined): boolean {
  if (!document) return false;
  return ["scss", "sass", "css", "vue", "svelte"].includes(document.languageId);
}

export function clearScssAliasJumpCaches(
  reason: string,
  out?: vscode.OutputChannel,
  options: { resetScanState?: boolean; scanMinAgeMs?: number } = {}
): { sass: number; classUsages: number; extendRefs: number; inFlight: number; queued: number } {
  const sass = clearSassResolveCache();
  const classUsages = clearClassUsageCache();
  const extendRefs = clearExtendRefsCache();
  const scans =
    options.resetScanState === false
      ? { inFlight: 0, queued: 0 }
      : clearWorkspaceScanState({ minAgeMs: options.scanMinAgeMs });

  if (out) {
    const message = `[cache-reset] ${reason}: sass=${sass}, classUsages=${classUsages}, extendRefs=${extendRefs}, inFlight=${scans.inFlight}, queued=${scans.queued}`;
    if (reason.startsWith("periodic-")) debug(out, message);
    else info(out, message);
  }

  return { sass, classUsages, extendRefs, ...scans };
}

export function registerAutomaticCacheReset(
  context: vscode.ExtensionContext,
  out?: vscode.OutputChannel
): void {
  let interval: ReturnType<typeof setInterval> | undefined;
  let lastActiveEditorUri: string | null = null;

  const stopInterval = () => {
    if (!interval) return;
    clearInterval(interval);
    interval = undefined;
  };

  const startInterval = () => {
    stopInterval();
    const ms = getCacheAutoClearIntervalMs(vscode.window.activeTextEditor?.document.uri);
    if (ms <= 0) {
      if (out) info(out, "[cache-reset] periodic auto-clear disabled");
      return;
    }

    interval = setInterval(() => {
      clearScssAliasJumpCaches(`periodic-${ms}ms`, out, { scanMinAgeMs: ms });
    }, ms);
    if (out) info(out, `[cache-reset] periodic auto-clear every ${ms}ms`);
  };

  startInterval();

  context.subscriptions.push(
    { dispose: stopInterval },
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("scssAliasJump.cacheAutoClearIntervalMs")) {
        clearScssAliasJumpCaches("cache-auto-clear-config", out);
        startInterval();
      }
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (isSupportedStyleDocument(document)) {
        clearScssAliasJumpCaches("style-document-saved", out, { resetScanState: false });
      }
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      const uri = editor?.document?.uri?.toString() ?? null;
      if (!uri || uri === lastActiveEditorUri) return;
      lastActiveEditorUri = uri;

      const stats = getWorkspaceScanStateStats();
      if (stats.oldestInFlightMs > 10_000 || stats.queued > 0) {
        clearScssAliasJumpCaches("active-editor-changed-with-scan-state", out);
      }
    })
  );
}
