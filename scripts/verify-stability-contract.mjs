#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const failures = [];
const pass = [];

function verifyAliasResolutionFallback() {
  const require = createRequire(import.meta.url);
  const Module = require('node:module');
  const distPath = path.join(root, 'dist', 'aliasResolve.js');
  if (!fs.existsSync(distPath)) {
    check('implicit @ alias fallback source present', read('src/aliasResolve.ts').includes('p.startsWith("@/")') && read('src/aliasResolve.ts').includes('"src"'));
    return;
  }

  const originalLoad = Module._load;
  const workspaceRoot = '/tmp/scss-alias-jump-test/nlrc';
  const folder = { name: 'nlrc', uri: { fsPath: workspaceRoot, toString: () => `file://${workspaceRoot}` } };
  const vscodeMock = {
    workspace: {
      workspaceFolders: [folder],
      getWorkspaceFolder(uri) {
        return uri.fsPath && uri.fsPath.startsWith(`${workspaceRoot}/`) ? folder : undefined;
      },
    },
  };

  try {
    Module._load = function load(request, parent, isMain) {
      if (request === 'vscode') return vscodeMock;
      return originalLoad.call(this, request, parent, isMain);
    };
    delete require.cache[require.resolve(distPath)];
    const { resolveAliasToAbsolute } = require(distPath);
    const doc = `${workspaceRoot}/src/assets/css/scss/components/_popoverMenu.scss`;
    const uri = { fsPath: doc, toString: () => `file://${doc}` };
    const fallback = resolveAliasToAbsolute('@/assets/css/scss/components/button', doc, {}, uri);
    const scssFallback = resolveAliasToAbsolute('@scss/_base/__reset', doc, {}, uri);
    const configured = resolveAliasToAbsolute('@/x', doc, { '@': '/custom/src' }, uri);
    const configuredScss = resolveAliasToAbsolute('@scss/_base/__reset', doc, { '@scss': '/custom/scss' }, uri);
    check('implicit @ alias resolves to workspace src', fallback === `${workspaceRoot}/src/assets/css/scss/components/button`, fallback ?? 'null');
    check('implicit @scss alias resolves to workspace vendor SCSS', scssFallback === `${workspaceRoot}/vendor/_assets/scss/_base/__reset`, scssFallback ?? 'null');
    check('explicit @ alias remains authoritative', configured === '/custom/src/x', configured ?? 'null');
    check('explicit @scss alias remains authoritative', configuredScss === '/custom/scss/_base/__reset', configuredScss ?? 'null');
  } finally {
    Module._load = originalLoad;
  }
}

async function verifyHardTimeoutScanRecovery() {
  const require = createRequire(import.meta.url);
  const Module = require('node:module');
  const distPath = path.join(root, 'dist', 'scan.js');
  if (!fs.existsSync(distPath)) {
    check('hard-timeout scan recovery dynamic check skipped until dist exists', true);
    return;
  }

  class CancellationError extends Error {}
  class CancellationTokenSource {
    constructor() {
      this._cancelled = false;
      this._listeners = new Set();
      this.token = {
        get isCancellationRequested() {
          return this._owner._cancelled;
        },
        onCancellationRequested: (listener) => {
          this._listeners.add(listener);
          return { dispose: () => this._listeners.delete(listener) };
        },
        _owner: this,
      };
    }
    cancel() {
      if (this._cancelled) return;
      this._cancelled = true;
      for (const listener of [...this._listeners]) listener();
    }
    dispose() {
      this._listeners.clear();
    }
  }

  const vscodeMock = {
    CancellationError,
    CancellationTokenSource,
    workspace: {
      workspaceFolders: [],
      getWorkspaceFolder: () => undefined,
      getConfiguration: () => ({ get: () => undefined }),
    },
  };

  const originalLoad = Module._load;
  try {
    Module._load = function load(request, parent, isMain) {
      if (request === 'vscode') return vscodeMock;
      return originalLoad.call(this, request, parent, isMain);
    };
    delete require.cache[require.resolve(distPath)];
    const { runDedupedCancellableScan, getWorkspaceScanStateStats } = require(distPath);

    let calls = 0;
    const started = Date.now();
    let timedOut = false;
    try {
      await runDedupedCancellableScan('dynamic-hard-timeout', { timeoutMs: 20 }, async () => {
        calls += 1;
        return new Promise(() => undefined);
      });
    } catch (error) {
      timedOut = error instanceof CancellationError;
    }

    const elapsed = Date.now() - started;
    check('hard-timeout rejects stuck scan as cancellation', timedOut, `elapsed=${elapsed}`);
    check('hard-timeout returns promptly', elapsed < 500, `elapsed=${elapsed}`);

    const second = await runDedupedCancellableScan('dynamic-hard-timeout', { timeoutMs: 200 }, async () => {
      calls += 1;
      return 'ok';
    });
    const stats = getWorkspaceScanStateStats();
    check('hard-timeout evicts stale in-flight key', second === 'ok' && calls === 2, `second=${second}, calls=${calls}`);
    check('hard-timeout leaves no queued scan state', stats.inFlight === 0 && stats.queued === 0, JSON.stringify(stats));
  } finally {
    Module._load = originalLoad;
  }
}

