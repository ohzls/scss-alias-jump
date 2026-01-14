## SCSS Alias Jump

VS Code extension that enables Cmd/Ctrl+Click (Go to Definition) for SCSS/Sass `@use`, `@forward`, and `@import` paths that use alias prefixes.

It also supports **Cmd/Ctrl+Click for Sass placeholder extends**: `@extend %placeholder;`

### Settings

Add aliases in your workspace/user settings:

```json
{
  "scssAliasJump.aliases": {
    "@": "${workspaceFolder:nlrc}/src",
    "@scss": "${workspaceFolder:_assets}/scss"
  }
}
```

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

Tip: open **Output → `SCSS Alias Jump`** to see `[hit]`/`[miss]` logs for debugging.

### How it resolves paths

Given an absolute base path (after alias/relative expansion) it tries common Sass resolution candidates:

- `path.scss` / `path.sass` / `path.css`
- `_path.scss` / `_path.sass` / `_path.css`
- `path/index.scss` / `path/_index.scss` (and `.sass`/`.css`)

### History

- **0.0.2**
  - Added `@extend %...` Cmd/Ctrl+Click jump (direct definition + nested `&` chain support)
  - Added link-style behavior for `@extend` via `DocumentLinkProvider` (hover underline / pointer + click)
  - Added OutputChannel logs (`SCSS Alias Jump`) for easier debugging

### History

- **0.0.3**
  - Added `@extend %...` Cmd/Ctrl+Click jump (direct definition + nested `&` chain support)
  - Added link-style behavior for `@extend` via `DocumentLinkProvider` (hover underline / pointer + click)
  - Added OutputChannel logs (`SCSS Alias Jump`) for easier debugging
