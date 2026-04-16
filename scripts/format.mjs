#!/usr/bin/env node

import { execSync } from 'node:child_process';
import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';

const args = new Set(process.argv.slice(2));
const checkMode = args.has('--check');
const writeMode = args.has('--write');

if (checkMode === writeMode) {
  console.error('Use exactly one mode: --check or --write');
  process.exit(1);
}

const FORMAT_EXTENSIONS = new Set([
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

function getFormatFiles(files) {
  return files.filter(filePath => FORMAT_EXTENSIONS.has(path.extname(filePath)));
}

function normalizeContent(content) {
  const normalizedEol = content.replace(/\r\n/g, '\n');
  const trimmedLines = normalizedEol
    .split('\n')
    .map(line => line.replace(/[ \t]+$/g, ''))
    .join('\n');
  return trimmedLines.endsWith('\n') ? trimmedLines : `${trimmedLines}\n`;
}

const files = getFormatFiles(getTrackedFiles());
const changed = [];

for (const filePath of files) {
  const original = readFileSync(filePath, 'utf8');
  const normalized = normalizeContent(original);
  if (normalized === original) continue;

  changed.push(filePath);
  if (writeMode) {
    writeFileSync(filePath, normalized, 'utf8');
  }
}

if (changed.length === 0) {
  console.log(`Format ${checkMode ? 'check' : 'write'} passed (${files.length} file(s) scanned).`);
  process.exit(0);
}

if (checkMode) {
  console.error('Format check failed for file(s):');
  for (const filePath of changed) {
    console.error(`- ${filePath}`);
  }
  process.exit(1);
}

console.log(`Formatted ${changed.length} file(s).`);
