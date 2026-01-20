import * as path from "path";
import * as vscode from "vscode";
import {
  DEBUG_CLICK_TEST_CMD,
  DEBUG_SCAN_IMPORTS_CMD,
  OPEN_EXTEND_PLACEHOLDER_CMD,
  OPEN_IMPORT_UNDER_CURSOR_CMD,
  OPEN_LOCATION_CMD,
  SHOW_CLASS_USAGES_CMD,
  SHOW_PLACEHOLDER_EXTENDS_CMD,
  USE_FORWARD_IMPORT_RE,
} from "./constants";
import { getAliases } from "./settings";
import { getDocFsPath } from "./docPath";
import { ensureNoExt, resolveSassPathCached } from "./sassResolve";
import { resolveAliasToAbsolute } from "./aliasResolve";
import {
  getAmpSegmentUnderCursor,
  getImportPathUnderCursorOnLine,
  getNamespacedVarRefUnderCursor,
  getPlaceholderNameUnderCursor,
} from "./cursorTokens";
import { findPlaceholderDefinitions } from "./placeholders";
import { findExtendReferences } from "./extendRefs";
import { findClassUsages } from "./classUsage";
import { info } from "./output";
import { ScssAliasDocumentLinkProvider } from "./providers/documentLinkProvider";
import { ScssAliasDefinitionProvider } from "./providers/definitionProvider";
import { splitLines, formatFileLocation } from "./strings";

