import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');

function run(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: 'utf8' });
}

function runNode(scriptPath, args, cwd) {
  return run(process.execPath, [scriptPath, ...args], cwd);
}

function runGit(args, cwd) {
  const result = run('git', args, cwd);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout || 'unknown error'}`);
  }
}

function createTempDir(prefix) {
  return mkdtempSync(path.join(tmpdir(), `${prefix}-`));
}

function createFixtureRepo(prefix) {
  const dir = createTempDir(prefix);
  runGit(['init', '-q'], dir);
  return dir;
}

function writeFixtureFile(repoDir, relativePath, content) {
  const target = path.join(repoDir, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf8');
}

function copyScript(repoDir, scriptRelativePath) {
  const source = path.join(REPO_ROOT, scriptRelativePath);
  const target = path.join(repoDir, scriptRelativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(source, target);
}

function stageAll(repoDir) {
  runGit(['add', '-A'], repoDir);
}

function conflictFixtureContent() {
  return [
    `${'<'.repeat(7)} HEAD`,
    'left side',
    '='.repeat(7),
    'right side',
    `${'>'.repeat(7)} branch`,
    '',
  ].join('\n');
}

test('format script rejects missing mode', () => {
  const cwd = createTempDir('format-mode');
  try {
    copyScript(cwd, 'scripts/format.mjs');

    const result = runNode('scripts/format.mjs', [], cwd);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Use exactly one mode: --check or --write/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('format --check fails when tracked file needs normalization', () => {
  const cwd = createFixtureRepo('format-check');
  try {
    copyScript(cwd, 'scripts/format.mjs');
    writeFixtureFile(cwd, 'docs/example.md', 'First line  \r\nSecond line\t');
    stageAll(cwd);

    const before = readFileSync(path.join(cwd, 'docs/example.md'), 'utf8');
    const result = runNode('scripts/format.mjs', ['--check'], cwd);
    const after = readFileSync(path.join(cwd, 'docs/example.md'), 'utf8');

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Format check failed for file\(s\):/);
    assert.match(result.stderr, /- docs\/example\.md/);
    assert.equal(after, before);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('format --write normalizes content and check then passes', () => {
  const cwd = createFixtureRepo('format-write');
  try {
    copyScript(cwd, 'scripts/format.mjs');
    writeFixtureFile(cwd, 'docs/example.md', 'First line  \r\nSecond line\t');
    stageAll(cwd);

    const writeResult = runNode('scripts/format.mjs', ['--write'], cwd);
    assert.equal(writeResult.status, 0);
    assert.match(writeResult.stdout, /Formatted 1 file\(s\)\./);

    const normalized = readFileSync(path.join(cwd, 'docs/example.md'), 'utf8');
    assert.equal(normalized, 'First line\nSecond line\n');

    const checkResult = runNode('scripts/format.mjs', ['--check'], cwd);
    assert.equal(checkResult.status, 0);
    assert.match(checkResult.stdout, /Format check passed/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('lint fails when conflict markers are present', () => {
  const cwd = createFixtureRepo('lint-conflict');
  try {
    copyScript(cwd, 'scripts/lint.mjs');
    copyScript(cwd, 'scripts/type-check.mjs');
    writeFixtureFile(cwd, 'notes.md', conflictFixtureContent());
    stageAll(cwd);

    const before = readFileSync(path.join(cwd, 'notes.md'), 'utf8');
    const result = runNode('scripts/lint.mjs', [], cwd);
    const after = readFileSync(path.join(cwd, 'notes.md'), 'utf8');

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Lint failed: conflict markers found in 1 file\(s\)\./);
    assert.match(result.stderr, /- notes\.md/);
    assert.equal(after, before);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('lint --fix refuses to auto-resolve merge conflicts', () => {
  const cwd = createFixtureRepo('lint-fix-conflict');
  try {
    copyScript(cwd, 'scripts/lint.mjs');
    copyScript(cwd, 'scripts/type-check.mjs');
    writeFixtureFile(cwd, 'notes.md', conflictFixtureContent());
    stageAll(cwd);

    const before = readFileSync(path.join(cwd, 'notes.md'), 'utf8');
    const result = runNode('scripts/lint.mjs', ['--fix'], cwd);
    const after = readFileSync(path.join(cwd, 'notes.md'), 'utf8');

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Conflict markers were not auto-fixed\. Resolve merge conflicts manually\./);
    assert.match(result.stderr, /- notes\.md/);
    assert.equal(after, before);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('lint reports type-check exit status when syntax check fails', () => {
  const cwd = createFixtureRepo('lint-typecheck');
  try {
    copyScript(cwd, 'scripts/lint.mjs');
    copyScript(cwd, 'scripts/type-check.mjs');
    writeFixtureFile(cwd, 'broken.js', 'const broken = ;\n');
    stageAll(cwd);

    const result = runNode('scripts/lint.mjs', [], cwd);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Type check failed for 1 file\(s\):/);
    assert.match(result.stderr, /- broken\.js/);
    assert.match(result.stderr, /Lint failed: type-check exited with status 1/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
