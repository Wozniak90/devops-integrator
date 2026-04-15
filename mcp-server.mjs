/**
 * DevOps Integrator — Standalone MCP Server
 *
 * Exposes 12 MCP tools that proxy to the DevOps Integrator HTTP API
 * running at http://localhost:4242 (or DEVOPS_INTEGRATOR_URL env var).
 *
 * Usage: node mcp-server.mjs
 * Or via Claude Desktop config:
 *   "command": "node", "args": ["/path/to/mcp-server.mjs"]
 */

import { McpServer }    from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z }            from 'zod';

const BASE = process.env.DEVOPS_INTEGRATOR_URL || 'http://localhost:4242';

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function callAPI(apiPath) {
  try {
    const res = await fetch(`${BASE}${apiPath}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${apiPath}`);
    return res.json();
  } catch (e) {
    if (e.cause?.code === 'ECONNREFUSED' || e.message?.includes('ECONNREFUSED')) {
      throw new Error(
        `DevOps Integrator není spuštěn.\n` +
        `Spusť ho příkazem: npm start  (ve složce devops-integrator)\n` +
        `Nebo nastav DEVOPS_INTEGRATOR_URL na správnou adresu.`
      );
    }
    throw e;
  }
}

async function postAPI(apiPath, body) {
  try {
    const res = await fetch(`${BASE}${apiPath}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${apiPath}`);
    return res.json();
  } catch (e) {
    if (e.cause?.code === 'ECONNREFUSED' || e.message?.includes('ECONNREFUSED')) {
      throw new Error('DevOps Integrator není spuštěn. Spusť: npm start');
    }
    throw e;
  }
}

// ── Format helpers ────────────────────────────────────────────────────────────

function staleEmoji(level) {
  return level === 'stale' ? '🧊' : level === 'warning' ? '⚠️' : '';
}

function typeEmoji(type) {
  const map = { Bug: '🐛', 'User Story': '📖', Task: '✅', Feature: '🚀', Epic: '🏔️', 'Test Case': '🧪' };
  return map[type] || '📌';
}

function priorityLabel(p) {
  return ['', '🔴 Kritická', '🟠 Vysoká', '🟡 Střední', '⚪ Nízká'][p] || '—';
}

