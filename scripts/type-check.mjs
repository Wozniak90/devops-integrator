#!/usr/bin/env node

import { execSync, spawnSync } from 'node:child_process';
import path from 'node:path';

const JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

function getTrackedFiles() {
  const output = execSync('git ls-files', { encoding: 'utf8' });
  return output.split('\n').filter(Boolean);
}

function getSourceFiles(files) {
  return files.filter(filePath => JS_EXTENSIONS.has(path.extname(filePath)));
}

function checkFile(filePath) {
  return spawnSync(process.execPath, ['--check', filePath], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

const files = getSourceFiles(getTrackedFiles());
const failures = [];

for (const filePath of files) {
  const result = checkFile(filePath);
  if (result.status !== 0) {
    failures.push({
      filePath,
      stderr: (result.stderr || '').trim(),
      stdout: (result.stdout || '').trim(),
    });
  }
}

if (failures.length > 0) {
  console.error(`Type check failed for ${failures.length} file(s):`);
  for (const failure of failures) {
    console.error(`\n- ${failure.filePath}`);
    const details = failure.stderr || failure.stdout || '(no details)';
    console.error(details);
  }
  process.exit(1);
}

console.log(`Type check passed (${files.length} file(s) checked).`);
