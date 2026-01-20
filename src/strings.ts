import * as path from "path";
import * as vscode from "vscode";

export function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Split text into lines, handling both Unix and Windows line endings
 */
export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

/**
 * Format a file location for display (filename:line)
 * Line numbers are converted from 0-based to 1-based for user display
 */
export function formatFileLocation(uri: vscode.Uri, line: number): string {
  return `${path.basename(uri.fsPath)}:${line + 1}`;
}
