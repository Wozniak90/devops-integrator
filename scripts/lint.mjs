#!/usr/bin/env node

import { execSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';

const args = new Set(process.argv.slice(2));
const shouldFix = args.has('--fix');

const TEXT_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.html',
  '.css',
  '.yml',
  '.yaml',
  '.sh',
]);

function getTrackedFiles() {
  const output = execSync('git ls-files', { encoding: 'utf8' });
  return output.split('\n').filter(Boolean);
}

function getTextFiles(files) {
  return files.filter(filePath => TEXT_EXTENSIONS.has(path.extname(filePath)));
}

function runTypeCheck() {
  const result = spawnSync(process.execPath, ['scripts/type-check.mjs'], {
    encoding: 'utf8',
    stdio: 'inherit',
  });
  return result.status === 0;
}

function stripConflictMarkers(content) {
  return content
    .replace(/^<<<<<<<[^\n]*\n/gm, '')
    .replace(/^=======$\n/gm, '')
    .replace(/^>>>>>>>[^\n]*\n/gm, '');
}

const files = getTextFiles(getTrackedFiles());
const conflictRegex = /^(<<<<<<<|=======|>>>>>>>)/m;
const conflictIssues = [];

for (const filePath of files) {
  const original = readFileSync(filePath, 'utf8');
  if (!conflictRegex.test(original)) continue;

  if (shouldFix) {
    const updated = stripConflictMarkers(original);
    writeFileSync(filePath, updated, 'utf8');
    if (conflictRegex.test(updated)) {
      conflictIssues.push(filePath);
    }
    continue;
  }

  conflictIssues.push(filePath);
}

const typeCheckOk = runTypeCheck();

if (conflictIssues.length > 0) {
  console.error(`Lint failed: conflict markers found in ${conflictIssues.length} file(s).`);
  for (const filePath of conflictIssues) {
    console.error(`- ${filePath}`);
  }
  process.exit(1);
}

if (!typeCheckOk) {
  process.exit(1);
}

console.log(`Lint passed (${files.length} file(s) checked).`);
