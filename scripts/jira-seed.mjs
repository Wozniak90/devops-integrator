#!/usr/bin/env node
/**
 * jira-seed.mjs — Naplní testovací Jira instanci realistickými daty
 *
 * Použití:
 *   node scripts/jira-seed.mjs --host https://xxx.atlassian.net --email user@x.com --token ATAT...
 *
 * Co vytvoří:
 *   • 2 projekty: "Demo App" (APP) a "Internal Tools" (INT)
 *   • ~25 issues různých typů, priorit a stavů
 *   • Komentáře, labely, story points
 */

import https from 'https';
import http  from 'http';
import { parseArgs } from 'util';

// ── CLI args ───────────────────────────────────────────────────────────────
const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    host:  { type: 'string' },
    email: { type: 'string' },
    token: { type: 'string' },
    dry:   { type: 'boolean', default: false },
  }
});

const HOST  = args.host?.replace(/\/$/, '');
const EMAIL = args.email;
const TOKEN = args.token;

if (!HOST || !EMAIL || !TOKEN) {
  console.error('❌  Použití: node scripts/jira-seed.mjs --host https://xxx.atlassian.net --email mail --token ATAT...');
  process.exit(1);
}

const AUTH = 'Basic ' + Buffer.from(`${EMAIL}:${TOKEN}`).toString('base64');

// ── HTTP helper ────────────────────────────────────────────────────────────
function apiCall(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url  = new URL(HOST + path);
    const lib  = url.protocol === 'https:' ? https : http;
    const data = body ? JSON.stringify(body) : null;
    const req  = lib.request({
      hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search, method,
      headers: {
        'Authorization': AUTH,
        'Content-Type': 'application/json',
        'Accept':        'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function post(path, body) {
  if (args.dry) { console.log('[DRY]', method, path); return { body: {} }; }
  const r = await apiCall('POST', path, body);
  if (r.status >= 400) {
    console.warn(`⚠️  POST ${path} → ${r.status}`, JSON.stringify(r.body).slice(0, 200));
  }
  return r;
}

async function get(path) {
  return apiCall('GET', path);
}

// ── Helpers ────────────────────────────────────────────────────────────────
function log(msg) { console.log(msg); }

async function getAccountId() {
  const r = await get('/rest/api/3/myself');
  if (r.status !== 200) throw new Error('Nepodařilo se ověřit uživatele: ' + r.status);
  log(`👤  Přihlášen jako: ${r.body.displayName} (${r.body.accountId})`);
  return r.body.accountId;
}

async function createProject(key, name, accountId) {
  log(`\n📁  Vytvářím projekt: ${name} (${key})`);
  const r = await post('/rest/api/3/project', {
    key,
    name,
    projectTypeKey:       'software',
    projectTemplateKey:   'com.pyxis.greenhopper.jira:gh-scrum-template',
    leadAccountId:        accountId,
    description:          `Testovací projekt vytvořený seed skriptem – ${new Date().toLocaleDateString('cs')}`,
    assigneeType:         'PROJECT_LEAD',
  });
  if (r.body?.id) {
    log(`   ✅  Projekt ${key} vytvořen (id ${r.body.id})`);
    return r.body;
  }
  // Project may already exist
  log(`   ℹ️  Projekt ${key} pravděpodobně existuje, hledám...`);
  const search = await get(`/rest/api/3/project/${key}`);
  if (search.body?.id) return search.body;
  throw new Error(`Projekt ${key} nelze vytvořit ani najít`);
}

async function createIssue(projectKey, fields) {
  const r = await post('/rest/api/3/issue', {
    fields: {
      project:     { key: projectKey },
      issuetype:   { name: fields.type    || 'Task' },
      summary:     fields.summary,
      description: fields.description ? {
        type: 'doc', version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: fields.description }] }]
      } : undefined,
      priority:    fields.priority ? { name: fields.priority } : undefined,
      labels:      fields.labels || [],
      assignee:    fields.assignee ? { accountId: fields.assignee } : undefined,
    }
  });
  const key = r.body?.key;
  if (key) {
    log(`   ✅  ${key}: ${fields.summary}`);
  } else {
    log(`   ⚠️  Issue not created: ${JSON.stringify(r.body).slice(0,120)}`);
  }
  return key;
}

