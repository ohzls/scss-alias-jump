## SCSS Alias Jump

VS Code extension that enables Cmd/Ctrl+Click (Go to Definition) for SCSS/Sass `@use`, `@forward`, and `@import` paths that use alias prefixes.

**Works in `.scss`, `.sass`, `.vue`, and `.svelte` files** — including Vue/Svelte `<style lang="scss">` blocks.

It also supports **Cmd/Ctrl+Click for Sass placeholder extends**: `@extend %placeholder;`

### Settings

Add aliases in your workspace/user settings:

```json
{
  "scssAliasJump.aliases": {
    "@": "${workspaceFolder:nlrc}/src",
    "@scss": "${workspaceFolder:_assets}/scss"
  },
  "scssAliasJump.debugLogging": false,
  "scssAliasJump.hoverWorkspaceScan": false
}
```

**Configuration options:**

- **`scssAliasJump.aliases`**: Map import aliases to absolute paths. Supports VS Code variables like `${workspaceFolder}` or `${workspaceFolder:folderName}` for multi-root workspaces.
- **`scssAliasJump.debugLogging`**: Enable verbose debug logging to Output panel (default: `false`).
- **`scssAliasJump.hoverWorkspaceScan`**: Enable workspace-wide scans for hover features (class usages / `@extend` references). Disable this in large projects to avoid "Loading..." delays (default: `false`).

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

### How it resolves paths

Given an absolute base path (after alias/relative expansion) it tries common Sass resolution candidates:

- `path.scss` / `path.sass` / `path.css`
- `_path.scss` / `_path.sass` / `_path.css`
- `path/index.scss` / `path/_index.scss` (and `.sass`/`.css`)

### History

- **0.1.16**
  - **Fixed Vue/Svelte file support**: Stable jump-to-definition for `@use`/`@forward`/`@import` in `<style lang="scss">` blocks
  - **Multi-root workspace**: Configuration scoping now respects `resource` (each folder can have different aliases)
  - **Performance**: Parallel path resolution and lazy DocumentLink resolution to prevent cancellation/timeout in large files
  - **Improved path extraction**: Enhanced `getDocFsPath` to handle Volar/Vue Official virtual documents and embedded content
  - Added `scssAliasJump.debugLogging` and `scssAliasJump.hoverWorkspaceScan` configuration options

- **0.0.13**
  - Added hover + QuickPick to find usages of CSS classes (React/Vue/Svelte) when hovering on `.class` selectors in SCSS

- **0.0.12**
  - Fixed placeholder jump for camelCase nested placeholders (e.g. `%chatShellMain` from `%chatShell { &Main { ... } }`)

- **0.0.11**
  - Fixed namespaced Sass variable resolution to bind to the exact token under cursor (prevents `answer.$margin-bottom` / `progress.$margin-bottom` mixups)

- **0.0.10**
  - Added go-to-definition + hover link for Sass module variables like `answer.$markdown-title-padding-left`

- **0.0.9**
  - Fixed hover placeholder detection to ignore `%...` tokens in `//` comments and prefer nested `&...` inference

- **0.0.8**
  - Fixed hover `@extend` usage matching to avoid prefix matches (e.g. `%chat__sources` no longer matches `%chat__sources--overlay`)

- **0.0.7**
  - Improved hover `@extend` usages to show the enclosing selector/placeholder (container) for each match

- **0.0.6**
  - Added hover to show `@extend %...` usages (QuickPick + jump to location)

- **0.0.5**
  - Fixed placeholder nested lookup for merged selectors like `&__input-dock` (e.g. `%chat { &__input-dock { ... } }`)

- **0.0.4**
  - Added fallback jump for loop/interpolated placeholders (e.g. `%inner-padding-max` → `%inner-padding` or `%inner-padding-#{$k}...`)
  - Added duplicate-definition handling:
    - Definition provider returns multiple locations so VS Code can show **Peek Definitions**
    - `@extend` link click shows QuickPick when multiple matches exist

- **0.0.3**
  - Added `@extend %...` Cmd/Ctrl+Click jump (direct definition + nested `&` chain support)
  - Added link-style behavior for `@extend` via `DocumentLinkProvider` (hover underline / pointer + click)
  - Added OutputChannel logs (`SCSS Alias Jump`) for easier debugging