function formatDate(iso) {
  if (!iso) return 'neznámo';
  const d = new Date(iso);
  return d.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatItem(item, { showScore = false, showStale = true, index } = {}) {
  const idx   = index !== undefined ? `${index + 1}. ` : '';
  const emoji = typeEmoji(item.type);
  const stale = showStale ? ` ${staleEmoji(item.staleLevel)}`.trimEnd() : '';
  const score = showScore && item.priorityScore != null ? ` [score: ${item.priorityScore}]` : '';
  const proj  = item.projectLabel ? ` (${item.projectLabel})` : '';
  return `${idx}${emoji} **${item.title}**${stale}${score}\n` +
         `   ID: ${item.id}${proj} | ${item.type} | ${item.state} | ${priorityLabel(item.priority)}\n` +
         `   Změněno: ${formatDate(item.changedDate)} | ${item.staleDays ?? '?'}d beze změny\n` +
         `   🔗 ${item.url}`;
}

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new McpServer({
  name:    'devops-integrator',
  version: '2.0.0'
});

// ── Tool 1: get_assigned_tasks ────────────────────────────────────────────────
server.tool(
  'get_assigned_tasks',
  'Vrátí work items přiřazené aktuálnímu uživateli. Lze filtrovat dle projektu, priority a seřadit dle různých kritérií.',
  {
    project:    z.string().optional().describe('Název nebo label projektu (volitelné)'),
    priority:   z.number().int().min(1).max(4).optional().describe('Filtr dle priority 1–4'),
    stale_only: z.boolean().optional().describe('Jen položky označené jako stale nebo warning'),
    sort_by:    z.enum(['priorityScore', 'changedDate', 'priority', 'title']).optional()
                 .describe('Způsob řazení (výchozí: priorityScore)'),
    max_results: z.number().int().min(1).max(100).optional().describe('Max počet výsledků (výchozí: 20)')
  },
  async ({ project, priority, stale_only, sort_by = 'priorityScore', max_results = 20 }) => {
    const data = await callAPI('/api/devops/items');
    let items = data.assigned || [];

    if (project)    items = items.filter(i => i.project?.includes(project) || i.projectLabel?.includes(project));
    if (priority)   items = items.filter(i => i.priority === priority);
    if (stale_only) items = items.filter(i => i.staleLevel === 'stale' || i.staleLevel === 'warning');

    items.sort((a, b) => {
      if (sort_by === 'priorityScore') return (b.priorityScore ?? 0) - (a.priorityScore ?? 0);
      if (sort_by === 'changedDate')   return new Date(b.changedDate) - new Date(a.changedDate);
      if (sort_by === 'priority')      return (a.priority ?? 9) - (b.priority ?? 9);
      if (sort_by === 'title')         return a.title.localeCompare(b.title);
      return 0;
    });

    items = items.slice(0, max_results);
    if (items.length === 0) return { content: [{ type: 'text', text: 'Žádné přiřazené úkoly.' }] };

    const lines = [`## Moje úkoly (${items.length})\n`];
    items.forEach((item, i) => lines.push(formatItem(item, { showScore: true, index: i })));
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// ── Tool 2: get_my_activity ───────────────────────────────────────────────────
server.tool(
  'get_my_activity',
  'Vrátí work items na kterých jsi naposledy pracoval nebo je aktualizoval.',
  { days: z.number().int().min(1).max(90).optional().describe('Počet zpětných dní (výchozí: 14)') },
  async ({ days = 14 }) => {
    const data  = await callAPI('/api/devops/items');
    const since = Date.now() - days * 86400000;
    const items = (data.activity || [])
      .filter(i => new Date(i.changedDate) >= since)
      .sort((a, b) => new Date(b.changedDate) - new Date(a.changedDate));

    if (items.length === 0) return { content: [{ type: 'text', text: `Žádná aktivita za posledních ${days} dní.` }] };
    const lines = [`## Moje aktivita (${days} dní) — ${items.length} položek\n`];
    items.forEach((item, i) => lines.push(formatItem(item, { showScore: false, index: i })));
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// ── Tool 3: get_stale_tasks ───────────────────────────────────────────────────
server.tool(
  'get_stale_tasks',
  'Vrátí úkoly které nebyly změněny po zadaný počet dní (stagnující úkoly).',
  {
    min_days: z.number().int().min(1).optional().describe('Minimální počet dní beze změny (výchozí: z konfigurace)'),
    project:  z.string().optional().describe('Filtr dle projektu')
  },
  async ({ min_days, project }) => {
    const [data, aiCfg] = await Promise.all([
      callAPI('/api/devops/items'),
      callAPI('/api/ai/config')
    ]);
    const threshold = min_days ?? aiCfg.staleDetector.staleDays ?? 14;
    let items = [...(data.assigned || []), ...(data.following || [])]
      .filter((i, idx, arr) => arr.findIndex(x => x.id === i.id) === idx)
      .filter(i => (i.staleDays ?? 0) >= threshold);

    if (project) items = items.filter(i => i.project?.includes(project) || i.projectLabel?.includes(project));
    items.sort((a, b) => (b.staleDays ?? 0) - (a.staleDays ?? 0));

    if (items.length === 0) return { content: [{ type: 'text', text: `Žádné stagnující úkoly (>${threshold} dní).` }] };
    const lines = [`## 🧊 Stagnující úkoly (>${threshold} dní) — ${items.length}\n`];
    items.forEach((item, i) => lines.push(formatItem(item, { showScore: true, showStale: true, index: i })));
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// ── Tool 4: get_high_priority_tasks ──────────────────────────────────────────
server.tool(
  'get_high_priority_tasks',
  'Vrátí úkoly s nejvyšším priority score nebo nejkritičtější prioritou.',
  {
    min_score: z.number().int().min(0).max(100).optional()
               .describe('Minimální priority score (výchozí: 40)'),
    top_n:     z.number().int().min(1).max(50).optional()
               .describe('Vrátit top N položek (výchozí: 10)')
  },
  async ({ min_score = 40, top_n = 10 }) => {
    const data  = await callAPI('/api/devops/items');
    const items = [...(data.assigned || []), ...(data.following || [])]
      .filter((i, idx, arr) => arr.findIndex(x => x.id === i.id) === idx)
      .filter(i => (i.priorityScore ?? 0) >= min_score)
      .sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0))
      .slice(0, top_n);

    if (items.length === 0) return { content: [{ type: 'text', text: `Žádné položky s score ≥ ${min_score}.` }] };
    const lines = [`## 🔥 Vysoká priorita (score ≥ ${min_score}) — top ${items.length}\n`];
    items.forEach((item, i) => lines.push(formatItem(item, { showScore: true, index: i })));
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// ── Tool 5: get_sprint_tasks ──────────────────────────────────────────────────
server.tool(
  'get_sprint_tasks',
  'Vrátí úkoly patřící do aktuálního nebo konkrétního sprintu (iteration path).',
  {
    sprint:  z.string().optional().describe('Část iteration path (např. "Sprint 42" nebo "Q2")'),
    project: z.string().optional().describe('Filtr dle projektu')
  },
  async ({ sprint, project }) => {
    const data  = await callAPI('/api/devops/items');
    let   items = [...(data.assigned || []), ...(data.activity || []), ...(data.following || [])]
      .filter((i, idx, arr) => arr.findIndex(x => x.id === i.id) === idx);

    if (project) items = items.filter(i => i.project?.includes(project) || i.projectLabel?.includes(project));
    if (sprint)  items = items.filter(i => i.iterationPath?.toLowerCase().includes(sprint.toLowerCase()));

    items.sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));
    if (items.length === 0) return { content: [{ type: 'text', text: 'Žádné sprintové úkoly.' }] };

    const label = sprint ? `sprint: ${sprint}` : 'aktuální sprint';
    const lines = [`## 🏃 Úkoly (${label}) — ${items.length}\n`];
    items.forEach((item, i) => lines.push(formatItem(item, { showScore: true, index: i })));
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// ── Tool 6: search_tasks ──────────────────────────────────────────────────────
server.tool(
  'search_tasks',
  'Fulltextové vyhledávání v názvech a tagách work itemů.',
  {
    query:   z.string().min(2).describe('Hledaný text (v názvu nebo tagu)'),
    section: z.enum(['assigned', 'activity', 'following', 'all']).optional()
              .describe('Sekce k prohledání (výchozí: all)')
  },
  async ({ query, section = 'all' }) => {
    const data = await callAPI('/api/devops/items');
    const pool = section === 'all'
      ? [...(data.assigned || []), ...(data.activity || []), ...(data.following || [])]
          .filter((i, idx, arr) => arr.findIndex(x => x.id === i.id) === idx)
      : (data[section] || []);

    const q     = query.toLowerCase();
    const items = pool.filter(i =>
      i.title?.toLowerCase().includes(q) || i.tags?.toLowerCase().includes(q)
    );

    if (items.length === 0) return { content: [{ type: 'text', text: `Žádný výsledek pro "${query}".` }] };
    const lines = [`## 🔍 Výsledky pro "${query}" — ${items.length}\n`];
    items.forEach((item, i) => lines.push(formatItem(item, { showScore: true, index: i })));
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// ── Tool 7: get_tasks_by_project ──────────────────────────────────────────────
server.tool(
  'get_tasks_by_project',
  'Vrátí přehled úkolů seskupených dle projektu.',
  { project: z.string().optional().describe('Název projektu (bez filtru = všechny)') },
  async ({ project }) => {
    const data = await callAPI('/api/devops/items');
    let items  = [...(data.assigned || []), ...(data.activity || []), ...(data.following || [])]
      .filter((i, idx, arr) => arr.findIndex(x => x.id === i.id) === idx);

    if (project) items = items.filter(i => i.project?.includes(project) || i.projectLabel?.includes(project));

    const grouped = {};
    for (const item of items) {
      const key = item.projectLabel || item.project || 'Neznámý';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    }

    const lines = ['## 📁 Úkoly dle projektu\n'];
    for (const [proj, list] of Object.entries(grouped)) {
      lines.push(`### ${proj} (${list.length})`);
      list.sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0))
          .slice(0, 15)
          .forEach((item, i) => lines.push(formatItem(item, { showScore: true, index: i })));
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// ── Tool 8: get_workload_summary ──────────────────────────────────────────────
server.tool(
  'get_workload_summary',
  'Vrátí přehled pracovní zátěže: statistiky dle projektu, priority a stavu.',
  {},
  async () => {
    const data  = await callAPI('/api/devops/items');
    const items = data.assigned || [];

    const byProject = {}, byPriority = { 1: 0, 2: 0, 3: 0, 4: 0 }, byState = {};
    let staleCount = 0, warnCount = 0, totalScore = 0;

    for (const item of items) {
      const p = item.projectLabel || item.project || '?';
      byProject[p] = (byProject[p] || 0) + 1;
      if (item.priority) byPriority[item.priority] = (byPriority[item.priority] || 0) + 1;
      byState[item.state] = (byState[item.state] || 0) + 1;
      if (item.staleLevel === 'stale')   staleCount++;
      if (item.staleLevel === 'warning') warnCount++;
      totalScore += item.priorityScore ?? 0;
    }

    const lines = [
      `## 📊 Přehled pracovní zátěže\n`,
      `**Celkem přiřazeno:** ${items.length} položek`,
      `**Průměrný priority score:** ${items.length ? Math.round(totalScore / items.length) : 0}`,
      `**Stagnující:** 🧊 ${staleCount} stale | ⚠️ ${warnCount} warning\n`,
      `### Dle projektu`,
      ...Object.entries(byProject).map(([p, n]) => `- ${p}: ${n}`),
      `\n### Dle priority`,
      `- 🔴 Kritická (1): ${byPriority[1] || 0}`,
      `- 🟠 Vysoká   (2): ${byPriority[2] || 0}`,
      `- 🟡 Střední  (3): ${byPriority[3] || 0}`,
      `- ⚪ Nízká    (4): ${byPriority[4] || 0}`,
      `\n### Dle stavu`,
      ...Object.entries(byState).map(([s, n]) => `- ${s}: ${n}`)
    ];
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// ── Tool 9: generate_standup ──────────────────────────────────────────────────
server.tool(
  'generate_standup',
  'Vygeneruje standup shrnutí: co jsem dělal, co budu dělat, bloky.',
  {
    days_back:     z.number().int().min(1).max(7).optional()
                   .describe('Za kolik dní zpět hledat aktivitu (výchozí: 1)'),
    format:        z.enum(['markdown', 'plaintext', 'bullets']).optional()
                   .describe('Formát výstupu (výchozí: markdown)'),
    include_score: z.boolean().optional().describe('Zobrazit priority score (výchozí: false)'),
    language:      z.enum(['cs', 'en']).optional().describe('Jazyk výstupu (výchozí: cs)')
  },
  async ({ days_back = 1, format = 'markdown', include_score = false, language = 'cs' }) => {
    const data  = await callAPI('/api/devops/items');
    const since = Date.now() - days_back * 86400000;

    const done   = (data.activity  || []).filter(i => new Date(i.changedDate) >= since);
    const todo   = (data.assigned  || [])
      .filter(i => i.state === 'Active' || i.state === 'In Progress' || i.state === 'New')
      .sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0))
      .slice(0, 8);
    const blocks = (data.assigned || []).filter(i =>
      i.staleLevel === 'stale' || i.staleLevel === 'warning'
    ).slice(0, 3);

    const t = language === 'en'
      ? { yesterday: 'Yesterday / last period', today: 'Today', blockers: 'Blockers', none: 'Nothing to report', noBlocks: 'No blockers 🟢' }
      : { yesterday: 'Včera / poslední období', today: 'Dnes', blockers: 'Bloky / otázky', none: 'Žádná aktivita', noBlocks: 'Žádné bloky 🟢' };

    const itemLine = (i) => {
      const score = include_score && i.priorityScore != null ? ` [${i.priorityScore}]` : '';
      return `${typeEmoji(i.type)} ${i.title}${score} — ${i.projectLabel || i.project || '?'}`;
    };

    if (format === 'markdown') {
      const lines = [
        `## 🗣️ Standup — ${new Date().toLocaleDateString('cs-CZ')}\n`,
        `### ${t.yesterday}`,
        done.length ? done.map(i => `- ${itemLine(i)}`).join('\n') : `- ${t.none}`,
        `\n### ${t.today}`,
        todo.length ? todo.map(i => `- ${itemLine(i)}`).join('\n') : `- ${t.none}`,
        `\n### ${t.blockers}`,
        blocks.length
          ? blocks.map(i => `- ⚠️ ${i.title} (${i.staleDays}d beze změny)`).join('\n')
          : `- ${t.noBlocks}`
      ];
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }

    if (format === 'bullets') {
      const lines = [
        `${t.yesterday}:`,
        ...done.map(i => `• ${itemLine(i)}`),
        done.length === 0 ? `• ${t.none}` : '',
        `\n${t.today}:`,
        ...todo.map(i => `• ${itemLine(i)}`),
        todo.length === 0 ? `• ${t.none}` : '',
        `\n${t.blockers}:`,
        blocks.length ? blocks.map(i => `• ${i.title}`).join('\n') : `• ${t.noBlocks}`
      ].filter(l => l !== '');
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }

    // plaintext
    const lines = [
      `STANDUP ${new Date().toLocaleDateString('cs-CZ')}`,
      `${t.yesterday}: ${done.map(i => i.title).join(', ') || t.none}`,
      `${t.today}: ${todo.map(i => i.title).join(', ') || t.none}`,
      `${t.blockers}: ${blocks.map(i => i.title).join(', ') || t.noBlocks}`
    ];
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// ── Tool 10: get_task_notes ───────────────────────────────────────────────────
server.tool(
  'get_task_notes',
  'Vrátí lokální poznámky uložené k work itemům.',
  { item_id: z.number().int().optional().describe('ID konkrétního work itemu (bez ID = všechny poznámky)') },
  async ({ item_id }) => {
    const data  = await callAPI('/api/devops/notes');
    const notes = data.notes || {};

    if (item_id) {
      const n = notes[String(item_id)];
      if (!n?.length) return { content: [{ type: 'text', text: `Žádné poznámky k #${item_id}.` }] };
      const lines = [`## 📝 Poznámky k #${item_id}\n`];
      n.forEach((note, i) => lines.push(`${i + 1}. [${formatDate(note.createdAt)}] ${note.text}`));
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }

    const entries = Object.entries(notes).filter(([, v]) => v.length > 0);
    if (entries.length === 0) return { content: [{ type: 'text', text: 'Žádné uložené poznámky.' }] };
    const lines = [`## 📝 Všechny poznámky (${entries.length} položek)\n`];
    for (const [id, nArr] of entries) {
      lines.push(`### #${id}`);
      nArr.forEach((note, i) => lines.push(`${i + 1}. [${formatDate(note.createdAt)}] ${note.text}`));
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// ── Tool 11: add_task_note ────────────────────────────────────────────────────
server.tool(
  'add_task_note',
  'Uloží lokální poznámku k work itemu (neuloží do Azure DevOps — jen lokálně).',
  {
    item_id: z.number().int().describe('ID work itemu'),
    note:    z.string().min(1).describe('Text poznámky')
  },
  async ({ item_id, note }) => {
    const res = await postAPI(`/api/devops/notes/${item_id}`, { text: note });
    if (res.ok) return { content: [{ type: 'text', text: `✅ Poznámka přidána k #${item_id}.` }] };
    throw new Error(res.error || 'Chyba při ukládání poznámky');
  }
);

// ── Tool 12: get_following_tasks ──────────────────────────────────────────────
server.tool(
  'get_following_tasks',
  'Vrátí work items které sleduješ (Follow) ale nejsi přiřazen.',
  {
    stale_only: z.boolean().optional().describe('Jen stagnující sledované položky')
  },
  async ({ stale_only = false }) => {
    const data  = await callAPI('/api/devops/items');
    const assignedIds = new Set((data.assigned || []).map(i => i.id));
    let items = (data.following || []).filter(i => !assignedIds.has(i.id));

    if (stale_only) items = items.filter(i => i.staleLevel === 'stale' || i.staleLevel === 'warning');
    items.sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));

    if (items.length === 0) return { content: [{ type: 'text', text: 'Žádné sledované položky.' }] };
    const lines = [`## 👀 Sledované položky (${items.length})\n`];
    items.forEach((item, i) => lines.push(formatItem(item, { showScore: true, index: i })));
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// ── Start transport ───────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('DevOps Integrator MCP server ready. Connecting to:', BASE);