async function verifyDocumentLinkBasenameTarget() {
  const require = createRequire(import.meta.url);
  const Module = require('node:module');
  const distPath = path.join(root, 'dist', 'providers', 'documentLinkProvider.js');
  if (!fs.existsSync(distPath)) {
    check('basename document-link dynamic check skipped until dist exists', true);
    return;
  }

  const workspaceRoot = '/tmp/scss-alias-jump-test/nlrc';
  const targetPath = `${workspaceRoot}/vendor/_assets/scss/_base/__reset.scss`;
  const line = "@use '@scss/_base/__reset' as *;";
  const docPath = `${workspaceRoot}/src/AppLayout.module.scss`;
  const folder = { name: 'nlrc', uri: { fsPath: workspaceRoot, toString: () => `file://${workspaceRoot}` } };
  class Position {
    constructor(line, character) {
      this.line = line;
      this.character = character;
    }
  }
  class Range {
    constructor(startLineOrPos, startCharOrPos, endLine, endChar) {
      if (typeof startLineOrPos === 'number') {
        this.start = new Position(startLineOrPos, startCharOrPos);
        this.end = new Position(endLine, endChar);
      } else {
        this.start = startLineOrPos;
        this.end = startCharOrPos;
      }
    }
  }
  class DocumentLink {
    constructor(range, target) {
      this.range = range;
      this.target = target;
    }
  }
  class CancellationError extends Error {}
  const vscodeMock = {
    CancellationError,
    Position,
    Range,
    DocumentLink,
    Uri: { file: (fsPath) => ({ fsPath, toString: () => `file://${fsPath}` }) },
    workspace: {
      workspaceFolders: [folder],
      getWorkspaceFolder(uri) {
        return uri.fsPath && uri.fsPath.startsWith(`${workspaceRoot}/`) ? folder : undefined;
      },
      getConfiguration: () => ({ get: () => undefined }),
      fs: {
        async stat(uri) {
          if (uri.fsPath === targetPath) return { type: 1, size: 10 };
          throw new Error(`not found: ${uri.fsPath}`);
        },
      },
    },
  };

  const originalLoad = Module._load;
  try {
    Module._load = function load(request, parent, isMain) {
      if (request === 'vscode') return vscodeMock;
      return originalLoad.call(this, request, parent, isMain);
    };
    delete require.cache[require.resolve(distPath)];
    const { ScssAliasDocumentLinkProvider } = require(distPath);
    const doc = {
      uri: { fsPath: docPath, scheme: 'file', toString: () => `file://${docPath}` },
      fileName: docPath,
      getText: () => line,
      positionAt(offset) {
        return new Position(0, offset);
      },
    };
    const provider = new ScssAliasDocumentLinkProvider({ appendLine: () => undefined });
    const links = await provider.provideDocumentLinks(doc, { isCancellationRequested: false });
    const linkTexts = links.map((link) => line.slice(link.range.start.character, link.range.end.character));
    check('document link includes full import path target', linkTexts.includes('@scss/_base/__reset'), linkTexts.join(', '));
    check('document link includes basename segment target', linkTexts.includes('__reset'), linkTexts.join(', '));
    check('document link basename target is resolved file', links.some((link) => line.slice(link.range.start.character, link.range.end.character) === '__reset' && link.target?.fsPath === targetPath), JSON.stringify(linkTexts));
  } finally {
    Module._load = originalLoad;
  }
}

