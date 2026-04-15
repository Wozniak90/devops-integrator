'use strict';
const express = require('express');
const path    = require('path');
const fs      = require('fs');

const PORT         = process.env.PORT || 4242;
const DATA_DIR     = path.join(__dirname, 'data');
const CONFIG_PATH  = path.join(DATA_DIR, 'devops-config.json');
const NOTES_PATH     = path.join(DATA_DIR, 'devops-notes.json');
const AI_CONFIG_PATH = path.join(DATA_DIR, 'ai-config.json');

// Jira provider (V2 architecture)
const jiraProvider = require('./V2/providers/jira');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Config helpers ────────────────────────────────────────────────────────
function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { return null; }
}
function writeConfig(cfg) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
}
function readNotes() {
  try { return JSON.parse(fs.readFileSync(NOTES_PATH, 'utf8')); } catch { return {}; }
}
function writeNotes(notes) {
  fs.writeFileSync(NOTES_PATH, JSON.stringify(notes, null, 2), 'utf8');
}

// ── AI Feature config ─────────────────────────────────────────────────────────

const DEFAULT_AI_CONFIG = {
  priorityScore: {
    enabled: true,
    weights: {
      stalenessFactor: 2,    // points per stale day
      stalenessCap:    30,   // max points from staleness
      priority: { '1': 25, '2': 15, '3': 8, '4': 2 },
      type:     { 'Bug': 15, 'User Story': 5, 'Task': 5, 'Feature': 3, 'Epic': -5, 'Test Case': 0 },
      status:   { 'Active': 10, 'In Progress': 10, 'New': 5, 'Resolved': -5 }
    }
  },
  staleDetector: {
    enabled:     true,
    warningDays: 5,   // yellow badge
    staleDays:   14   // red badge + 🧊
  }
};

function deepMerge(base, override) {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    const bv = base[key], ov = override[key];
    if (ov !== null && typeof ov === 'object' && !Array.isArray(ov) &&
        bv !== null && typeof bv === 'object' && !Array.isArray(bv)) {
      result[key] = deepMerge(bv, ov);
    } else {
      result[key] = ov;
    }
  }
  return result;
}

function readAIConfig() {
  try { return deepMerge(DEFAULT_AI_CONFIG, JSON.parse(fs.readFileSync(AI_CONFIG_PATH, 'utf8'))); }
  catch { return DEFAULT_AI_CONFIG; }
}

function writeAIConfig(cfg) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(AI_CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
}

