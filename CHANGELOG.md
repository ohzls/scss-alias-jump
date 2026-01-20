# Changelog

All notable changes to the "SCSS Alias Jump" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-01-20

### Added
- **Bidirectional CSS Modules jump** (React/TypeScript/Next.js):
  - **Forward jump**: Cmd/Click on `styles.fileItem` in TSX/JSX to jump to `.fileItem` definition in SCSS
  - **Reverse jump**: Cmd/Click on `.fileItem` or `&Item` in SCSS to find all `styles.fileItem` usages in code
  - Supports import patterns with or without extensions: `import styles from './X.module.scss'` or `'./X.module'`
  - Works with namespaced imports: `import * as styles from '...'`
- **SCSS interpolation support**: Full support for `#{$variable}` in selectors
  - Parses SCSS variables: `$aux: '.aux';`
  - Resolves interpolation: `#{$aux} { &Menu { ... } }` → `.auxMenu`
  - Finds usages: Cmd/Click on `#{$aux}` or `&Menu` → finds `styles.auxMenu` in React/Vue files
  - Skips interpolation braces when parsing block structure
- **Template class jump**: Cmd/Ctrl+Click on class names in Vue/Svelte `<template>` sections to jump to SCSS definitions
  - Supports `class="..."`, `className="..."`, `:class="..."`, `v-bind:class="..."`, `class:foo`
  - Handles multiple classes in one attribute
  - Also supports Svelte dynamic classes: `class={"foo"}`
- **SCSS nesting support**: Automatically resolves nested selectors (e.g., `.chat { &-header-actions { ... } }`)
  - Works for both template class jumps and placeholder definitions
  - Supports BEM patterns with `&__element` and `&--modifier`
  - Integrates with interpolation for complex nested structures

### Changed
- **Default settings**: `scssAliasJump.hoverWorkspaceScan` now defaults to `true` for better out-of-box experience
- **Extended language support**: Added TypeScript, JavaScript, React, and JSX to Definition Provider selector
- **Improved selector parsing**: Enhanced `buildOpenSelectorStack` to skip interpolation braces `#{...}` when finding block opening braces
- **Smarter cursor detection**: CSS Module class extraction now works when clicking anywhere on `styles.className`
- **Major code refactoring** for improved maintainability:
  - Extracted common patterns into reusable utilities (`splitLines`, `stripComments`, `pruneStack`, `formatFileLocation`, etc.)
  - Unified regular expression patterns into constants (`AMP_SELECTOR_RE`, `CLASS_SELECTOR_RE`, `PLACEHOLDER_SELECTOR_RE`)
  - Centralized performance limits (cache TTL, search limits, timeouts)
  - Removed ~150 lines of duplicate code across multiple files
  - Reused existing `buildOpenSelectorStack` for placeholder name inference
  - Consistent file location formatting across all UI elements

### Improved
- Better code organization following DRY (Don't Repeat Yourself) principles
- Consistent text processing and UI formatting across all components
- More maintainable codebase with shared utilities
- Uniform display of file locations in QuickPick, hover tooltips, and error messages
- Enhanced hover provider to support SCSS interpolation in class name inference

### Fixed
- Fixed interpolation brace detection: `#{$aux} {` now correctly parses as `.aux` instead of `#`
- CSS Module usages now include both direct class attributes and CSS Modules patterns (`styles.xxx`)
- Variable parsing now handles malformed values gracefully

## [0.1.16] - 2026-01-19

### Fixed
- **Vue/Svelte file support**: Stable jump-to-definition for `@use`/`@forward`/`@import` in `<style lang="scss">` blocks

### Added
- **Multi-root workspace**: Configuration scoping now respects `resource` (each folder can have different aliases)
- `scssAliasJump.debugLogging` configuration option
- `scssAliasJump.hoverWorkspaceScan` configuration option

### Improved
- **Performance**: Parallel path resolution and lazy DocumentLink resolution to prevent cancellation/timeout in large files
- **Path extraction**: Enhanced `getDocFsPath` to handle Volar/Vue Official virtual documents and embedded content

## [0.0.13] - 2026-01-15

### Added
- Hover + QuickPick to find usages of CSS classes (React/Vue/Svelte) when hovering on `.class` selectors in SCSS

## [0.0.12] - 2026-01-15

### Fixed
- Placeholder jump for camelCase nested placeholders (e.g., `%chatShellMain` from `%chatShell { &Main { ... } }`)

## [0.0.11] - 2026-01-15

### Fixed
- Namespaced Sass variable resolution to bind to the exact token under cursor (prevents `answer.$margin-bottom` / `progress.$margin-bottom` mixups)

## [0.0.10] - 2026-01-15

### Added
- Go-to-definition + hover link for Sass module variables like `answer.$markdown-title-padding-left`

## [0.0.9] - 2026-01-15

### Fixed
- Hover placeholder detection to ignore `%...` tokens in `//` comments and prefer nested `&...` inference

## [0.0.8] - 2026-01-15

### Fixed
- Hover `@extend` usage matching to avoid prefix matches (e.g., `%chat__sources` no longer matches `%chat__sources--overlay`)

## [0.0.7] - 2026-01-15

### Improved
- Hover `@extend` usages now show the enclosing selector/placeholder (container) for each match

## [0.0.6] - 2026-01-15

### Added
- Hover to show `@extend %...` usages (QuickPick + jump to location)

## [0.0.5] - 2026-01-15

### Fixed
- Placeholder nested lookup for merged selectors like `&__input-dock` (e.g., `%chat { &__input-dock { ... } }`)

## [0.0.4] - 2026-01-15

### Added
- Fallback jump for loop/interpolated placeholders (e.g., `%inner-padding-max` → `%inner-padding` or `%inner-padding-#{$k}...`)
- Duplicate-definition handling:
  - Definition provider returns multiple locations so VS Code can show **Peek Definitions**
  - `@extend` link click shows QuickPick when multiple matches exist

## [0.0.3] - 2026-01-15

### Added
- `@extend %...` Cmd/Ctrl+Click jump (direct definition + nested `&` chain support)
- Link-style behavior for `@extend` via `DocumentLinkProvider` (hover underline / pointer + click)
- OutputChannel logs (`SCSS Alias Jump`) for easier debugging

[0.2.0]: https://github.com/ohzls/scss-alias-jump/compare/v0.1.16...v0.2.0
[0.1.16]: https://github.com/ohzls/scss-alias-jump/releases/tag/v0.1.16
