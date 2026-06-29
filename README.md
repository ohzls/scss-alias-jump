## SCSS Alias Jump

VS Code extension that enables Cmd/Ctrl+Click (Go to Definition) for SCSS/Sass `@use`, `@forward`, and `@import` paths that use alias prefixes.

**Works in `.scss`, `.sass`, `.vue`, and `.svelte` files** — including Vue/Svelte `<style lang="scss">` blocks.

### Features

- **`@use`/`@forward`/`@import` path jump**: Cmd/Ctrl+Click on import paths with alias prefixes
- **`@extend %placeholder` jump**: Jump to placeholder definitions, including nested structures
- **Bidirectional CSS Modules jump**:
  - React/TypeScript → SCSS: `styles.fileItem` / `layout.pageInner` → `.fileItem` / `.pageInner` definition
  - SCSS → React/TypeScript: `.fileItem` → `styles.fileItem` / `layout.fileItem` usages
- **Template class jump**: Cmd/Ctrl+Click on class names in Vue/Svelte templates to jump to SCSS definitions
- **SCSS nesting support**: Automatically resolves nested selectors like `.chat { &-header-actions { ... } }`
- **SCSS interpolation support**: Handles `#{$variable}` patterns in selectors
- **Hover for usages**: Hover on placeholders or class selectors to see usage locations
- **Sass module variables**: Jump to namespaced variable definitions like `answer.$padding`

### Settings

Add aliases in your workspace/user settings:

```json
{
  "scssAliasJump.aliases": {
    "@": "${workspaceFolder:nlrc}/src",
    "@scss": "${workspaceFolder:_assets}/scss"
  },
  "scssAliasJump.debugLogging": false,
  "scssAliasJump.hoverWorkspaceScan": true,
  "scssAliasJump.scanExclude": ["**/.svelte-kit/**", "**/.next/**", "**/dist-public/**"],
  "scssAliasJump.scanMaxFileSizeKB": 1024,
  "scssAliasJump.scanMaxFiles": 2000,
  "scssAliasJump.cacheAutoClearIntervalMs": 30000
}
```

**Configuration options:**

- **`scssAliasJump.aliases`**: Map import aliases to absolute paths. Supports VS Code variables like `${workspaceFolder}` or `${workspaceFolder:folderName}` for multi-root workspaces. If no explicit alias matches, `@/…` falls back to `${workspaceFolder}/src/…`, and `@scss/…` falls back to `${workspaceFolder}/vendor/_assets/scss/…` for the current document's workspace folder.
- **`scssAliasJump.debugLogging`**: Enable verbose debug logging to Output panel (default: `false`).
- **`scssAliasJump.hoverWorkspaceScan`**: Enable workspace-wide scans for hover features (class usages / `@extend` references). **Default: `true`**. Disable if experiencing delays in very large projects.
- **`scssAliasJump.scanExclude`**: Additional generated-folder globs to skip during workspace scans. Defaults include `.svelte-kit`, `.next`, `dist-public`, `.turbo`, and `.cache`.
- **`scssAliasJump.scanMaxFileSizeKB`**: Maximum file size read during workspace scans. Larger files are skipped to keep hover/definition responsive. **Default: `1024`**.
- **`scssAliasJump.scanMaxFiles`**: Maximum candidate files considered per workspace scan before post-filtering/result limits. **Default: `2000`**.
- **`scssAliasJump.cacheAutoClearIntervalMs`**: Periodically clears internal path/scan caches so stale or stuck state self-heals. Set to `0` to disable periodic clearing. **Default: `30000`**.

### `@extend %...` (placeholder) jump

When your SCSS contains:

```scss
@extend %chat__result-list__dt;
```

you can Cmd/Ctrl+hover/click on the **`%chat__result-list__dt`** token to jump to its definition.

Supported definition patterns:

- Direct placeholder definition:
  - `%chat__result-list__dt { ... }`
- Nested placeholder definition via `&` chain inside a shorter placeholder block:
  - `%chat { &__result { &-list { &__dt { ... }}}}`
- Nested placeholder definition with **merged `&...` selector** (parts combined on a single line):
  - `%chat { &__input-dock { ... } }`

