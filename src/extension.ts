import * as vscode from "vscode";
import * as path from "path";

type AliasMap = Record<string, string>;

const USE_FORWARD_IMPORT_RE = /@(use|forward|import)\s+(['"])([^'"]+)\2/g;

let out: vscode.OutputChannel | null = null;

function getAliases(): AliasMap {
  const cfg = vscode.workspace.getConfiguration();
  return (cfg.get("scssAliasJump.aliases") as AliasMap) || {};
}

function getWorkspaceFolderFsPathFor(
  uri: vscode.Uri,
  name?: string
): string | null {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return null;

  if (name) {
    const byName = folders.find((f) => f.name === name);
    if (byName) return byName.uri.fsPath;
  }

  const byUri = vscode.workspace.getWorkspaceFolder(uri);
  if (byUri) return byUri.uri.fsPath;

  return folders[0].uri.fsPath;
}

function expandVars(p: string, uriForWorkspace: vscode.Uri): string {
  // VS Code settings do NOT reliably expand ${workspaceFolder:<name>} for us,
  // so we do it ourselves.
  // Supported:
  // - ${workspaceFolder}
  // - ${workspaceFolder:folderName}
  return p.replace(
    /\$\{workspaceFolder(?::([^}]+))?\}/g,
    (_full, name: string | undefined) => {
      const ws = getWorkspaceFolderFsPathFor(uriForWorkspace, name);
      return ws ?? _full;
    }
  );
}

function isFileUri(u: vscode.Uri) {
  return u.scheme === "file";
}

async function fileExists(fsPath: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(fsPath));
    return true;
  } catch {
    return false;
  }
}

function ensureNoExt(p: string) {
  return p.replace(/\.(scss|sass|css)$/i, "");
}

function toFsPath(p: string) {
  return p.replace(/\\/g, "/");
}

async function resolveSassPath(basePathNoExt: string): Promise<string | null> {
  // basePathNoExt: absolute path without extension
  const dir = path.dirname(basePathNoExt);
  const name = path.basename(basePathNoExt);

  const candidates: string[] = [
    // exact + extensions
    `${basePathNoExt}.scss`,
    `${basePathNoExt}.sass`,
    `${basePathNoExt}.css`,

    // partial _name + extensions
    path.join(dir, `_${name}.scss`),
    path.join(dir, `_${name}.sass`),
    path.join(dir, `_${name}.css`),

    // folder index
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

function resolveAliasToAbsolute(
  importPath: string,
  docFsPath: string,
  aliases: AliasMap,
  uriForWorkspace: vscode.Uri
): string | null {
  const p = importPath.trim();

  // 1) alias match (longest key first)
  const keys = Object.keys(aliases).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (p === key || p.startsWith(key + "/")) {
      const targetRoot = expandVars(aliases[key], uriForWorkspace);
      const rest =
        p === key
          ? ""
          : p.startsWith(key + "/")
            ? p.slice(key.length + 1)
            : p.slice(key.length);
      const abs = path.resolve(targetRoot, rest);
      return abs;
    }
  }

  // 2) relative
  if (p.startsWith(".")) {
    return path.resolve(path.dirname(docFsPath), p);
  }

  // 3) absolute-like from workspace root (optional)
  // If user writes "/src/..." treat as workspace folder root
  if (p.startsWith("/")) {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (ws) return path.resolve(ws, "." + p);
  }

  return null;
}

class ScssAliasDefinitionProvider implements vscode.DefinitionProvider {
  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Definition | null> {
    if (!isFileUri(document.uri)) return null;

    const line = document.lineAt(position.line).text;
    // Find if cursor is inside an import string on this line
    // We'll scan matches and check range
    USE_FORWARD_IMPORT_RE.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = USE_FORWARD_IMPORT_RE.exec(line))) {
      const full = match[0];
      const importPath = match[3];

      const startIdx = match.index + full.indexOf(importPath);
      const endIdx = startIdx + importPath.length;

      if (position.character >= startIdx && position.character <= endIdx) {
        const aliases = getAliases();
        const abs = resolveAliasToAbsolute(
          importPath,
          document.uri.fsPath,
          aliases,
          document.uri
        );
        if (!abs) {
          out?.appendLine(
            `[miss] line ${position.line + 1}: "${importPath}" (no alias/relative match)`
          );
          return null;
        }

        const absNoExt = ensureNoExt(abs);
        const resolved = await resolveSassPath(absNoExt);
        if (!resolved) {
          out?.appendLine(
            `[miss] "${importPath}" -> ${absNoExt} (no candidate file found)`
          );
          return null;
        }

        const uri = vscode.Uri.file(resolved);
        out?.appendLine(`[hit] "${importPath}" -> ${resolved}`);
        return new vscode.Location(uri, new vscode.Position(0, 0));
      }
    }

    return null;
  }
}

class ScssAliasDocumentLinkProvider implements vscode.DocumentLinkProvider {
  async provideDocumentLinks(
    document: vscode.TextDocument
  ): Promise<vscode.DocumentLink[]> {
    if (!isFileUri(document.uri)) return [];

    const aliases = getAliases();
    const links: vscode.DocumentLink[] = [];

    for (let lineNo = 0; lineNo < document.lineCount; lineNo++) {
      const line = document.lineAt(lineNo).text;

      USE_FORWARD_IMPORT_RE.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = USE_FORWARD_IMPORT_RE.exec(line))) {
        const full = match[0];
        const importPath = match[3];

        const startIdx = match.index + full.indexOf(importPath);
        const endIdx = startIdx + importPath.length;

        const abs = resolveAliasToAbsolute(
          importPath,
          document.uri.fsPath,
          aliases,
          document.uri
        );
        if (!abs) continue;

        const resolved = await resolveSassPath(ensureNoExt(abs));
        if (!resolved) continue;

        const range = new vscode.Range(
          new vscode.Position(lineNo, startIdx),
          new vscode.Position(lineNo, endIdx)
        );
        const link = new vscode.DocumentLink(range, vscode.Uri.file(resolved));
        links.push(link);
      }
    }

    if (links.length > 0) out?.appendLine(`[links] 제공: ${links.length}개`);
    return links;
  }
}

export function activate(context: vscode.ExtensionContext) {
  out = vscode.window.createOutputChannel("SCSS Alias Jump");
  out.appendLine(`[activate] SCSS Alias Jump 활성화됨`);

  const provider = new ScssAliasDefinitionProvider();
  const linkProvider = new ScssAliasDocumentLinkProvider();

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      [{ language: "scss" }, { language: "sass" }, { language: "css" }],
      provider
    )
  );
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(
      [{ language: "scss" }, { language: "sass" }, { language: "css" }],
      linkProvider
    )
  );

  context.subscriptions.push(out);
}

export function deactivate() {}