function calcPriorityScore(staleDays, priority, type, state, aiCfg) {
  if (!aiCfg.priorityScore.enabled) return null;
  const w = aiCfg.priorityScore.weights;
  let score = 0;
  score += Math.min(staleDays * w.stalenessFactor, w.stalenessCap);
  score += w.priority[String(priority)] ?? 5;
  score += w.type[type]   ?? 0;
  score += w.status[state] ?? 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ── DevOps fetch helper ───────────────────────────────────────────────────
async function devopsFetch(cfg, url, method = 'GET', body = null) {
  const token = Buffer.from(`:${cfg.pat}`).toString('base64');
  const opts = {
    method,
    headers: {
      'Authorization': `Basic ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DevOps API ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  // Azure DevOps pagesBatch returns continuationToken in headers, not body
  const ct = res.headers.get('x-ms-continuationtoken');
  if (ct) json._continuationToken = ct;
  return json;
}

// ── Work items cache ──────────────────────────────────────────────────────
let _cache = null;
let _cacheTime = 0;

// ── Wiki cache ────────────────────────────────────────────────────────────
let _wikiCache = null;
let _wikiCacheTime = 0;
const WIKI_CACHE_MS = 30 * 60 * 1000; // 30 minutes

async function fetchWikiPages(cfg, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _wikiCache && !_wikiCache._hasErrors && (now - _wikiCacheTime) < WIKI_CACHE_MS) return _wikiCache;

  const stripDiacritics = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const normDashes = s => s.replace(/[\u2013\u2014\u2212]/g, '-');
  const norm = s => stripDiacritics(normDashes(decodeURIComponent((s || '')).replace(/^\//, '').replace(/\.md$/i, '').replace(/ /g, '-').toLowerCase()));

  const projects = [];
  const projectErrors = [];
  await Promise.all((cfg.projects || []).map(async (proj) => {
    try {
      const org = cfg.organization;
      const projEnc = encodeURIComponent(proj.name);

      const wikisData = await devopsFetch(cfg,
        `https://dev.azure.com/${org}/${projEnc}/_apis/wiki/wikis?api-version=7.1`);
      const wikis = wikisData.value || [];
      if (!wikis.length) { console.log(`[wiki] project ${proj.name}: no wikis found`); return; }

      const wiki = wikis.find(w => w.type === 'projectWiki') || wikis[0];
      const wikiIdEnc = encodeURIComponent(wiki.id);
      const repoId = wiki.repositoryId;

      const myNormPaths = new Set();
      try {
        const commitsData = await devopsFetch(cfg,
          `https://dev.azure.com/${org}/${projEnc}/_apis/git/repositories/${repoId}/commits` +
          `?searchCriteria.author=${encodeURIComponent(cfg.myEmail)}&$top=200&api-version=7.1`);
        const myCommits = (commitsData.value || []).slice(0, 50);
        await Promise.all(myCommits.map(async (commit) => {
          try {
            const ch = await devopsFetch(cfg,
              `https://dev.azure.com/${org}/${projEnc}/_apis/git/repositories/${repoId}/commits/${commit.commitId}/changes?api-version=7.1`);
            for (const change of (ch.changes || [])) {
              const ct = (change.changeType || '').toLowerCase();
              if ((ct === 'add' || ct === 'edit') && change.item?.path?.endsWith('.md')) {
                myNormPaths.add(norm(change.item.path));
              }
            }
          } catch { /* ignore */ }
        }));
      } catch { /* git commits optional */ }
      console.log(`[wiki] project ${proj.name}: ${myNormPaths.size} my git paths`);

      const allWikiPages = [];
      let continuationToken = null;
      do {
        const body = { top: 100 };
        if (continuationToken) body.continuationToken = continuationToken;
        const pagesData = await devopsFetch(cfg,
          `https://dev.azure.com/${org}/${projEnc}/_apis/wiki/wikis/${wikiIdEnc}/pagesBatch?api-version=7.1-preview.1`,
          'POST', body);
        continuationToken = pagesData._continuationToken || pagesData.continuationToken || null;
        for (const page of (pagesData.value || [])) {
          const segments = (page.path || '').split('/').filter(Boolean);
          const title = segments[segments.length - 1] || page.path;
          const url = `https://dev.azure.com/${org}/${projEnc}/_wiki/wikis/${wikiIdEnc}/${page.id}/${encodeURIComponent(title)}`;
          const mine = myNormPaths.size > 0 && myNormPaths.has(norm(page.path));
          allWikiPages.push({ id: page.id, path: page.path, title, url, mine });
        }
      } while (continuationToken);

      console.log(`[wiki] project ${proj.name}: ${allWikiPages.length} pages, ${allWikiPages.filter(p=>p.mine).length} mine`);
      projects.push({
        name: proj.name,
        label: proj.shortLabel || proj.name,
        color: proj.color || '#555',
        wikiId: wiki.id,
        pages: allWikiPages,
      });
    } catch (e) {
      console.log(`[wiki] project ${proj.name}: ${e.message}`);
      projectErrors.push({ project: proj.name, error: e.message });
    }
  }));

  const hasErrors = projectErrors.length > 0;
  const result = { projects, fetchedAt: new Date().toISOString(), _hasErrors: hasErrors };
  if (hasErrors) result.errors = projectErrors;
  if (!hasErrors) { _wikiCache = result; _wikiCacheTime = now; }
  return result;
}

