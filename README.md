## SCSS Alias Jump

VS Code extension that enables Cmd/Ctrl+Click (Go to Definition) for SCSS/Sass `@use`, `@forward`, and `@import` paths that use alias prefixes.

**Works in `.scss`, `.sass`, `.vue`, and `.svelte` files** — including Vue/Svelte `<style lang="scss">` blocks.

### Features

- **`@use`/`@forward`/`@import` path jump**: Cmd/Ctrl+Click on import paths with alias prefixes
- **`@extend %placeholder` jump**: Jump to placeholder definitions, including nested structures
- **Template class jump (NEW)**: Cmd/Ctrl+Click on class names in Vue/Svelte templates to jump to SCSS definitions
- **SCSS nesting support (NEW)**: Automatically resolves nested selectors like `.chat { &-header-actions { ... } }`
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

### Template Class Jump (Vue/Svelte)

**NEW in 0.1.17**: Jump from template class attributes to SCSS definitions!

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
- `class:foo` (Svelte)
- Multiple classes: `class="foo bar baz"` (click on specific class)

## Recent Updates

### Version 0.1.17 (Latest)

- **Template class jump**: Cmd/Ctrl+Click on class names in Vue/Svelte `<template>` sections to jump to SCSS definitions
- **SCSS nesting support**: Automatically resolves nested selectors (e.g., `.chat { &-header-actions { ... } }`)
- **Code quality improvements**: Major refactoring with ~150 lines of duplicate code removed

### Version 0.1.16

- **Fixed Vue/Svelte file support**: Stable jump-to-definition in `<style lang="scss">` blocks
- **Multi-root workspace**: Configuration scoping per workspace folder
- **Performance**: Parallel path resolution and optimized DocumentLink resolution

---

**For complete version history, see [CHANGELOG.md](./CHANGELOG.md)**