async function addComment(issueKey, text) {
  await post(`/rest/api/3/issue/${issueKey}/comment`, {
    body: {
      type: 'doc', version: 1,
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
    }
  });
}

async function transitionIssue(issueKey, statusName) {
  const r = await get(`/rest/api/3/issue/${issueKey}/transitions`);
  const transition = r.body?.transitions?.find(t =>
    t.name.toLowerCase().includes(statusName.toLowerCase()) ||
    t.to?.name.toLowerCase().includes(statusName.toLowerCase())
  );
  if (!transition) {
    log(`   ℹ️  Přechod "${statusName}" u ${issueKey} nenalezen (dostupné: ${r.body?.transitions?.map(t=>t.name).join(', ')})`);
    return;
  }
  await post(`/rest/api/3/issue/${issueKey}/transitions`, { transition: { id: transition.id } });
  log(`   🔀  ${issueKey} → ${transition.to?.name}`);
}

// ── Seed data ──────────────────────────────────────────────────────────────
const APP_ISSUES = [
  // Bugs
  { type: 'Bug',   priority: 'Highest', summary: 'Login page crashes on mobile Safari',           description: 'Reprodukce: iOS 17, Safari 17.2 — blank screen po odeslání formuláře.', labels: ['mobile','auth'] },
  { type: 'Bug',   priority: 'High',    summary: 'API timeout under heavy load (>500 rps)',        description: 'P99 latence překročí 5s při load testu. Timeouty v DB connection pool.', labels: ['backend','performance'] },
  { type: 'Bug',   priority: 'Medium',  summary: 'Dark mode toggle resets on page refresh',       description: 'Preference není persistována do localStorage.', labels: ['ui'] },
  { type: 'Bug',   priority: 'Low',     summary: 'Tooltip z-index overlaps navigation menu',      description: 'Minor visual glitch on dashboard page.', labels: ['ui'] },
  // Stories
  { type: 'Story', priority: 'High',    summary: 'User can filter tasks by assignee',             description: 'Jako uživatel chci filtrovat úkoly podle přiřazené osoby.', labels: ['filter','ux'] },
  { type: 'Story', priority: 'High',    summary: 'Implement dark mode preference persistence',    description: 'Uložit UI preference do user settings.', labels: ['ui','settings'] },
  { type: 'Story', priority: 'Medium',  summary: 'Add CSV export for task list',                  description: 'Export viditelných tasků do .csv souboru.', labels: ['export'] },
  { type: 'Story', priority: 'Medium',  summary: 'Email notifications on task assignment',        description: 'Notifikace při přiřazení nebo změně stavu.', labels: ['notifications'] },
  { type: 'Story', priority: 'Low',     summary: 'Onboarding wizard for new users',               description: 'Guided tour po první registraci.', labels: ['onboarding'] },
  // Tasks
  { type: 'Task',  priority: 'Medium',  summary: 'Upgrade Node.js to v22 LTS',                   description: 'Aktualizovat runtime a závislosti.', labels: ['infra'] },
  { type: 'Task',  priority: 'Medium',  summary: 'Write unit tests for auth module',              description: 'Pokrytí alespoň 80 % větví.', labels: ['testing'] },
  { type: 'Task',  priority: 'Low',     summary: 'Update README with local dev setup',            description: 'Zdokumentovat kroky pro onboarding nového vývojáře.', labels: ['docs'] },
  // Epics
  { type: 'Epic',  priority: 'High',    summary: 'Q2 Performance Initiative',                     description: 'Cíl: snížit P99 na <200ms na klíčových endpointech.', labels: ['performance','q2'] },
  { type: 'Epic',  priority: 'Medium',  summary: 'Mobile App v2.0',                              description: 'Redesign mobilního klienta + offline mode.', labels: ['mobile'] },
];

