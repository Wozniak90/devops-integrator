/**
 * Jira Provider — Jira Cloud + Server/Data Center
 *
 * API: Jira REST API v3 (Cloud) / v2 (Server)
 * Auth: Basic Auth — email + API Token
 * Docs: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
 */

const https = require('https');
const http = require('http');

const PROVIDER_ID = 'jira';

/**
 * Normalize Jira status to unified status.
 * @param {string} jiraStatus
 * @returns {string}
 */
function normalizeStatus(jiraStatus) {
  const s = jiraStatus?.toLowerCase() || '';
  if (['in progress', 'in development', 'active'].some(v => s.includes(v))) return 'active';
  if (['to do', 'open', 'new', 'backlog', 'selected for development'].some(v => s.includes(v))) return 'new';
  if (['in review', 'code review', 'testing', 'done', 'resolved'].some(v => s.includes(v))) return 'resolved';
  if (['closed', 'rejected', 'cancelled', 'won\'t fix', 'duplicate'].some(v => s.includes(v))) return 'closed';
  return 'other';
}

/**
 * Normalize Jira priority to P1–P4.
 * @param {string} jiraPriority
 * @returns {1|2|3|4}
 */
function normalizePriority(jiraPriority) {
  const p = jiraPriority?.toLowerCase() || '';
  if (['blocker', 'critical', 'highest'].includes(p)) return 1;
  if (['major', 'high'].includes(p)) return 2;
  if (['minor', 'medium'].includes(p)) return 3;
  return 4; // low, lowest, trivial, unknown
}

/**
 * Normalize Jira issue type to unified type.
 * @param {string} issueType
 * @returns {string}
 */
function normalizeType(issueType) {
  const t = issueType?.toLowerCase() || '';
  if (t.includes('bug')) return 'bug';
  if (t.includes('epic')) return 'epic';
  if (['story', 'user story'].some(v => t.includes(v))) return 'story';
  if (t.includes('task')) return 'task';
  if (['sub-task', 'subtask'].some(v => t.includes(v))) return 'task';
  return 'other';
}

/**
 * Make authenticated request to Jira REST API.
 * @param {string} host    - e.g. "https://mycompany.atlassian.net"
 * @param {string} path    - e.g. "/rest/api/3/search?..."
 * @param {string} email
 * @param {string} apiToken
 * @returns {Promise<Object>}
 */
function jiraRequest(host, path, email, apiToken, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, host);
    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
    const lib  = url.protocol === 'https:' ? https : http;
    const postData = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: postData ? 'POST' : 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
      },
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`Jira: JSON parse error — ${e.message}`)); }
        } else {
          reject(new Error(`Jira API ${res.statusCode}: ${data.slice(0, 300)}`));
        }
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

/**
 * Map a Jira issue object to the unified WorkItem format.
 * @param {Object} issue  - Raw Jira issue from REST API
 * @param {string} host   - Jira host for URL construction
 * @returns {Object} WorkItem
 */
function mapIssue(issue, host) {
  const f = issue.fields;
  return {
    id: issue.key,                          // e.g. "ABC-123"
    provider: PROVIDER_ID,
    title: f.summary || '(no title)',
    status: normalizeStatus(f.status?.name),
    priority: normalizePriority(f.priority?.name),
    type: normalizeType(f.issuetype?.name),
    url: `${host}/browse/${issue.key}`,
    project: f.project?.key || '',
    sprint: f.sprint?.name || extractSprint(f.customfield_10020),
    assignee: f.assignee?.displayName || '',
    updatedAt: new Date(f.updated),
    _raw: {
      status: f.status?.name,
      priority: f.priority?.name,
      type: f.issuetype?.name,
    },
  };
}

/**
 * Extract sprint name from Jira custom sprint field (cloud format).
 * @param {Array|null} sprintField
 * @returns {string}
 */
function extractSprint(sprintField) {
  if (!Array.isArray(sprintField) || sprintField.length === 0) return '';
  const active = sprintField.find(s => s.state === 'active') || sprintField[sprintField.length - 1];
  return active?.name || '';
}

// ─────────────────────────────────────────────
// Provider interface implementation
// ─────────────────────────────────────────────

module.exports = {
  id: PROVIDER_ID,
  name: 'Jira',
  icon: '🟦',

  async getAssignedItems(config) {
    const { host, email, apiToken, projects } = config;

    const projectFilter = projects?.length
      ? ` AND project in (${projects.map(p => `"${p}"`).join(',')})`
      : '';
    const jql = `assignee = currentUser() AND statusCategory != Done${projectFilter} ORDER BY updated DESC`;

    const data = await jiraRequest(host, '/rest/api/3/search/jql', email, apiToken, {
      jql,
      fields: ['summary','status','priority','issuetype','project','updated','assignee','sprint','customfield_10020'],
      maxResults: 100,
    });
    return (data.issues || []).map(issue => mapIssue(issue, host));
  },

  async getMyActivity(config, days = 14) {
    const { host, email, apiToken, projects } = config;

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];

    const projectFilter = projects?.length
      ? ` AND project in (${projects.map(p => `"${p}"`).join(',')})`
      : '';
    const jql = `updatedBy(currentUser()) AND updated >= "${since}"${projectFilter} ORDER BY updated DESC`;

    const data = await jiraRequest(host, '/rest/api/3/search/jql', email, apiToken, {
      jql,
      fields: ['summary','status','priority','issuetype','project','updated','assignee','sprint','customfield_10020'],
      maxResults: 50,
    });
    return (data.issues || []).map(issue => mapIssue(issue, host));
  },

  validateConfig(config) {
    if (!config.host) return { valid: false, error: 'Jira host URL is required (e.g. https://mycompany.atlassian.net)' };
    if (!config.email) return { valid: false, error: 'Email is required' };
    if (!config.apiToken) return { valid: false, error: 'API token is required' };
    try { new URL(config.host); }
    catch { return { valid: false, error: 'Invalid Jira host URL' }; }
    return { valid: true };
  },
};
