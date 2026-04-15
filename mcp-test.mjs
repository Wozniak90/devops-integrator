/**
 * Rychlý MCP test — volá mcp-server.mjs přes STDIO a testuje všechny tools
 * Spusť: node mcp-test.mjs
 * Předpoklad: devops-integrator server běží na localhost:4242
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER    = join(__dirname, 'mcp-server.mjs');

let msgId = 1;
const pending = new Map();
let buf = '';

const child = spawn('node', [SERVER], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, DEVOPS_INTEGRATOR_URL: 'http://localhost:4242' }
});

child.stderr.on('data', d => process.stdout.write(`\x1b[90m[mcp-server] ${d}\x1b[0m`));

child.stdout.on('data', chunk => {
  buf += chunk.toString();
  const lines = buf.split('\n');
  buf = lines.pop();
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) {
        const { resolve } = pending.get(msg.id);
        pending.delete(msg.id);
        resolve(msg);
      }
    } catch { /* ignore non-JSON */ }
  }
});

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`Timeout: ${method}`));
      }
    }, 5000);
  });
}

function ok(label)   { console.log(`  \x1b[32m✓\x1b[0m ${label}`); }
function fail(label, e) { console.log(`  \x1b[31m✗\x1b[0m ${label}: ${e.message}`); }
function section(title) { console.log(`\n\x1b[1m${title}\x1b[0m`); }

async function callTool(name, args = {}) {
  const res = await send('tools/call', { name, arguments: args });
  if (res.error) throw new Error(res.error.message || JSON.stringify(res.error));
  const text = res.result?.content?.[0]?.text || '';
  return text;
}

async function run() {
  console.log('\n🔍 DevOps Integrator MCP Test\n' + '─'.repeat(40));

  // 1. Handshake
  section('1. Protocol handshake');
  try {
    const init = await send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'mcp-test', version: '1.0' }
    });
    ok(`initialize OK (protocol: ${init.result?.protocolVersion || '?'})`);
    await send('notifications/initialized');
  } catch (e) { fail('initialize', e); process.exit(1); }

  // 2. List tools
  section('2. Tool discovery');
  let tools = [];
  try {
    const res = await send('tools/list');
    tools = res.result?.tools || [];
    ok(`${tools.length} tools registered`);
    tools.forEach(t => console.log(`     • ${t.name}`));
  } catch (e) { fail('tools/list', e); }

  // 3. Test individual tools
  section('3. Tool calls');

  const tests = [
    { name: 'get_workload_summary',    args: {} },
    { name: 'get_assigned_tasks',      args: { max_results: 5 } },
    { name: 'get_stale_tasks',         args: { min_days: 7 } },
    { name: 'get_high_priority_tasks', args: { top_n: 5 } },
    { name: 'generate_standup',        args: { format: 'markdown', language: 'cs' } },
    { name: 'get_task_notes',          args: {} },
    { name: 'get_following_tasks',     args: {} },
    { name: 'search_tasks',            args: { query: 'test' } },
  ];

  for (const { name, args } of tests) {
    try {
      const text = await callTool(name, args);
      const preview = text.split('\n')[0].slice(0, 70);
      ok(`${name}\n     └─ ${preview}`);
    } catch (e) {
      // ECONNREFUSED = devops server not running (expected in offline test)
      if (e.message.includes('spuštěn') || e.message.includes('ECONNREFUSED')) {
        console.log(`  \x1b[33m⚠\x1b[0m ${name}: DevOps server offline (očekáváno)`);
      } else {
        fail(name, e);
      }
    }
  }

  console.log('\n' + '─'.repeat(40));
  console.log('✅ MCP server test dokončen\n');
  child.kill();
  process.exit(0);
}

run().catch(e => { console.error(e); child.kill(); process.exit(1); });