const INT_ISSUES = [
  { type: 'Task',  priority: 'High',    summary: 'Set up CI/CD pipeline for internal tools',     description: 'GitHub Actions workflow pro build, test, deploy.', labels: ['devops','ci'] },
  { type: 'Task',  priority: 'High',    summary: 'Migrate internal wiki to Confluence',           description: 'Přesun z Notion do Confluence Cloud.', labels: ['docs','migration'] },
  { type: 'Bug',   priority: 'Medium',  summary: 'Internal dashboard 500 on Mondays (cron)',     description: 'Weekly report cron job havaruje při prázdné DB.', labels: ['backend','cron'] },
  { type: 'Story', priority: 'High',    summary: 'SSO integration with corporate IdP',           description: 'SAML 2.0 přes Okta.', labels: ['auth','sso'] },
  { type: 'Story', priority: 'Medium',  summary: 'Slack bot for daily standups',                 description: 'Bot posílá daily summary do #standup kanálu.', labels: ['slack','automation'] },
  { type: 'Task',  priority: 'Low',     summary: 'Archive completed 2024 projects',              description: 'Archivace uzavřených projektů pro přehlednost.', labels: ['admin'] },
  { type: 'Task',  priority: 'Medium',  summary: 'Evaluate monitoring tools (Datadog vs Grafana)',description: 'Porovnat náklady a features, navrhnout řešení.', labels: ['monitoring','research'] },
  { type: 'Bug',   priority: 'Low',     summary: 'Employee directory shows deactivated accounts', description: 'Filtr active=true chybí v LDAP query.', labels: ['hr','ldap'] },
  { type: 'Epic',  priority: 'High',    summary: 'Internal Developer Platform',                   description: 'Platforma pro self-service CI/CD, secrets, monitoring.', labels: ['devops','platform'] },
  { type: 'Story', priority: 'Low',     summary: 'Document security incident response process',  description: 'Runbook pro bezpečnostní incidenty.', labels: ['security','docs'] },
  { type: 'Task',  priority: 'High',    summary: 'Rotate all production secrets (quarterly)',    description: 'Pravidelná rotace DB hesel, API klíčů, certifikátů.', labels: ['security'] },
];

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  log('🚀  Jira Seed Script — DevOps Integrator');
  log(`   Host:  ${HOST}`);
  log(`   Email: ${EMAIL}`);
  log('');

  const accountId = await getAccountId();

  // ── Projects ──
  const appProj = await createProject('APP', 'Demo App', accountId);
  const intProj = await createProject('INT', 'Internal Tools', accountId);

  // ── Issues ──
  log('\n📝  Vytvářím issues — Demo App (APP)');
  const appKeys = [];
  for (const issue of APP_ISSUES) {
    const key = await createIssue('APP', { ...issue, assignee: accountId });
    if (key) appKeys.push({ key, ...issue });
  }

  log('\n📝  Vytvářím issues — Internal Tools (INT)');
  const intKeys = [];
  for (const issue of INT_ISSUES) {
    const key = await createIssue('INT', { ...issue, assignee: accountId });
    if (key) intKeys.push({ key, ...issue });
  }

  // ── Transitions (realistické stavy) ──
  log('\n🔀  Nastavuji stavy...');
  const allKeys = [...appKeys, ...intKeys];

  // First 4 → In Progress
  for (const it of allKeys.slice(0, 4)) {
    await transitionIssue(it.key, 'progress');
  }
  // Next 4 → Done
  for (const it of allKeys.slice(4, 8)) {
    await transitionIssue(it.key, 'done');
  }

  // ── Comments ──
  log('\n💬  Přidávám komentáře...');
  const commentPairs = [
    [appKeys[0]?.key,  'Reprodukuji konzistentně na iPhone 14 Pro. Video přiloženo k ticketu.'],
    [appKeys[1]?.key,  'DB pool exhaustion potvrzen — zvýšíme pool size z 10 → 50 a přidáme circuit breaker.'],
    [appKeys[4]?.key,  'Mockup hotový, čeká na review od UX teamu.'],
    [intKeys[0]?.key,  'Pipeline funguje pro `main` branch, PR check zatím pending.'],
    [intKeys[3]?.key,  'Okta tenant vytvořen, SAML metadata exportována.'],
  ];
  for (const [key, text] of commentPairs) {
    if (!key) continue;
    await addComment(key, text);
    log(`   💬  ${key}`);
  }

  // ── Summary ──
  log('\n✅  Seed dokončen!');
  log(`   APP (Demo App):       ${appKeys.length} issues`);
  log(`   INT (Internal Tools): ${intKeys.length} issues`);
  log('');
  log('📋  Jak připojit v DevOps Integratoru:');
  log(`   Host:     ${HOST}`);
  log(`   Email:    ${EMAIL}`);
  log(`   Projekty: APP, INT`);
  log('   → Klikni 🟦 Jira v hlavičce apky → vyplň údaje → Uložit');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
