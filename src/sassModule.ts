import * as vscode from "vscode";
import { getAliases } from "./settings";
import { getDocFsPath } from "./docPath";
import { resolveAliasToAbsolute } from "./aliasResolve";
import { ensureNoExt, resolveSassPathCached } from "./sassResolve";
import { readTextFile } from "./fsText";
import { stripComments } from "./textScan";
import { escapeRegExp, splitLines } from "./strings";

export async function resolveSassModuleFromUse(
  importPath: string,
  fromDoc: vscode.TextDocument
): Promise<vscode.Uri | null> {
  const aliases = getAliases(fromDoc.uri);
  const docFsPath = getDocFsPath(fromDoc);
  if (!docFsPath) return null;
  const abs = resolveAliasToAbsolute(importPath, docFsPath, aliases, fromDoc.uri);
  if (!abs) return null;
  const resolved = await resolveSassPathCached(ensureNoExt(abs));
  if (!resolved) return null;
  return vscode.Uri.file(resolved);
}

export async function findVariableDefinitionInModule(
  moduleUri: vscode.Uri,
  varName: string,
  visited: Set<string>
): Promise<vscode.Location | null> {
  const key = moduleUri.toString();
  if (visited.has(key)) return null;
  visited.add(key);

  const text = await readTextFile(moduleUri);
  if (!text) return null;

  const re = new RegExp(`\\$${escapeRegExp(varName)}\\s*:`);
  const lines = splitLines(text);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const line = stripComments(raw);
    if (!line.includes(`$${varName}`)) continue;
    const idx = line.search(re);
    if (idx < 0) continue;
    return new vscode.Location(moduleUri, new vscode.Position(i, idx));
  }

  const forwardRe = /@forward\s+(['"])([^'"]+)\1/g;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const line = stripComments(raw);
    if (!line.includes("@forward")) continue;

    forwardRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = forwardRe.exec(line))) {
      const importPath = m[2];
      const aliases = getAliases(moduleUri);
      const abs = resolveAliasToAbsolute(importPath, moduleUri.fsPath, aliases, moduleUri);
      if (!abs) continue;
      const resolved = await resolveSassPathCached(ensureNoExt(abs));
      if (!resolved) continue;
      const nextUri = vscode.Uri.file(resolved);
      const hit = await findVariableDefinitionInModule(nextUri, varName, visited);
      if (hit) return hit;
    }
  }

  return null;
}
