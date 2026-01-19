import * as vscode from "vscode";
import {
  DEFINITION_SELECTOR,
  DOCUMENT_LINK_SELECTOR,
  EXT_VERSION,
  HOVER_SELECTOR,
  OUTPUT_CHANNEL_NAME,
} from "./constants";
import { registerCommands } from "./commands";
import { ScssAliasDefinitionProvider } from "./providers/definitionProvider";
import { ScssAliasDocumentLinkProvider } from "./providers/documentLinkProvider";
import { ScssAliasHoverProvider } from "./providers/hoverProvider";

export function activate(context: vscode.ExtensionContext) {
  const out = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  out.appendLine(`[activate] SCSS Alias Jump 활성화됨 (v${EXT_VERSION})`);

  const definitionProvider = new ScssAliasDefinitionProvider(out);
  const linkProvider = new ScssAliasDocumentLinkProvider(out);
  const hoverProvider = new ScssAliasHoverProvider();

  // Register Definition provider FIRST with higher priority for Vue files
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(DEFINITION_SELECTOR, definitionProvider)
  );
  // DocumentLink provider for underline decoration (but Definition takes precedence on click)
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(DOCUMENT_LINK_SELECTOR, linkProvider)
  );
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(HOVER_SELECTOR, hoverProvider)
  );

  registerCommands(context, out);

  context.subscriptions.push(out);
}

export function deactivate() {}
