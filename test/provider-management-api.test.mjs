import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const DATA_DIR = path.join(REPO_ROOT, 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'devops-config.json');
const AUDIT_PATH = path.join(DATA_DIR, 'provider-audit.log');

function snapshotFile(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : null;
}

function restoreFile(filePath, content) {
  if (content === null) {
    rmSync(filePath, { force: true });
    return;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

function restoreData(snapshot) {
  restoreFile(CONFIG_PATH, snapshot.config);
  restoreFile(AUDIT_PATH, snapshot.audit);
}

function resetDataFiles() {
  rmSync(CONFIG_PATH, { force: true });
  rmSync(AUDIT_PATH, { force: true });
}

function readConfig() {
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
}

function readAuditEvents() {
  if (!existsSync(AUDIT_PATH)) return [];
  return readFileSync(AUDIT_PATH, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

async function requestJson(baseUrl, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, options);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  return { status: response.status, body: payload };
}

async function waitForServer(baseUrl, child, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`server exited before startup (code ${child.exitCode})`);
    }
    try {
      const { status } = await requestJson(baseUrl, '/api/setup/status');
      if (status === 200) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('server did not start in time');
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  await new Promise(resolve => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }, 1000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

async function withServer(testFn) {
  const port = 4400 + Math.floor(Math.random() * 1000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: REPO_ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  try {
    await waitForServer(baseUrl, child);
    await testFn(baseUrl);
  } finally {
    await stopServer(child);
  }
}

function createSnapshot() {
  return {
    config: snapshotFile(CONFIG_PATH),
    audit: snapshotFile(AUDIT_PATH),
  };
}

test('provider management API handles list/create/read/update/delete with audit events', async () => {
  const snapshot = createSnapshot();
  try {
    resetDataFiles();

    await withServer(async baseUrl => {
      const list = await requestJson(baseUrl, '/api/providers');
      assert.equal(list.status, 200);
      assert.equal(list.body.ok, true);
      assert.ok(Array.isArray(list.body.providers));
      assert.ok(list.body.providers.some(p => p.id === 'jira'));

      const create = await requestJson(baseUrl, '/api/providers/jira/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: 'https://jira.example.com',
          email: 'user@example.com',
          apiToken: 'tok-initial',
          projects: ['APP'],
          enabled: true,
        }),
      });
      assert.equal(create.status, 200);
      assert.equal(create.body.ok, true);

      const afterCreateConfig = readConfig();
      assert.equal(afterCreateConfig.jira.apiToken, 'tok-initial');
      assert.equal(afterCreateConfig.providers.jira.apiToken, 'tok-initial');

      const readGeneric = await requestJson(baseUrl, '/api/providers/jira/config');
      assert.equal(readGeneric.status, 200);
      assert.equal(readGeneric.body.configured, true);
      assert.equal(readGeneric.body.config.apiToken, '***');

      const patch = await requestJson(baseUrl, '/api/providers/jira/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: 'https://jira-updated.example.com',
          keepToken: true,
          projects: ['APP', 'INT'],
        }),
      });
      assert.equal(patch.status, 200);
      assert.equal(patch.body.ok, true);

      const afterPatchConfig = readConfig();
      assert.equal(afterPatchConfig.jira.host, 'https://jira-updated.example.com');
      assert.equal(afterPatchConfig.jira.apiToken, 'tok-initial');
      assert.deepEqual(afterPatchConfig.jira.projects, ['APP', 'INT']);

      const legacySave = await requestJson(baseUrl, '/api/jira/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: 'https://jira-updated.example.com',
          email: 'user@example.com',
          keepToken: true,
          projects: ['INT'],
          enabled: true,
        }),
      });
      assert.equal(legacySave.status, 200);
      assert.equal(legacySave.body.ok, true);

      const legacyConfig = await requestJson(baseUrl, '/api/jira/config');
      assert.equal(legacyConfig.status, 200);
      assert.equal(legacyConfig.body.configured, true);
      assert.equal(legacyConfig.body.apiToken, '***');

      const afterLegacySaveConfig = readConfig();
      assert.equal(afterLegacySaveConfig.jira.apiToken, 'tok-initial');
      assert.deepEqual(afterLegacySaveConfig.jira.projects, ['INT']);

      const remove = await requestJson(baseUrl, '/api/providers/jira/config', {
        method: 'DELETE',
      });
      assert.equal(remove.status, 200);
      assert.equal(remove.body.ok, true);

      const readAfterDelete = await requestJson(baseUrl, '/api/providers/jira/config');
      assert.equal(readAfterDelete.status, 200);
      assert.equal(readAfterDelete.body.configured, false);
    });

    const events = readAuditEvents();
    const eventNames = events.map(event => event.event);
    assert.ok(eventNames.includes('provider.config.create'));
    assert.ok(eventNames.includes('provider.config.update'));
    assert.ok(eventNames.includes('provider.config.delete'));
  } finally {
    restoreData(snapshot);
  }
});

test('provider management test endpoint returns 400 for invalid Jira payload and 404 for unknown provider', async () => {
  const snapshot = createSnapshot();
  try {
    resetDataFiles();

    await withServer(async baseUrl => {
      const invalid = await requestJson(baseUrl, '/api/providers/jira/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: '', email: '', apiToken: '' }),
      });
      assert.equal(invalid.status, 400);
      assert.equal(invalid.body.code, 'INVALID_PROVIDER_CONFIG');
      assert.match(invalid.body.error, /required/i);

      const unknown = await requestJson(baseUrl, '/api/providers/not-real/config');
      assert.equal(unknown.status, 404);
      assert.equal(unknown.body.code, 'PROVIDER_NOT_FOUND');
    });
  } finally {
    restoreData(snapshot);
  }
});

test('provider management test endpoint maps Jira auth failure to 401', async () => {
  const snapshot = createSnapshot();
  const fakeJira = createServer((req, res) => {
    if (req.url?.startsWith('/rest/api/3/myself')) {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    res.statusCode = 404;
    res.end();
  });

  try {
    resetDataFiles();

    await new Promise(resolve => fakeJira.listen(0, '127.0.0.1', resolve));
    const address = fakeJira.address();
    assert.equal(typeof address, 'object');
    const fakeHost = `http://127.0.0.1:${address.port}`;

    await withServer(async baseUrl => {
      const result = await requestJson(baseUrl, '/api/providers/jira/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: fakeHost,
          email: 'user@example.com',
          apiToken: 'tok',
        }),
      });

      assert.equal(result.status, 401);
      assert.equal(result.body.code, 'PROVIDER_AUTH_FAILED');
      assert.match(result.body.error, /Ověření selhalo/);
    });
  } finally {
    await new Promise(resolve => fakeJira.close(resolve));
    restoreData(snapshot);
  }
});
