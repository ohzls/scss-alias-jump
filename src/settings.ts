import * as vscode from "vscode";
import { DEFAULT_SCAN_MAX_FILE_SIZE_KB, DEFAULT_SCAN_MAX_FILES } from "./constants";

export type AliasMap = Record<string, string>;

const CFG_ROOT = "scssAliasJump";

function cfgFor(resource?: vscode.Uri) {
  return resource
    ? vscode.workspace.getConfiguration(undefined, resource)
    : vscode.workspace.getConfiguration();
}

export function getAliases(resource?: vscode.Uri): AliasMap {
  const cfg = cfgFor(resource);
  return (cfg.get(`${CFG_ROOT}.aliases`) as AliasMap) || {};
}

export function isDebugLoggingEnabled(resource?: vscode.Uri): boolean {
  const cfg = cfgFor(resource);
  return cfg.get(`${CFG_ROOT}.debugLogging`) === true;
}

export function isHoverWorkspaceScanEnabled(resource?: vscode.Uri): boolean {
  const cfg = cfgFor(resource);
  return cfg.get(`${CFG_ROOT}.hoverWorkspaceScan`) === true;
}

export function getScanExcludePatterns(resource?: vscode.Uri): string[] {
  const cfg = cfgFor(resource);
  const value = cfg.get(`${CFG_ROOT}.scanExclude`);
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.length > 0) : [];
}

export function getScanMaxFileSizeBytes(resource?: vscode.Uri): number {
  const cfg = cfgFor(resource);
  const value = cfg.get(`${CFG_ROOT}.scanMaxFileSizeKB`);
  const kb = typeof value === "number" && Number.isFinite(value) && value > 0 ? value : DEFAULT_SCAN_MAX_FILE_SIZE_KB;
  return Math.max(1, Math.floor(kb)) * 1024;
}

export function getScanMaxFiles(resource?: vscode.Uri): number {
  const cfg = cfgFor(resource);
  const value = cfg.get(`${CFG_ROOT}.scanMaxFiles`);
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_SCAN_MAX_FILES;
}

export function getScanConfigCacheKey(resource?: vscode.Uri): string {
  return JSON.stringify({
    exclude: getScanExcludePatterns(resource),
    maxBytes: getScanMaxFileSizeBytes(resource),
    maxFiles: getScanMaxFiles(resource),
  });
}

