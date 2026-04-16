#!/usr/bin/env node

import { execSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { readFileSync } from 'node:fs';

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

  if (result.error) {
    return { ok: false, reason: `type-check spawn error: ${result.error.message}` };
  }

  if (result.signal) {
    return { ok: false, reason: `type-check terminated by signal: ${result.signal}` };
  }

  if (result.status !== 0) {
    return { ok: false, reason: `type-check exited with status ${result.status}` };
  }

  return { ok: true, reason: null };
}

const files = getTextFiles(getTrackedFiles());
const conflictRegex = /^(<<<<<<<|=======|>>>>>>>)/m;
const conflictIssues = [];

for (const filePath of files) {
  const original = readFileSync(filePath, 'utf8');
  if (!conflictRegex.test(original)) continue;

  conflictIssues.push(filePath);
}

const typeCheck = runTypeCheck();

if (conflictIssues.length > 0) {
  console.error(`Lint failed: conflict markers found in ${conflictIssues.length} file(s).`);
  if (shouldFix) {
    console.error('Conflict markers were not auto-fixed. Resolve merge conflicts manually.');
  }
  for (const filePath of conflictIssues) {
    console.error(`- ${filePath}`);
  }
  process.exit(1);
}

if (!typeCheck.ok) {
  console.error(`Lint failed: ${typeCheck.reason}`);
  process.exit(1);
}

console.log(`Lint passed (${files.length} file(s) checked).`);
