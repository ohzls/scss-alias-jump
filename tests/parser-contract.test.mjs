import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Module = require('node:module');
const originalLoad = Module._load;

Module._load = function load(request, parent, isMain) {
  if (request === 'vscode') return {};
  return originalLoad.call(this, request, parent, isMain);
};

const {
  getClassNameUnderCursor,
  getCssModuleClassUnderCursor,
  getImportPathUnderCursorOnLine,
} = require('../dist/cursorTokens.js');
const { inferCssClassNameAtLine } = require('../dist/cssInference.js');
const { parseScssVariables } = require('../dist/scssVariables.js');
const { splitLines } = require('../dist/strings.js');

function documentForLine(line) {
  return {
    lineAt: () => ({ text: line }),
    getText: (range) => line.slice(range.start.character, range.end.character),
    getWordRangeAtPosition: () => null,
  };
}

function positionAt(line, token, offset = 0) {
  return { line: 0, character: line.indexOf(token) + offset };
}

describe('Sass import cursor parsing', () => {
  it('returns an import path when the cursor is on a real @use path', () => {
    const line = "@use '@scss/_base/__reset' as *;";
    assert.deepEqual(
      getImportPathUnderCursorOnLine(line, line.indexOf('__reset')),
      { importPath: '@scss/_base/__reset', startIdx: 6, endIdx: 25 }
    );
  });

  it('ignores @use paths that appear after a line comment marker', () => {
    const line = "// @use '@scss/_base/__reset' as *;";
    assert.equal(getImportPathUnderCursorOnLine(line, line.indexOf('__reset')), null);
  });

  it('ignores @import paths when a preceding inline comment marker comments them out', () => {
    const line = "  color: red; // @import '@/ghost';";
    assert.equal(getImportPathUnderCursorOnLine(line, line.indexOf('ghost')), null);
  });
});

describe('CSS Modules cursor parsing', () => {
  it('parses arbitrary imported namespace dot access', () => {
    const line = 'const className = layout.pageInner';
    assert.deepEqual(
      getCssModuleClassUnderCursor(documentForLine(line), positionAt(line, 'pageInner', 2), ['layout']),
      { className: 'pageInner', importVar: 'layout' }
    );
  });

  it('parses bracket access for dashed CSS Module class names', () => {
    const line = 'const className = styles["file-item"]';
    assert.deepEqual(
      getCssModuleClassUnderCursor(documentForLine(line), positionAt(line, 'file-item', 2), ['styles']),
      { className: 'file-item', importVar: 'styles' }
    );
  });

  it('does not parse bracket access from a non-imported namespace', () => {
    const line = 'const className = other["file-item"]';
    assert.equal(
      getCssModuleClassUnderCursor(documentForLine(line), positionAt(line, 'file-item', 2), ['styles']),
      null
    );
  });
});

describe('SCSS and template class inference contracts', () => {
  it('infers nested interpolation class names', () => {
    const source = `$aux: '.aux';\n#{$aux} {\n  &Menu {\n    color: red;\n  }\n}`;
    const lines = splitLines(source);
    const variables = parseScssVariables(source);
    assert.equal(inferCssClassNameAtLine(lines, 2, variables), 'auxMenu');
  });

  it('extracts the exact class under cursor from multi-class template attributes', () => {
    const line = '<div class="foo bar baz">';
    assert.equal(getClassNameUnderCursor(line, line.indexOf('bar') + 1), 'bar');
  });

  it('extracts Vue bound class object keys only when the cursor is on the key', () => {
    const line = `<div :class="{ active: isActive, 'is-open': open }">`;

    assert.equal(getClassNameUnderCursor(line, line.indexOf('active') + 1), 'active');
    assert.equal(getClassNameUnderCursor(line, line.indexOf('is-open') + 2), 'is-open');
    assert.equal(getClassNameUnderCursor(line, line.indexOf('isActive') + 1), null);
  });

  it('extracts string literal classes from Vue bound class arrays', () => {
    const line = `<div :class="['foo', condition && 'bar-baz']">`;

    assert.equal(getClassNameUnderCursor(line, line.indexOf('foo') + 1), 'foo');
    assert.equal(getClassNameUnderCursor(line, line.indexOf('bar-baz') + 2), 'bar-baz');
    assert.equal(getClassNameUnderCursor(line, line.indexOf('condition') + 2), null);
  });

  it('extracts string literal classes from Vue bound class ternaries', () => {
    const line = `<div :class="isActive ? 'enabled' : 'disabled'">`;

    assert.equal(getClassNameUnderCursor(line, line.indexOf('enabled') + 2), 'enabled');
    assert.equal(getClassNameUnderCursor(line, line.indexOf('disabled') + 2), 'disabled');
  });

  it('does not treat computed Vue class variables as literal class names', () => {
    const line = '<div :class="computedClass">';

    assert.equal(getClassNameUnderCursor(line, line.indexOf('computedClass') + 2), null);
  });

  it('does not treat strings used only inside Vue bound class conditions as classes', () => {
    const line = `<div :class="{ active: state === 'enabled' }">`;

    assert.equal(getClassNameUnderCursor(line, line.indexOf('enabled') + 2), null);
  });
});
