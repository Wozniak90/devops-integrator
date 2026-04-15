/**
 * Azure DevOps Provider — V2 provider interface wrapper
 *
 * Thin adapter that bridges V1 server.js fetch logic into the
 * unified V2 WorkItem format used by the provider registry.
 *
 * Auth: Basic Auth with PAT
 * Docs: https://learn.microsoft.com/en-us/rest/api/azure/devops/
 */

'use strict';
const https = require('https');
const http  = require('http');

const PROVIDER_ID = 'azure-devops';

const FIELDS = [
  'System.Id', 'System.Title', 'System.State', 'System.WorkItemType',
  'System.IterationPath', 'System.AreaPath', 'System.TeamProject',
  'System.AssignedTo', 'System.ChangedDate', 'Microsoft.VSTS.Common.Priority'
].join(',');

function normalizeStatus(azureState) {
  const s = (azureState || '').toLowerCase();
  if (['active', 'in progress', 'committed'].some(v => s.includes(v))) return 'active';
  if (['new', 'to do', 'proposed', 'open'].some(v => s.includes(v)))   return 'new';
  if (['resolved', 'done', 'closed', 'completed'].some(v => s.includes(v))) return 'resolved';
  return 'other';
}

function normalizeType(azureType) {
  const t = (azureType || '').toLowerCase();
  if (t.includes('bug'))   return 'bug';
  if (t.includes('epic'))  return 'epic';
  if (t.includes('story')) return 'story';
  if (t.includes('task'))  return 'task';
  return 'other';
}

function azRequest(path, pat) {
  return new Promise((resolve, reject) => {
    const url  = new URL(path);
    const auth = Buffer.from(`:${pat}`).toString('base64');
    const lib  = url.protocol === 'https:' ? https : http;

    const req = lib.request({
      hostname: url.hostname,
      port:     url.port || 443,
      path:     url.pathname + url.search,
      method:   'GET',
      headers:  { Authorization: `Basic ${auth}`, Accept: 'application/json' }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`AzDevOps: JSON parse error — ${e.message}`)); }
        } else {
          reject(new Error(`AzDevOps API ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function azPost(path, pat, body) {
  return new Promise((resolve, reject) => {
    const url   = new URL(path);
    const auth  = Buffer.from(`:${pat}`).toString('base64');
    const json  = JSON.stringify(body);
    const req   = https.request({
      hostname: url.hostname,
      port:     443,
      path:     url.pathname + url.search,
      method:   'POST',
      headers:  {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(json)
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`AzDevOps POST parse error — ${e.message}`)); }
        } else {
          reject(new Error(`AzDevOps POST ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(json);
    req.end();
  });
}

function mapItem(item, config) {
  const f = item.fields;
  const proj  = config.projects?.find(p => p.name === f['System.TeamProject']);
  const state = f['System.State'] || '';
  const type  = f['System.WorkItemType'] || '';
  return {
    id:         item.id,
    provider:   PROVIDER_ID,
    title:      f['System.Title'] || '(no title)',
    status:     normalizeStatus(state),
    priority:   f['Microsoft.VSTS.Common.Priority'] || 4,
    type:       normalizeType(type),
    url:        `https://dev.azure.com/${config.organization}/${encodeURIComponent(f['System.TeamProject'])}/_workitems/edit/${item.id}`,
    project:    f['System.TeamProject'] || '',
    sprint:     (f['System.IterationPath'] || '').split('\\').pop() || '',
    assignee:   f['System.AssignedTo']?.displayName || '',
    updatedAt:  new Date(f['System.ChangedDate'] || Date.now()),
    // V2 extras
    projectLabel: proj?.shortLabel || f['System.TeamProject'] || '',
    projectColor: proj?.color || '#555',
    areaPath:     f['System.AreaPath'] || '',
    iterationPath: f['System.IterationPath'] || '',
    _raw: { state, type }
  };
}

module.exports = {
  id: PROVIDER_ID,
  name: 'Azure DevOps',
  icon: '🔷',

  async getAssignedItems(config) {
    const { organization, pat, myEmail, projects = [] } = config;
    const base = `https://dev.azure.com/${organization}`;
    const ids = new Set();

    await Promise.all(projects.map(async proj => {
      const pb  = `${base}/${encodeURIComponent(proj.name)}`;
      const res = await azPost(`${pb}/_apis/wit/wiql?api-version=7.1`, pat, {
        query: `SELECT [System.Id] FROM WorkItems WHERE [System.AssignedTo] = '${myEmail}' AND [System.State] NOT IN ('Closed','Done','Removed','Resolved') ORDER BY [System.ChangedDate] DESC`
      }).catch(() => ({ workItems: [] }));
      (res.workItems || []).forEach(w => ids.add(w.id));
    }));

    if (!ids.size) return [];
    const details = await azRequest(
      `${base}/_apis/wit/workitems?ids=${[...ids].slice(0, 200).join(',')}&fields=${FIELDS}&api-version=7.1`,
      pat
    ).catch(() => ({ value: [] }));

    return (details.value || []).map(i => mapItem(i, config));
  },

  async getMyActivity(config, days = 14) {
    const { organization, pat, myEmail, projects = [] } = config;
    const base = `https://dev.azure.com/${organization}`;
    const ids = new Set();

    await Promise.all(projects.map(async proj => {
      const pb  = `${base}/${encodeURIComponent(proj.name)}`;
      const res = await azPost(`${pb}/_apis/wit/wiql?api-version=7.1`, pat, {
        query: `SELECT [System.Id] FROM WorkItems WHERE [System.ChangedBy] = '${myEmail}' AND [System.ChangedDate] >= @Today - ${days} ORDER BY [System.ChangedDate] DESC`
      }).catch(() => ({ workItems: [] }));
      (res.workItems || []).forEach(w => ids.add(w.id));
    }));

    if (!ids.size) return [];
    const details = await azRequest(
      `${base}/_apis/wit/workitems?ids=${[...ids].slice(0, 100).join(',')}&fields=${FIELDS}&api-version=7.1`,
      pat
    ).catch(() => ({ value: [] }));

    return (details.value || []).map(i => mapItem(i, config))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 50);
  },

  validateConfig(config) {
    if (!config.organization) return { valid: false, error: 'organization is required' };
    if (!config.pat)          return { valid: false, error: 'PAT is required' };
    if (!config.myEmail)      return { valid: false, error: 'myEmail is required' };
    return { valid: true };
  }
};
