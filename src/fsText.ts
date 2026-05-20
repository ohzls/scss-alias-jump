import * as vscode from "vscode";
import { getScanMaxFileSizeBytes } from "./settings";
import { throwIfCancellationRequested } from "./scan";

export type ReadTextFileOptions = {
  token?: vscode.CancellationToken;
  maxBytes?: number;
};

export async function readTextFile(
  uri: vscode.Uri,
  options: ReadTextFileOptions = {}
): Promise<string | null> {
  const token = options.token;
  try {
    throwIfCancellationRequested(token);
    const maxBytes = options.maxBytes ?? getScanMaxFileSizeBytes(uri);
    const stat = await vscode.workspace.fs.stat(uri);
    throwIfCancellationRequested(token);
    if (stat.size > maxBytes) return null;

    const buf = await vscode.workspace.fs.readFile(uri);
    throwIfCancellationRequested(token);
    if (buf.byteLength > maxBytes) return null;

    return Buffer.from(buf).toString("utf8");
  } catch (error) {
    if (error instanceof vscode.CancellationError) throw error;
    return null;
  }
}
