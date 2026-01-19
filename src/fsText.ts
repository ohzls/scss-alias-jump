import * as vscode from "vscode";

export async function readTextFile(uri: vscode.Uri): Promise<string | null> {
  try {
    const buf = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(buf).toString("utf8");
  } catch {
    return null;
  }
}