const FIELDS = [
  'System.Id', 'System.Title', 'System.State', 'System.WorkItemType',
  'System.IterationPath', 'System.AreaPath', 'System.TeamProject',
  'System.AssignedTo', 'System.CreatedBy', 'System.ChangedDate', 'System.Tags',
  'Microsoft.VSTS.Common.Priority'
].join(',');

async function fetchItems(cfg, forceRefresh = false) {
  const now = Date.now();
  const cacheMs = (cfg.cacheMinutes || 5) * 60 * 1000;
  if (!forceRefresh && _cache && (now - _cacheTime) < cacheMs) return _cache;

  const aiCfg = readAIConfig();
  const base = `https://dev.azure.com/${cfg.organization}`;
  const assignedIdSet = new Set();
  const activityIdSet = new Set();
  const followingIdSet = new Set();

  await Promise.all((cfg.projects || []).map(async proj => {
    const pb = `${base}/${encodeURIComponent(proj.name)}`;
    const [ra, rv, rf] = await Promise.all([
      devopsFetch(cfg, `${pb}/_apis/wit/wiql?api-version=7.1`, 'POST', {
        query: `SELECT [System.Id] FROM WorkItems WHERE [System.AssignedTo] = '${cfg.myEmail}' AND [System.State] NOT IN ('Closed','Done','Removed','Resolved') ORDER BY [System.ChangedDate] DESC`
      }).catch(() => ({ workItems: [] })),
      devopsFetch(cfg, `${pb}/_apis/wit/wiql?api-version=7.1`, 'POST', {
        query: `SELECT [System.Id] FROM WorkItems WHERE [System.ChangedBy] = '${cfg.myEmail}' AND [System.ChangedDate] >= @Today - ${cfg.activityDays || 14} AND [System.State] NOT IN ('Closed','Done','Removed') ORDER BY [System.ChangedDate] DESC`
      }).catch(() => ({ workItems: [] })),
      devopsFetch(cfg, `${pb}/_apis/wit/wiql?api-version=7.1`, 'POST', {
        query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${proj.name}' AND ID IN (@Follows) AND [System.State] NOT IN ('Closed','Done','Removed','Resolved') ORDER BY [System.ChangedDate] DESC`
      }).catch(() => ({ workItems: [] }))
    ]);
    (ra.workItems || []).forEach(w => assignedIdSet.add(w.id));
    (rv.workItems || []).forEach(w => activityIdSet.add(w.id));
    (rf.workItems || []).forEach(w => followingIdSet.add(w.id));
  }));

  const allIds = [...new Set([...assignedIdSet, ...activityIdSet, ...followingIdSet])].slice(0, 200);
  const assigned = [], activity = [], following = [];

  if (allIds.length > 0) {
    const details = await devopsFetch(cfg, `${base}/_apis/wit/workitems?ids=${allIds.join(',')}&fields=${FIELDS}&api-version=7.1`)
      .catch(() => ({ value: [] }));

    const makeItem = item => {
      const state      = item.fields['System.State'] || '';
      const type       = item.fields['System.WorkItemType'] || '';
      const priority   = item.fields['Microsoft.VSTS.Common.Priority'] || null;
      const changed    = item.fields['System.ChangedDate'];
      const staleDays  = changed
        ? Math.floor((Date.now() - new Date(changed)) / 86400000)
        : 0;
      const sd = aiCfg.staleDetector;
      const staleLevel = !sd.enabled
        ? 'ok'
        : staleDays >= sd.staleDays   ? 'stale'
        : staleDays >= sd.warningDays ? 'warning'
        : 'ok';
      return {
        id: item.id,
        project: item.fields['System.TeamProject'],
        projectLabel: (cfg.projects || []).find(p => p.name === item.fields['System.TeamProject'])?.shortLabel || item.fields['System.TeamProject'],
        projectColor: (cfg.projects || []).find(p => p.name === item.fields['System.TeamProject'])?.color || '#555',
        url: `https://dev.azure.com/${cfg.organization}/${encodeURIComponent(item.fields['System.TeamProject'])}/_workitems/edit/${item.id}`,
        title:        item.fields['System.Title'],
        state,
        type,
        priority,
        iterationPath: item.fields['System.IterationPath'] || '',
        areaPath:     item.fields['System.AreaPath'] || '',
        assignedTo:   item.fields['System.AssignedTo']?.displayName || '',
        changedDate:  changed,
        tags:         item.fields['System.Tags'] || '',
        staleDays,
        staleLevel,
        priorityScore: calcPriorityScore(staleDays, priority, type, state, aiCfg)
      };
    };

    const itemMap = {};
    for (const item of (details.value || [])) itemMap[item.id] = makeItem(item);

    for (const id of assignedIdSet) { if (itemMap[id]) assigned.push(itemMap[id]); }
    const actAll = [];
    for (const id of activityIdSet) { if (itemMap[id]) actAll.push(itemMap[id]); }
    actAll.sort((a, b) => new Date(b.changedDate) - new Date(a.changedDate));
    activity.push(...actAll.slice(0, 10));
    for (const id of followingIdSet) {
      if (itemMap[id] && !assignedIdSet.has(id) && !activityIdSet.has(id)) following.push(itemMap[id]);
    }
  }

  _cache = { assigned, activity, following, fetchedAt: new Date().toISOString() };
  _cacheTime = now;
  return _cache;
}