async function verifyCssModuleNamespaceResolution() {
  const require = createRequire(import.meta.url);
  const Module = require('node:module');
  const cursorTokensPath = path.join(root, 'dist', 'cursorTokens.js');
  const cssModulesPath = path.join(root, 'dist', 'cssModules.js');
  if (!fs.existsSync(cursorTokensPath) || !fs.existsSync(cssModulesPath)) {
    check('CSS Modules namespace dynamic check skipped until dist exists', true);
    return;
  }

  const workspaceRoot = '/tmp/scss-alias-jump-test/nlrc';
  const appFile = `${workspaceRoot}/src/App.tsx`;
  const targetPath = `${workspaceRoot}/src/AppLayout.module.scss`;
  class Position {
    constructor(line, character) {
      this.line = line;
      this.character = character;
    }
  }
  class Range {
    constructor(startLine, startChar, endLine, endChar) {
      this.start = new Position(startLine, startChar);
      this.end = new Position(endLine, endChar);
    }
  }
  class CancellationError extends Error {}
  const folder = { name: 'nlrc', uri: { fsPath: workspaceRoot, toString: () => `file://${workspaceRoot}` } };
  const vscodeMock = {
    CancellationError,
    Position,
    Range,
    Uri: { file: (fsPath) => ({ fsPath, toString: () => `file://${fsPath}` }) },
    workspace: {
      workspaceFolders: [folder],
      getWorkspaceFolder(uri) {
        return uri.fsPath && uri.fsPath.startsWith(`${workspaceRoot}/`) ? folder : undefined;
      },
      getConfiguration: () => ({ get: () => undefined }),
      fs: {
        async stat(uri) {
          if (uri.fsPath === targetPath) return { type: 1, size: 10 };
          throw new Error(`not found: ${uri.fsPath}`);
        },
      },
    },
  };

  const originalLoad = Module._load;
  try {
    Module._load = function load(request, parent, isMain) {
      if (request === 'vscode') return vscodeMock;
      return originalLoad.call(this, request, parent, isMain);
    };
    delete require.cache[require.resolve(cursorTokensPath)];
    delete require.cache[require.resolve(cssModulesPath)];
    const { getCssModuleClassUnderCursor } = require(cursorTokensPath);
    const { findCssModuleImport, findCssModuleImportVars, resolveCssModulePath } = require(cssModulesPath);
    const source = "import layout from '@/AppLayout.module.scss'\nconst className = layout.pageInner";
    const importVars = findCssModuleImportVars(source);
    const line = 'const className = layout.pageInner';
    const doc = {
      lineAt: () => ({ text: line }),
      getText: (range) => line.slice(range.start.character, range.end.character),
      getWordRangeAtPosition: () => null,
    };
    const ref = getCssModuleClassUnderCursor(doc, new Position(0, line.indexOf('pageInner') + 2), importVars);
    check('CSS Module cursor parser accepts arbitrary import namespace', ref?.importVar === 'layout' && ref?.className === 'pageInner', JSON.stringify(ref));

    const nonImportedLine = 'const other = element.style.position';
    const nonImportedDoc = { ...doc, lineAt: () => ({ text: nonImportedLine }) };
    const nonImportedRef = getCssModuleClassUnderCursor(nonImportedDoc, new Position(0, nonImportedLine.indexOf('position') + 2), importVars);
    check('CSS Module cursor parser ignores non-imported namespaces', nonImportedRef === null, JSON.stringify(nonImportedRef));

    const chainedLine = 'const other = props.layout.pageInner';
    const chainedDoc = { ...doc, lineAt: () => ({ text: chainedLine }) };
    const chainedRef = getCssModuleClassUnderCursor(chainedDoc, new Position(0, chainedLine.indexOf('pageInner') + 2), importVars);
    check('CSS Module cursor parser ignores property-chain namespaces', chainedRef === null, JSON.stringify(chainedRef));

    check('CSS Module import path resolves for arbitrary namespace', findCssModuleImport(source, 'layout') === '@/AppLayout.module.scss');
    check('CSS Module import vars include arbitrary namespace', importVars.includes('layout'));
    const resolved = await resolveCssModulePath('@/AppLayout.module.scss', appFile, {}, { fsPath: appFile, toString: () => `file://${appFile}` });
    check('CSS Module alias import resolves via @ fallback', resolved === targetPath, resolved ?? 'null');
  } finally {
    Module._load = originalLoad;
  }
}

