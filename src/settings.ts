import * as vscode from "vscode";

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