// ── Jira: normalize V2 WorkItem → V1 item shape ───────────────────────────
function jiraItemToV1(item, aiCfg) {
  const changedDate = item.updatedAt instanceof Date
    ? item.updatedAt.toISOString()
    : (item.updatedAt || new Date().toISOString());
  const staleDays  = Math.floor((Date.now() - new Date(changedDate)) / 86400000);
  const sd = aiCfg.staleDetector;
  const staleLevel = !sd.enabled ? 'ok'
    : staleDays >= sd.staleDays   ? 'stale'
    : staleDays >= sd.warningDays ? 'warning'
    : 'ok';
  // Map V2 type back to display string
  const typeMap = { bug: 'Bug', story: 'User Story', task: 'Task', epic: 'Epic', other: 'Task' };
  const type = typeMap[item.type] || item.type || 'Task';
  return {
    id:           item.id,           // e.g. "ABC-123"
    provider:     'jira',
    project:      item.project || '',
    projectLabel: item.project || '',
    projectColor: item._projectColor || '#0052cc',  // Jira blue default
    url:          item.url,
    title:        item.title,
    state:        item.status,       // already normalized: active/new/resolved
    type,
    priority:     item.priority,     // already 1-4
    iterationPath: item.sprint || '',
    areaPath:     item.project || '',
    assignedTo:   item.assignee || '',
    changedDate,
    tags:         '',
    staleDays,
    staleLevel,
    priorityScore: calcPriorityScore(staleDays, item.priority, type, item.status, aiCfg)
  };
}

// ── Jira config helpers ────────────────────────────────────────────────────
function readJiraConfig() {
  const cfg = readConfig();
  return cfg?.jira || null;
}

function writeJiraConfig(jiraCfg) {
  const cfg = readConfig() || {};
  cfg.jira = jiraCfg;
  writeConfig(cfg);
}

