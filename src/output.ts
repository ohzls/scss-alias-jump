import * as vscode from "vscode";
import { isDebugLoggingEnabled } from "./settings";

export type OutputLike = Pick<vscode.OutputChannel, "appendLine">;

export function info(out: OutputLike, msg: string) {
  out.appendLine(msg);
}

export function debug(out: OutputLike, msg: string, resource?: vscode.Uri) {
  if (isDebugLoggingEnabled(resource)) out.appendLine(msg);
}