function check(name, condition, detail) {
  if (condition) pass.push(name);
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

verifyAliasResolutionFallback();
await verifyHardTimeoutScanRecovery();
await verifyDocumentLinkBasenameTarget();
await verifyCssModuleNamespaceResolution();

const pkg = JSON.parse(read('package.json'));
const constants = read('src/constants.ts');
const versionMatch = constants.match(/EXT_VERSION\s*=\s*"([^"]+)"/);
check('EXT_VERSION matches package version', versionMatch?.[1] === pkg.version, versionMatch?.[1] ?? 'missing');

const activation = new Set(pkg.activationEvents ?? []);
for (const event of [
  'onStartupFinished',
  'onLanguage:scss',
  'onLanguage:sass',
  'onLanguage:vue',
  'onLanguage:svelte',
  'onCommand:scss-alias-jump.debugScanImports',
  'onCommand:scss-alias-jump.openImportUnderCursor',
  'onCommand:scss-alias-jump.debugClickTest',
  'onCommand:scss-alias-jump.clearCaches',
]) {
  check(`activation includes ${event}`, activation.has(event));
}

const props = pkg.contributes?.configuration?.properties ?? {};
for (const setting of [
  'scssAliasJump.scanExclude',
  'scssAliasJump.scanMaxFileSizeKB',
  'scssAliasJump.scanMaxFiles',
  'scssAliasJump.cacheAutoClearIntervalMs',
]) {
  check(`package setting ${setting}`, Object.prototype.hasOwnProperty.call(props, setting));
}

const hover = read('src/providers/hoverProvider.ts');
check('hover no timeout-only wrapper import', !hover.includes('../async') && !hover.includes('withTimeout('));
check('hover passes cancellation token into class scan', /findClassUsages\([^\n]+\{[^}]*token[^}]*timeoutMs: SEARCH_TIMEOUT_MS/s.test(hover));
check('hover passes cancellation token into extend scan', /findExtendReferences\([^\n]+\{[^}]*token[^}]*timeoutMs: SEARCH_TIMEOUT_MS/s.test(hover));

const scan = read('src/scan.ts');
check('scan utility passes token as findFiles fourth arg', /workspace\.findFiles\([^\n]+DEFAULT_SCAN_EXCLUDE_PATTERN,[^\n]+,[^\n]+token\)/.test(scan));
check('scan utility has in-flight de-dupe map', scan.includes('inFlightScans') && scan.includes('runDedupedCancellableScan'));
check('scan utility has global concurrency queue', scan.includes('MAX_CONCURRENT_WORKSPACE_SCANS') && scan.includes('scanWaitQueue'));
check('scan utility timeout cancels underlying scan token', scan.includes('cts.cancel()') && scan.includes('options.timeoutMs') && scan.includes('scan(cts.token)'));
check('scan utility hard-timeout races stuck scans', scan.includes('Promise.race') && scan.includes('timeoutPromise') && scan.includes('releaseTurnOnce()'));
check('scan utility exposes scan-state reset', scan.includes('clearWorkspaceScanState') && scan.includes('getWorkspaceScanStateStats'));
check('scan utility links request cancellation to underlying token', scan.includes('options.token?.onCancellationRequested(() => cts.cancel())'));
check('scan cache key includes scope/config', scan.includes('scopeFolder') && scan.includes('scopeMode') && scan.includes('getScanConfigCacheKey'));

const fsText = read('src/fsText.ts');
check('readTextFile stats before read', fsText.includes('workspace.fs.stat') && fsText.includes('stat.size > maxBytes'));
check('readTextFile checks token after read', fsText.includes('workspace.fs.readFile') && fsText.includes('throwIfCancellationRequested(token)'));

for (const rel of ['src/classUsage.ts', 'src/extendRefs.ts', 'src/placeholders.ts']) {
  const text = read(rel);
  check(`${rel} uses deduped cancellable scan`, text.includes('runDedupedCancellableScan'));
  check(`${rel} uses bounded workspace file helper`, text.includes('findWorkspaceFiles'));
  check(`${rel} checks cancellation in line loops`, text.includes('SCAN_LINE_CANCELLATION_INTERVAL') && text.includes('throwIfCancellationRequested(token)'));
}