// ── fetchItemsWithJira: merged Azure + Jira ───────────────────────────────
async function fetchAllItems(cfg, forceRefresh = false) {
  const azureData = await fetchItems(cfg, forceRefresh);
  const jiraCfg   = cfg.jira;

  if (!jiraCfg?.enabled) return azureData;

  const aiCfg = readAIConfig();
  try {
    const [jiraAssigned, jiraActivity] = await Promise.all([
      jiraProvider.getAssignedItems(jiraCfg).catch(e => { console.error('[jira] getAssignedItems:', e.message); return []; }),
      jiraProvider.getMyActivity(jiraCfg, cfg.activityDays || 14).catch(e => { console.error('[jira] getMyActivity:', e.message); return []; })
    ]);

    // Assign project colors from jiraCfg.projectColors if configured
    const colorMap = jiraCfg.projectColors || {};
    const toV1 = item => {
      const v1 = jiraItemToV1(item, aiCfg);
      v1.projectColor = colorMap[item.project] || '#0052cc';
      return v1;
    };

    const assignedV1  = jiraAssigned.map(toV1);
    const activityV1  = jiraActivity.map(toV1);

    // Build assigned ID set to avoid duplicates in activity
    const assignedIds = new Set([
      ...azureData.assigned.map(i => String(i.id)),
      ...assignedV1.map(i => String(i.id))
    ]);

    // Merge: assigned, activity (deduplicated, sorted by date), following unchanged
    const mergedAssigned = [...azureData.assigned, ...assignedV1];
    const mergedActivity = [
      ...azureData.activity,
      ...activityV1.filter(i => !assignedIds.has(String(i.id)))
    ].sort((a, b) => new Date(b.changedDate) - new Date(a.changedDate)).slice(0, 20);

    return {
      ...azureData,
      assigned: mergedAssigned,
      activity: mergedActivity,
    };
  } catch (e) {
    console.error('[jira] merge error:', e.message);
    return azureData;
  }
}

// ── Setup endpoints ───────────────────────────────────────────────────────

// GET /api/setup/status — is app configured?
app.get('/api/setup/status', (req, res) => {
  const cfg = readConfig();
  res.json({
    configured: !!cfg,
    nodeVersion: process.version,
    platform: process.platform
  });
});

// POST /api/setup/verify — test PAT + org, return basic profile
app.post('/api/setup/verify', async (req, res) => {
  const { organization, pat, email } = req.body || {};
  if (!organization || !pat) return res.status(400).json({ error: 'Chybí organization nebo pat' });
  try {
    // Verify by listing projects
    const token = Buffer.from(`:${pat}`).toString('base64');
    const r = await fetch(`https://dev.azure.com/${organization}/_apis/projects?api-version=7.1`, {
      headers: { Authorization: `Basic ${token}`, Accept: 'application/json' }
    });
    if (!r.ok) {
      const t = await r.text();
      return res.status(401).json({ error: `Ověření selhalo (${r.status}). Zkontroluj PAT a název organizace.` });
    }
    const data = await r.json();
    const projects = (data.value || []).map(p => ({ id: p.id, name: p.name }));
    res.json({ ok: true, projects, count: projects.length });
  } catch (e) {
    res.status(500).json({ error: `Chyba připojení: ${e.message}` });
  }
});

// POST /api/setup/save — save final config
app.post('/api/setup/save', (req, res) => {
  const { organization, pat, email, projects, cacheMinutes, activityDays } = req.body || {};
  if (!organization || !pat || !email || !projects?.length) {
    return res.status(400).json({ error: 'Chybí povinná pole' });
  }
  const cfg = {
    organization,
    pat,
    projects,
    myEmail: email,
    cacheMinutes: cacheMinutes || 5,
    activityDays: activityDays || 14,
    pinnedItems: []
  };
  writeConfig(cfg);
  _cache = null; // invalidate
  res.json({ ok: true });
});

// POST /api/setup/reset — clear config (re-run wizard)
app.post('/api/setup/reset', (req, res) => {
  try { fs.unlinkSync(CONFIG_PATH); } catch {}
  _cache = null;
  res.json({ ok: true });
});

// ── Jira endpoints ────────────────────────────────────────────────────────

