import * as vscode from "vscode";

// Keep in sync with package.json version for debugging.
export const EXT_VERSION = "0.1.15";

export const OUTPUT_CHANNEL_NAME = "SCSS Alias Jump";

export const USE_FORWARD_IMPORT_RE = /@(use|forward|import)\s+(['"])([^'"]+)\2/g;
export const EXTEND_PLACEHOLDER_RE = /@extend\s+%([A-Za-z0-9_-]+)\b/g;

export const OPEN_EXTEND_PLACEHOLDER_CMD = "scss-alias-jump.openExtendPlaceholder";
export const SHOW_PLACEHOLDER_EXTENDS_CMD = "scss-alias-jump.showPlaceholderExtends";
export const OPEN_LOCATION_CMD = "scss-alias-jump.openLocation";
export const SHOW_CLASS_USAGES_CMD = "scss-alias-jump.showClassUsages";
export const DEBUG_SCAN_IMPORTS_CMD = "scss-alias-jump.debugScanImports";
export const OPEN_IMPORT_UNDER_CURSOR_CMD = "scss-alias-jump.openImportUnderCursor";
export const DEBUG_CLICK_TEST_CMD = "scss-alias-jump.debugClickTest";

export const DEFINITION_SELECTOR: vscode.DocumentSelector = [
  { language: "scss" },
  { language: "sass" },
  { language: "css" },
  // SFC support (Vue/Svelte style blocks are often embedded in a `vue`/`svelte` document)
  { language: "vue" },
  { language: "svelte" },
];

export const DOCUMENT_LINK_SELECTOR: vscode.DocumentSelector = [
  { language: "scss" },
  { language: "sass" },
  { language: "css" },
  { language: "vue" },
  { language: "svelte" },
];

export const HOVER_SELECTOR: vscode.DocumentSelector = [
  { language: "scss" },
  { language: "sass" },
  { language: "vue" },
  { language: "svelte" },
];