const commands = read('src/commands.ts');
check('commands use cancellable progress for full scans', commands.includes('withProgress') && commands.includes('cancellable: true'));
check('commands pass progress token into class scan', /findClassUsages\([^\n]+\{[^}]*token/s.test(commands));
check('commands pass progress token into placeholder scan', /findPlaceholderDefinitions\([^\n]+\{[^}]*token/s.test(commands));
check('commands pass progress token into extend scan', /findExtendReferences\([^\n]+\{[^}]*token/s.test(commands));
check('commands pass timeout into class scan', /findClassUsages\([^\n]+\{[^}]*timeoutMs: COMMAND_SCAN_TIMEOUT_MS/s.test(commands));
check('commands pass timeout into placeholder scan', /findPlaceholderDefinitions\([^\n]+\{[^}]*timeoutMs: COMMAND_SCAN_TIMEOUT_MS/s.test(commands));
check('commands pass timeout into extend scan', /findExtendReferences\([^\n]+\{[^}]*timeoutMs: COMMAND_SCAN_TIMEOUT_MS/s.test(commands));

const documentLinkProvider = read('src/providers/documentLinkProvider.ts');
check('document links add basename segment target', documentLinkProvider.includes('basenameStartInImport') && documentLinkProvider.includes('pushResolvedLink'));

const cursorTokens = read('src/cursorTokens.ts');
check('CSS Module cursor parser is namespace-generic and import-var gated', cursorTokens.includes('layout.className') && cursorTokens.includes('allowedImportVars'));

const cssModules = read('src/cssModules.ts');
check('CSS Module helper exposes imported namespace collection', cssModules.includes('findCssModuleImportVars'));
check('CSS Module path resolver uses alias resolution', cssModules.includes('resolveAliasToAbsolute'));

const definitionProvider = read('src/providers/definitionProvider.ts');
check('definition provider passes imported CSS Module namespaces into cursor parser', definitionProvider.includes('findCssModuleImportVars') && definitionProvider.includes('getCssModuleClassUnderCursor(document, position, cssModuleImportVars)'));

const classUsage = read('src/classUsage.ts');
check('CSS Module reverse usage scan uses imported namespaces', classUsage.includes('findCssModuleImportVars') && classUsage.includes('buildCssModuleUsagePatterns'));

const sassResolve = read('src/sassResolve.ts');
check('sass resolver negative cache is short-lived', sassResolve.includes('NEGATIVE_CACHE_TTL_MS'));
check('sass resolver exposes cache invalidation watcher', sassResolve.includes('registerSassResolveCacheInvalidation') && sassResolve.includes('onDidCreate') && sassResolve.includes('onDidDelete'));
check('sass resolver watcher ignores content changes', sassResolve.includes('createFileSystemWatcher("**/*.{scss,sass,css}", false, true, false)'));

const extension = read('src/extension.ts');
check('extension registers Sass cache invalidation', extension.includes('registerSassResolveCacheInvalidation(context, out)'));
check('extension registers automatic cache reset', extension.includes('registerAutomaticCacheReset(context, out)'));

const cacheReset = read('src/cacheReset.ts');
check('automatic cache reset clears all internal cache/state buckets', cacheReset.includes('clearSassResolveCache') && cacheReset.includes('clearClassUsageCache') && cacheReset.includes('clearExtendRefsCache') && cacheReset.includes('clearWorkspaceScanState'));
check('automatic cache reset has periodic interval setting', cacheReset.includes('getCacheAutoClearIntervalMs') && cacheReset.includes('setInterval'));

check('commands register manual cache clear command', commands.includes('CLEAR_CACHES_CMD') && commands.includes('clearScssAliasJumpCaches("manual-command"'));

const directFindFiles = [];
for (const dir of ['src']) {
  const stack = [path.join(root, dir)];
  while (stack.length) {
    const cur = stack.pop();
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.endsWith('.ts')) {
        const rel = path.relative(root, full);
        if (rel === 'src/scan.ts') continue;
        const text = fs.readFileSync(full, 'utf8');
        if (/vscode\.workspace\.findFiles\s*\(/.test(text) || /workspace\.findFiles\s*\(/.test(text)) directFindFiles.push(rel);
      }
    }
  }
}
check('only scan utility calls workspace.findFiles directly', directFindFiles.length === 0, directFindFiles.join(', '));

if (failures.length > 0) {
  console.error('Stability contract verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Stability contract verification passed (${pass.length} checks).`);