// GET /api/jira/config — return Jira config (token masked)
app.get('/api/jira/config', (req, res) => {
  const jira = readJiraConfig();
  if (!jira) return res.json({ configured: false });
  const { apiToken, ...safe } = jira;
  res.json({ configured: true, ...safe, apiToken: apiToken ? '***' : '' });
});

// POST /api/jira/test — verify Jira credentials
app.post('/api/jira/test', async (req, res) => {
  const { host, email, apiToken } = req.body || {};
  const validation = jiraProvider.validateConfig({ host, email, apiToken });
  if (!validation.valid) return res.status(400).json({ error: validation.error });

  try {
    // Try fetching current user to validate credentials
    const url  = new URL('/rest/api/3/myself', host);
    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
    const r = await fetch(url.toString(), {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' }
    });
    if (!r.ok) {
      const t = await r.text();
      return res.status(401).json({ error: `Ověření selhalo (${r.status}). Zkontroluj host, email a API token.` });
    }
    const me = await r.json();
    // Also fetch project list
    const pr = await fetch(new URL('/rest/api/3/project?maxResults=50', host).toString(), {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' }
    });
    const projects = pr.ok ? await pr.json() : [];
    res.json({
      ok: true,
      displayName: me.displayName || me.name || email,
      projects: (Array.isArray(projects) ? projects : []).map(p => ({ key: p.key, name: p.name }))
    });
  } catch (e) {
    res.status(500).json({ error: `Chyba připojení: ${e.message}` });
  }
});

// POST /api/jira/save — save Jira config
app.post('/api/jira/save', (req, res) => {
  const { host, email, apiToken, keepToken, projects, projectColors, enabled } = req.body || {};

  // If keepToken=true, use existing stored token
  const resolvedToken = keepToken ? (readJiraConfig()?.apiToken || '') : apiToken;

  const validation = jiraProvider.validateConfig({ host, email, apiToken: resolvedToken });
  if (!validation.valid) return res.status(400).json({ error: validation.error });

  writeJiraConfig({
    enabled: enabled !== false,
    host,
    email,
    apiToken: resolvedToken,
    projects: projects || [],
    projectColors: projectColors || {}
  });
  _cache = null;
  res.json({ ok: true });
});

// POST /api/jira/disable — disable without deleting credentials
app.post('/api/jira/disable', (req, res) => {
  const jira = readJiraConfig();
  if (jira) { jira.enabled = false; writeJiraConfig(jira); }
  _cache = null;
  res.json({ ok: true });
});

// DELETE /api/jira/config — remove Jira config entirely
app.delete('/api/jira/config', (req, res) => {
  const cfg = readConfig();
  if (cfg) { delete cfg.jira; writeConfig(cfg); }
  _cache = null;
  res.json({ ok: true });
});

// ── DevOps endpoints ──────────────────────────────────────────────────────