export function registerCommands(context: vscode.ExtensionContext, out: vscode.OutputChannel) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      OPEN_EXTEND_PLACEHOLDER_CMD,
      async (fromUriString: string, placeholder: string) => {
        try {
          const fromUri = vscode.Uri.parse(fromUriString);
          info(out, `[cmd] openExtendPlaceholder: %${placeholder} (from ${fromUri.fsPath})`);

          const locs = await findPlaceholderDefinitions(placeholder, fromUri, out);
          if (locs.length === 0) {
            vscode.window.showInformationMessage(
              `SCSS Alias Jump: %${placeholder} 정의를 찾지 못했어요. (Output: SCSS Alias Jump 확인)`
            );
            return;
          }

          const chosen =
            locs.length === 1
              ? locs[0]
              : await (async () => {
                  const items = locs.map((l) => ({
                    label: formatFileLocation(l.uri, l.range.start.line),
                    description: l.uri.fsPath,
                    loc: l,
                  }));
                  const picked = await vscode.window.showQuickPick(items, {
                    placeHolder: `%${placeholder} 정의가 여러 개예요. 이동할 위치를 선택하세요.`,
                    matchOnDescription: true,
                  });
                  return picked?.loc ?? locs[0];
                })();

          await vscode.window.showTextDocument(chosen.uri, {
            selection: chosen.range,
            preview: true,
            preserveFocus: false,
          });
        } catch (e) {
          info(out, `[err] openExtendPlaceholder failed: ${String(e)}`);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      SHOW_PLACEHOLDER_EXTENDS_CMD,
      async (_fromUriString: string, placeholder: string) => {
        try {
          info(out, `[cmd] showPlaceholderExtends: %${placeholder}`);
          const refs = await findExtendReferences(placeholder);
          if (refs.length === 0) {
            vscode.window.showInformationMessage(
              `SCSS Alias Jump: @extend %${placeholder} 사용처를 찾지 못했어요.`
            );
            return;
          }

          const items = refs.map((r) => ({
            label: `${r.containerText ? `${r.containerText} — ` : ""}${formatFileLocation(r.uri, r.pos.line)}`,
            description: r.uri.fsPath,
            loc: new vscode.Location(r.uri, r.pos),
          }));

          const picked = await vscode.window.showQuickPick(items, {
            placeHolder: `@extend %${placeholder} 사용처 (${refs.length}개)`,
            matchOnDescription: true,
          });
          if (!picked) return;

          await vscode.window.showTextDocument(picked.loc.uri, {
            selection: picked.loc.range,
            preview: true,
            preserveFocus: false,
          });
        } catch (e) {
          info(out, `[err] showPlaceholderExtends failed: ${String(e)}`);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      SHOW_CLASS_USAGES_CMD,
      async (_fromUriString: string, className: string) => {
        try {
          info(out, `[cmd] showClassUsages: .${className}`);
          const refs = await findClassUsages(className);
          if (refs.length === 0) {
            vscode.window.showInformationMessage(
              `SCSS Alias Jump: .${className} 사용처를 찾지 못했어요.`
            );
            return;
          }

          const items = refs.map((r) => ({
            label: formatFileLocation(r.uri, r.pos.line),
            description: r.uri.fsPath,
            loc: new vscode.Location(r.uri, r.pos),
          }));

          const picked = await vscode.window.showQuickPick(items, {
            placeHolder: `.${className} 사용처 (${refs.length}개)`,
            matchOnDescription: true,
          });
          if (!picked) return;

          await vscode.window.showTextDocument(picked.loc.uri, {
            selection: picked.loc.range,
            preview: true,
            preserveFocus: false,
          });
        } catch (e) {
          info(out, `[err] showClassUsages failed: ${String(e)}`);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      OPEN_LOCATION_CMD,
      async (uriString: string, line: number, ch: number) => {
        try {
          const uri = vscode.Uri.parse(uriString);
          await vscode.window.showTextDocument(uri, {
            selection: new vscode.Range(line, ch, line, ch),
            preview: true,
            preserveFocus: false,
          });
        } catch (e) {
          info(out, `[err] openLocation failed: ${String(e)}`);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(DEBUG_SCAN_IMPORTS_CMD, async () => {
      try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showInformationMessage("SCSS Alias Jump: active editor가 없어요.");
          return;
        }
        const doc = editor.document;
        const docFsPath = getDocFsPath(doc);
        if (!docFsPath) {
          info(
            out,
            `[scan-doc] cannot determine fsPath (scheme=${doc.uri.scheme}, fileName="${doc.fileName}")`
          );
          vscode.window.showWarningMessage(
            "SCSS Alias Jump: 현재 문서의 실제 파일 경로를 알아내지 못했어요. Output을 확인하세요."
          );
          return;
        }

        const aliases = getAliases(doc.uri);
        const lines = splitLines(doc.getText());
        let n = 0;
        info(out, `[scan] from=${docFsPath} uri=${doc.uri.scheme}`);

        for (let lineNo = 0; lineNo < lines.length; lineNo++) {
          const line = lines[lineNo] ?? "";
          USE_FORWARD_IMPORT_RE.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = USE_FORWARD_IMPORT_RE.exec(line))) {
            const importPath = m[3];
            n++;
            info(out, `[scan-use] line=${lineNo + 1} path="${importPath}"`);
            const abs = resolveAliasToAbsolute(importPath, docFsPath, aliases, doc.uri);
            if (!abs) {
              info(out, `[scan-miss] @use "${importPath}" (no alias/relative match)`);
              continue;
            }
            const absNoExt = ensureNoExt(abs);
            const resolved = await resolveSassPathCached(absNoExt);
            if (!resolved) {
              info(
                out,
                `[scan-miss] @use "${importPath}" -> ${absNoExt} (no candidate file found)`
              );
              continue;
            }
            info(out, `[scan-hit] @use "${importPath}" -> ${resolved}`);
          }
        }

        if (n === 0) {
          vscode.window.showInformationMessage(
            "SCSS Alias Jump: 현재 파일에서 @use/@forward/@import를 못 찾았어요."
          );
        } else {
          vscode.window.showInformationMessage(
            `SCSS Alias Jump: import scan 완료 (${n}개). Output을 확인하세요.`
          );
        }
      } catch (e) {
        info(out, `[err] debugScanImports failed: ${String(e)}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(OPEN_IMPORT_UNDER_CURSOR_CMD, async () => {
      try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showInformationMessage("SCSS Alias Jump: active editor가 없어요.");
          return;
        }
        const doc = editor.document;
        const docFsPath = getDocFsPath(doc);
        if (!docFsPath) {
          info(
            out,
            `[miss-doc] cannot determine fsPath (scheme=${doc.uri.scheme}, fileName="${doc.fileName}")`
          );
          vscode.window.showWarningMessage(
            "SCSS Alias Jump: 현재 문서의 실제 파일 경로를 알아내지 못했어요. Output을 확인하세요."
          );
          return;
        }

        const pos = editor.selection.active;
        const line = doc.lineAt(pos.line).text;
        const hit = getImportPathUnderCursorOnLine(line, pos.character);
        if (!hit) {
          vscode.window.showInformationMessage(
            "SCSS Alias Jump: 커서가 @use/@forward/@import 경로 위에 있지 않아요."
          );
          return;
        }

        info(
          out,
          `[open-import] from=${docFsPath} uri=${doc.uri.scheme} line=${pos.line + 1} path="${hit.importPath}"`
        );

        if (hit.importPath.startsWith("sass:")) {
          vscode.window.showInformationMessage(
            `SCSS Alias Jump: "${hit.importPath}"는 Sass built-in 모듈이라 파일로 열 수 없어요.`
          );
          return;
        }

        const aliases = getAliases(doc.uri);
        const abs = resolveAliasToAbsolute(hit.importPath, docFsPath, aliases, doc.uri);
        if (!abs) {
          info(out, `[miss] @use "${hit.importPath}" (no alias/relative match)`);
          vscode.window.showWarningMessage(
            `SCSS Alias Jump: "${hit.importPath}"를 해석하지 못했어요. Output을 확인하세요.`
          );
          return;
        }

        const absNoExt = ensureNoExt(abs);
        const resolved = await resolveSassPathCached(absNoExt);
        if (!resolved) {
          info(
            out,
            `[miss] @use "${hit.importPath}" -> ${absNoExt} (no candidate file found)`
          );
          vscode.window.showWarningMessage(
            `SCSS Alias Jump: "${hit.importPath}"의 대상 파일을 찾지 못했어요. Output을 확인하세요.`
          );
          return;
        }

        info(out, `[hit] @use "${hit.importPath}" -> ${resolved}`);
        await vscode.window.showTextDocument(vscode.Uri.file(resolved), {
          preview: true,
          preserveFocus: false,
        });
      } catch (e) {
        info(out, `[err] openImportUnderCursor failed: ${String(e)}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(DEBUG_CLICK_TEST_CMD, async () => {
      try {
        const pickEditor = (): vscode.TextEditor | undefined => {
          const active = vscode.window.activeTextEditor;
          const isOutputDoc =
            active?.document?.uri?.scheme === "output" ||
            active?.document?.languageId === "Log" ||
            active?.document?.languageId === "log";
          if (active && !isOutputDoc) return active;

          const visible = vscode.window.visibleTextEditors ?? [];
          const preferredLangs = new Set(["vue", "scss", "sass", "css"]);
          const candidates = visible.filter((e) => {
            const d = e.document;
            if (!d) return false;
            if (d.uri?.scheme === "output") return false;
            if (d.languageId === "Log" || d.languageId === "log") return false;
            return true;
          });

          const preferred = candidates.find((e) => preferredLangs.has(e.document.languageId));
          return preferred ?? candidates[0];
        };

        const editor = pickEditor();
        if (!editor) {
          vscode.window.showInformationMessage("SCSS Alias Jump: active editor가 없어요.");
          return;
        }
        const doc = editor.document;
        const pos = editor.selection.active;
        const line = doc.lineAt(pos.line).text;

        info(out, `[debug-click] doc.uri=${doc.uri.toString()} scheme=${doc.uri.scheme} lang=${doc.languageId}`);
        info(out, `[debug-click] doc.fileName="${doc.fileName}"`);
        const docFsPath = getDocFsPath(doc);
        info(out, `[debug-click] getDocFsPath="${docFsPath ?? "null"}"`);
        info(out, `[debug-click] line=${pos.line + 1}, char=${pos.character}, text="${line}"`);

        const aliases = getAliases(doc.uri);
        const aliasKeys = Object.keys(aliases).sort();
        info(out, `[debug-click] aliases keys: ${aliasKeys.length > 0 ? aliasKeys.join(", ") : "(none)"}`);

        const hitUnderCursor = getImportPathUnderCursorOnLine(line, pos.character);
        const scanLineForFirstImport = () => {
          USE_FORWARD_IMPORT_RE.lastIndex = 0;
          const m = USE_FORWARD_IMPORT_RE.exec(line);
          if (!m) return null;
          const full = m[0];
          const importPath = m[3];
          const q = m[2];
          const q1 = m.index + full.indexOf(q);
          const q2 = m.index + full.lastIndexOf(q);
          const startIdx = q1 >= 0 ? q1 + 1 : m.index + full.indexOf(importPath);
          const endIdx = q2 >= 0 ? q2 : m.index + full.indexOf(importPath) + importPath.length;
          return { importPath, startIdx, endIdx };
        };

        const hit = hitUnderCursor ?? scanLineForFirstImport();
        if (!hitUnderCursor) info(out, `[debug-click] no import path found under cursor`);
        if (hit) {
          info(out, `[debug-click] import on line: "${hit.importPath}" at ${hit.startIdx}-${hit.endIdx}`);
          info(
            out,
            `[debug-click] cursor-in-range: ${pos.character >= hit.startIdx && pos.character <= hit.endIdx}`
          );
          if (docFsPath) {
            const abs = resolveAliasToAbsolute(hit.importPath, docFsPath, aliases, doc.uri);
            info(out, `[debug-click] resolveAliasToAbsolute -> ${abs ?? "null"}`);
            if (abs) {
              const absNoExt = ensureNoExt(abs);
              const resolved = await resolveSassPathCached(absNoExt);
              info(out, `[debug-click] resolveSassPathCached("${absNoExt}") -> ${resolved ?? "null"}`);
            }
          } else {
            info(out, `[debug-click] skip resolveAliasToAbsolute: docFsPath is null`);
          }
        } else {
          info(out, `[debug-click] no import path found on line`);
        }

        const pct = getPlaceholderNameUnderCursor(doc, pos);
        if (pct) info(out, `[debug-click] placeholder found: "%${pct}"`);
        else info(out, `[debug-click] no placeholder under cursor`);

        const amp = getAmpSegmentUnderCursor(doc, pos);
        if (amp) info(out, `[debug-click] ampersand segment found: "&${amp}"`);
        else info(out, `[debug-click] no ampersand segment under cursor`);

        const nsVar = getNamespacedVarRefUnderCursor(doc, pos);
        if (nsVar) info(out, `[debug-click] namespaced var found: "${nsVar.namespace}.${nsVar.varName}"`);
        else info(out, `[debug-click] no namespaced var under cursor`);

        const allLinks = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
          "vscode.executeLinkProvider",
          doc.uri
        );

        const linksOnLine = (allLinks ?? []).filter(
          (l) => l.range.start.line <= pos.line && l.range.end.line >= pos.line
        );

        if (linksOnLine.length > 0) {
          info(out, `[debug-click] found ${linksOnLine.length} document links on line:`);
          for (const link of linksOnLine) {
            const linkText = doc.getText(link.range);
            info(
              out,
              `[debug-click]   link: "${linkText}" at ${link.range.start.character}-${link.range.end.character} -> ${link.target?.toString()}`
            );
            if (link.tooltip) info(out, `[debug-click]   tooltip: ${String(link.tooltip)}`);
          }
        } else {
          info(out, `[debug-click] no document links found on line`);
        }

        // Direct-call our providers to verify what *we* would produce for this document.
        const tokenSrc = new vscode.CancellationTokenSource();
        try {
          const ourLinkProvider = new ScssAliasDocumentLinkProvider(out);
          const ourLinks = await ourLinkProvider.provideDocumentLinks(doc, tokenSrc.token);
          const ourLinksOnLine = (ourLinks ?? []).filter(
            (l) => l.range.start.line <= pos.line && l.range.end.line >= pos.line
          );
          info(out, `[debug-click] our DocumentLinkProvider links on line: ${ourLinksOnLine.length}`);
          for (const l of ourLinksOnLine) {
            info(
              out,
              `[debug-click]   our-link: "${doc.getText(l.range)}" -> ${l.target?.toString()} tooltip=${String(
                l.tooltip ?? ""
              )}`
            );
          }
        } catch (e) {
          info(out, `[debug-click] our DocumentLinkProvider threw: ${String(e)}`);
        } finally {
          tokenSrc.dispose();
        }

        if (hit && docFsPath) {
          const defPos = new vscode.Position(pos.line, Math.min(hit.startIdx, Math.max(hit.startIdx, hit.endIdx - 1)));
          const defProvider = new ScssAliasDefinitionProvider(out);
          const def = await defProvider.provideDefinition(doc, defPos, new vscode.CancellationTokenSource().token);
          const asArr = Array.isArray(def) ? def : def ? [def] : [];
          info(out, `[debug-click] our DefinitionProvider result count: ${asArr.length}`);
          for (const d of asArr) {
            if ("targetUri" in (d as any)) {
              const dl = d as vscode.DefinitionLink;
              info(out, `[debug-click]   our-def-link: ${dl.targetUri.toString()}`);
            } else if ("uri" in (d as any)) {
              const loc = d as vscode.Location;
              info(out, `[debug-click]   our-def-loc: ${loc.uri.toString()}`);
            }
          }
        }

        vscode.window.showInformationMessage("SCSS Alias Jump: Debug info logged to Output panel");
      } catch (e) {
        info(out, `[err] debugClickTest failed: ${String(e)}`);
      }
    })
  );
}
