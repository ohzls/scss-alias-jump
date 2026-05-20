import * as vscode from "vscode";

// Keep in sync with package.json version for debugging.
export const EXT_VERSION = "0.3.2";

export const OUTPUT_CHANNEL_NAME = "SCSS Alias Jump";

export const USE_FORWARD_IMPORT_RE = /@(use|forward|import)\s+(['"])([^'"]+)\2/g;
export const EXTEND_PLACEHOLDER_RE = /@extend\s+%([A-Za-z0-9_-]+)\b/g;

// Common SCSS patterns
export const AMP_SELECTOR_RE = /&[A-Za-z0-9_-]+/;
export const CLASS_SELECTOR_RE = /\.([A-Za-z0-9_-]+)/;
export const PLACEHOLDER_SELECTOR_RE = /%([A-Za-z0-9_-]+)/;

// File search patterns. Keep this as one GlobPattern because vscode.workspace.findFiles
// accepts a single exclude GlobPattern; user-configured scanExclude entries are
// post-filtered in scan.ts.
export const DEFAULT_SCAN_EXCLUDE_PATTERN =
  "**/{node_modules,dist,build,out,coverage,.git,.hg,.svn,.next,.nuxt,.svelte-kit,.turbo,.cache,dist-public}/**";
export const EXCLUDE_PATTERN = DEFAULT_SCAN_EXCLUDE_PATTERN;

// Performance limits
export const MAX_SEARCH_RESULTS = 200; // Maximum number of usage references to find
export const MAX_DEFINITION_RESULTS = 20; // Maximum number of definitions to find
export const CACHE_TTL_MS = 1500;
export const SEARCH_TIMEOUT_MS = 1500;
export const DEFAULT_SCAN_MAX_FILES = 2000;
export const DEFAULT_SCAN_MAX_FILE_SIZE_KB = 1024;
export const SCAN_LINE_CANCELLATION_INTERVAL = 100;
export const SCAN_YIELD_FILE_INTERVAL = 20;
export const MAX_CONCURRENT_WORKSPACE_SCANS = 2;

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
  // React/TypeScript for CSS Modules jump (styles.xxx → .xxx)
  { language: "typescript" },
  { language: "typescriptreact" },
  { language: "javascript" },
  { language: "javascriptreact" },
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