Tip: open **Output → `SCSS Alias Jump`** to see `[hit]`/`[miss]` logs for debugging.

### Hover: find `@extend` usages

Hover on a placeholder definition to see where it’s extended in the current workspace.

- Hover `%chat` → shows `@extend %chat` usages
- Hover nested selectors inside a placeholder block (heuristic):
  - `%chat { &__input { &-docker { ... }}}` → hover `&__input` / `&-docker` to search `@extend %chat__input-docker`


### Stability and large-workspace responsiveness

Workspace scans used by hover, template class jumps, CSS Modules reverse jumps, and `%placeholder` jumps are cancellable and bounded:

- provider cancellation is propagated into `workspace.findFiles` and scan loops;
- repeated identical scans are de-duplicated while in flight;
- in-flight scans have a hard timeout race so a `workspace.findFiles` cancellation stall cannot poison later clicks;
- manual scan commands also use bounded timeouts instead of unbounded progress-only scans;
- scan concurrency is capped so hover storms do not flood the extension host;
- large files and generated folders are skipped by configurable guards;
- Sass path lookup misses are short-lived and the path cache is cleared on Sass file create/delete, alias/workspace changes, manual cache reset, and periodic auto-clear.

### How it resolves paths

Given an absolute base path (after alias/relative expansion) it tries common Sass resolution candidates. Explicit aliases win; otherwise common project conventions are resolved relative to the current document's workspace folder: `@/…` → `src/…`, and `@scss/…` → `vendor/_assets/scss/…`.

- `path.scss` / `path.sass` / `path.css`
- `_path.scss` / `_path.sass` / `_path.css`
- `path/index.scss` / `path/_index.scss` (and `.sass`/`.css`)

### CSS Modules (React/TypeScript/Vue)

Bidirectional jump between TypeScript and SCSS:

**TypeScript → SCSS:**
```tsx
import styles from './ChatInput.module.scss'

<div className={styles.fileItem}>  // Cmd+Click anywhere on "styles.fileItem"
```
→ Jumps to `.fileItem` in `ChatInput.module.scss`

The import namespace is not hardcoded to `styles`; aliases such as `layout.pageInner`,
`appLayout.shell`, or `wbStyles.button` also work when they come from a stylesheet import:

```tsx
import layout from '@/AppLayout.module.scss'

<main className={layout.pageInner}>  // Cmd+Click → AppLayout.module.scss .pageInner
```

**SCSS → TypeScript (Reverse Jump):**
```scss
.fileItem {  // Cmd+Click on ".fileItem" or "&Item"
  padding: 1em;
}

// Also works with nesting and interpolation:
#{$aux} {    // $aux: '.aux'
  &Menu {    // Cmd+Click → finds styles.auxMenu usages
    ...
  }
}
```
→ Shows QuickPick list of all `styles.fileItem` or `styles.auxMenu` usages

**Supports:**
- Import namespaces: `styles.foo`, `layout.foo`, `appLayout.foo`, etc.
- Import patterns: `import styles from './X.module.scss'` or `import styles from './X.module'`
- Alias CSS Module imports such as `import layout from '@/AppLayout.module.scss'`
- SCSS interpolation: `#{$variable}` in selectors
- Nested selectors: `#{$aux} { &Menu { ... } }` → `auxMenu`

### Template Class Jump (Vue/Svelte)

Jump from template class attributes to SCSS definitions!

In Vue/Svelte templates:
```vue
<template>
  <div class="chat-header-actions">
    <!-- Cmd/Ctrl+Click on "chat-header-actions" to jump to its SCSS definition -->
  </div>
</template>
```

Will find definitions in:
```scss
// Direct definition
.chat-header-actions { ... }

// Nested with & (SCSS nesting)
.chat { 
  &-header-actions { ... }
}
```

Supports:
- `class="..."`, `className="..."`
- `:class="..."`, `v-bind:class="..."`
  - Literal class keys in Vue object/array bindings, such as `:class="{ active: ok, 'is-open': open }"` and `:class="['foo', cond && 'bar']"`
  - Computed variable-only bindings such as `:class="computedClass"` and condition-only strings such as `state === 'enabled'` are ignored because no literal CSS class can be resolved from that token