app.get('/api/devops/items', async (req, res) => {
  const cfg = readConfig();
  if (!cfg) return res.status(400).json({ error: 'Aplikace není nakonfigurována' });
  try {
    const data = await fetchAllItems(cfg, req.query.refresh === '1');
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/devops/config', (req, res) => {
  const cfg = readConfig();
  if (!cfg) return res.status(404).json({ error: 'Není nakonfigurováno' });
  const { pat, ...safe } = cfg;
  res.json(safe);
});

app.get('/api/devops/comments', async (req, res) => {
  const cfg = readConfig();
  if (!cfg) return res.status(400).json({ error: 'Není nakonfigurováno' });
  const { id, project } = req.query;
  if (!id || !project) return res.status(400).json({ error: 'id a project jsou povinné' });
  try {
    const url = `https://dev.azure.com/${cfg.organization}/${encodeURIComponent(project)}/_apis/wit/workItems/${id}/comments?$top=200&api-version=7.1-preview.3`;
    const data = await devopsFetch(cfg, url).catch(() => ({ comments: [] }));
    const comments = (data.comments || []).sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate));
    const myEmail = cfg.myEmail.toLowerCase();
    const latest = comments[0] || null;
    const mine = comments.find(c => (c.createdBy?.uniqueName || '').toLowerCase() === myEmail) || null;
    const isSame = latest && mine && latest.id === mine.id;
    const strip = t => (t || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    const fmt = d => d ? new Date(d).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    res.json({
      mine:   mine   ? { text: strip(mine.text),   author: mine.createdBy?.displayName   || '', date: fmt(mine.createdDate)   } : null,
      latest: !isSame && latest ? { text: strip(latest.text), author: latest.createdBy?.displayName || '', date: fmt(latest.createdDate) } : null
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/devops/notes', (req, res) => res.json(readNotes()));

app.post('/api/devops/notes', (req, res) => {
  const { id, text } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id je povinné' });
  const notes = readNotes();
  if (!text || !text.trim()) delete notes[String(id)];
  else notes[String(id)] = text.trim();
  writeNotes(notes);
  res.json({ ok: true });
});

app.get('/api/devops/wiki', async (req, res) => {
  try {
    const cfg = readConfig();
    if (!cfg) return res.status(400).json({ error: 'devops-config.json nenalezen' });
    console.log('[wiki] starting fetch...');
    const data = await fetchWikiPages(cfg, req.query.refresh === '1');
    const total = (data.projects || []).reduce((s, p) => s + p.pages.length, 0);
    console.log(`[wiki] done — ${total} pages across ${data.projects?.length ?? 0} projects`);
    res.json(data);
  } catch (e) {
    console.error('[wiki] endpoint error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/devops/wiki/page', async (req, res) => {
  try {
    const cfg = readConfig();
    if (!cfg) return res.status(400).json({ error: 'devops-config.json nenalezen' });
    const { path, project, wikiId } = req.query;
    if (!path || !project || !wikiId) return res.status(400).json({ error: 'path, project, wikiId required' });
    const org = cfg.organization;
    const data = await devopsFetch(cfg,
      `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_apis/wiki/wikis/${encodeURIComponent(wikiId)}/pages` +
      `?path=${encodeURIComponent(path)}&includeContent=true&api-version=7.1`);
    res.json({ content: data.content || '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/devops/wiki/attachment', async (req, res) => {
  try {
    const cfg = readConfig();
    if (!cfg) return res.status(400).end();
    const { project, wikiId, name } = req.query;
    if (!project || !wikiId || !name) return res.status(400).end();
    const token = Buffer.from(`:${cfg.pat}`).toString('base64');
    // Attachments live in the wiki git repo — use Git Items API (attachments API only supports PUT)
    const itemPath = name.startsWith('/') ? name : `/${name}`;
    const url = `https://dev.azure.com/${cfg.organization}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(wikiId)}/items?path=${encodeURIComponent(itemPath)}&api-version=7.1&%24format=octetStream`;
    const r = await fetch(url, { headers: { 'Authorization': `Basic ${token}` } });
    if (!r.ok) return res.status(r.status).end();
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.status(500).end(); }
});

// ── AI config endpoints ───────────────────────────────────────────────────────

app.get('/api/ai/config', (_req, res) => {
  res.json(readAIConfig());
});

app.post('/api/ai/config', express.json(), (req, res) => {
  try {
    const current = readAIConfig();
    const updated  = deepMerge(current, req.body);
    writeAIConfig(updated);
    _cache = null; // invalidate cache so scores recalculate
    res.json({ ok: true, config: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ai/config/reset', (_req, res) => {
  try {
    writeAIConfig(DEFAULT_AI_CONFIG);
    _cache = null;
    res.json({ ok: true, config: DEFAULT_AI_CONFIG });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Fallback → SPA ────────────────────────────────────────────────────────
app.get('/{*path}', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`\n  DevOps Integrator → http://localhost:${PORT}\n`);
});
