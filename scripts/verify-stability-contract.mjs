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
    const configured = resolveAliasToAbsolute('@/x', doc, { '@': '/custom/src' }, uri);
    check('implicit @ alias resolves to workspace src', fallback === `${workspaceRoot}/src/assets/css/scss/components/button`, fallback ?? 'null');
    check('explicit @ alias remains authoritative', configured === '/custom/src/x', configured ?? 'null');
  } finally {
    Module._load = originalLoad;
  }
}

function check(name, condition, detail) {
  if (condition) pass.push(name);
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

verifyAliasResolutionFallback();

const pkg = JSON.parse(read('package.json'));
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
]) {
  check(`activation includes ${event}`, activation.has(event));
}

const props = pkg.contributes?.configuration?.properties ?? {};
for (const setting of [
  'scssAliasJump.scanExclude',
  'scssAliasJump.scanMaxFileSizeKB',
  'scssAliasJump.scanMaxFiles',
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
check('scan utility timeout cancels underlying scan token', scan.includes('setTimeout(() => cts.cancel(), options.timeoutMs)') && scan.includes('scan(cts.token)'));
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

const sassResolve = read('src/sassResolve.ts');
check('sass resolver negative cache is short-lived', sassResolve.includes('NEGATIVE_CACHE_TTL_MS'));
check('sass resolver exposes cache invalidation watcher', sassResolve.includes('registerSassResolveCacheInvalidation') && sassResolve.includes('onDidCreate') && sassResolve.includes('onDidDelete'));
check('sass resolver watcher ignores content changes', sassResolve.includes('createFileSystemWatcher("**/*.{scss,sass,css}", false, true, false)'));

const extension = read('src/extension.ts');
check('extension registers Sass cache invalidation', extension.includes('registerSassResolveCacheInvalidation(context, out)'));

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