- `class:foo` (Svelte)
- Multiple classes: `class="foo bar baz"` (click on specific class)


### Bundle and install in Cursor

Create a verified VSIX bundle:

```bash
npm run bundle
```

This runs `compile`, `verify:stability`, `vscode:prepublish`, then `vsce package --out scss-alias-jump-<version>.vsix`.

Create and install into Cursor in one step:

```bash
npm run bundle:cursor
```

If Cursor is not on your shell path, pass the binary explicitly:

```bash
node ./scripts/bundle.mjs --install-cursor --cursor-bin /path/to/cursor
```


### Prepare release metadata

Use the release script to keep package metadata, lockfile metadata, runtime debug version, and changelog headers in sync:

```bash
npm run release:patch
# or: npm run release:minor / npm run release:major / npm run release:set -- <version>
```

The script updates `package.json`, `package-lock.json`, `src/constants.ts`, and adds a dated `CHANGELOG.md` section when needed. Replace the generated changelog note with release-specific details before publishing, then run:

```bash
npm run compile
npm test
npm run verify:stability
npm run publish:marketplace:dry
```


### Publish to VS Code Marketplace

Prerequisites:

1. Create or verify the Marketplace publisher id in `package.json` (`seongwonseo`).
2. Create an Azure DevOps Personal Access Token with Marketplace `Manage` scope.
3. Store it as `VSCE_PAT` locally or as the GitHub repository secret `VSCE_PAT`.

Local dry run:

```bash
npm run publish:marketplace:dry
```

Local publish:

```bash
VSCE_PAT=... npm run publish:marketplace -- --skip-duplicate
```

The publish script validates `package.json`/`package-lock.json` version parity, requires a dated `CHANGELOG.md` entry for the current version, builds the verified VSIX, then publishes that exact VSIX via `vsce publish --packagePath`.

GitHub Actions:

- `CI` runs on pushes to `main` and pull requests, covering `npm ci`, `compile`, parser contract tests, `verify:stability`, and `npm audit --omit=dev`.
- `Publish VS Code Extension` can be run manually with `dry_run=true` for validation only.
- Pushing a `v*` tag publishes with `--skip-duplicate` using the `VSCE_PAT` secret.

## Recent Updates

### Version 0.3.5 (Latest)

- **CSS Module namespace fix**: Cmd/Ctrl-click now handles imported namespaces like `layout.pageInner`, `appLayout.shell`, and `wbStyles.button`, not only `styles.foo`.
- **Alias CSS Module imports**: CSS Module imports such as `@/AppLayout.module.scss` resolve through the same alias/fallback path logic.
- **Safer namespace matching**: JS/TS property chains and non-imported namespaces are ignored so clicks do not fall through to unrelated providers as often.
- **Stronger click reliability**: import path document links also include the basename segment, reducing conflicts with built-in Sass links.
- **Bounded manual scans**: manual usage/placeholder scan commands now use command-level timeouts.
- **Cache self-healing**: hard-timeout guarded in-flight scans, periodic cache auto-clear, and manual `SCSS Alias Jump: Clear Internal Caches`.
- **Implicit `@scss/...` fallback**: vendored shared SCSS roots resolve to `${workspaceFolder}/vendor/_assets/scss/...` when no explicit alias is configured.
- **Bidirectional CSS Modules jump**: 
  - React/TypeScript → SCSS: `styles.fileItem` → `.fileItem` definition
  - SCSS → React/TypeScript: `.fileItem` → `styles.fileItem` usages
- **SCSS interpolation support**: `#{$variable}` in selectors with full nesting support
- **Template class jump**: Cmd/Ctrl+Click on class names in Vue/Svelte templates to jump to SCSS definitions
- **SCSS nesting support**: Automatically resolves nested selectors (e.g., `.chat { &-header-actions { ... } }`)
- **Code quality improvements**: Major refactoring with ~150 lines of duplicate code removed

---

**For complete version history, see [CHANGELOG.md](./CHANGELOG.md)**
