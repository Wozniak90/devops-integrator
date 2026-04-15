# DevOps Integrator V2 — Multi-PM Aggregator

> Work in progress. V1 (Azure DevOps only) lives in the root of this repo.
> V2 introduces a **provider architecture** — each PM tool is an independent plugin.

---

## Vision

A single local dashboard showing your tasks from **every PM tool you use** — Jira, Azure DevOps, GitHub Issues, GitLab, Linear, and more.

- **Local-first** — runs on `localhost:4242`, no cloud, no accounts
- **Read-only** — only needs API read permissions (PAT/API token)
- **Provider plugins** — each tool is a self-contained module

---

## Planned Providers

| Priority | Provider | API | Auth | Status |
|---|---|---|---|---|
| 1 | Azure DevOps | REST | PAT | ✅ V1 (stable) |
| 2 | **Jira** | REST v3 | API Token | 🚧 Next |
| 3 | GitHub Issues | REST v3 / GraphQL | PAT | 📋 Planned |
| 4 | GitLab | REST / GraphQL | PAT | 📋 Planned |
| 5 | Linear | GraphQL | API Key | 📋 Planned |
| 6 | Asana | REST | OAuth/PAT | 📋 Backlog |
| 7 | Trello | REST | API Key | 📋 Backlog |
| 8 | ClickUp | REST | API Key | 📋 Backlog |
| 9 | Notion | REST | Bearer | 📋 Backlog |
| 10 | YouTrack | REST | Bearer | 📋 Backlog |

---

## Provider Interface

Every provider must implement the following interface:

```js
/**
 * @typedef {Object} WorkItem
 * @property {string} id           - Original item ID (e.g. "ABC-123" or "#456")
 * @property {string} provider     - Provider ID (e.g. "jira", "azure", "github")
 * @property {string} title
 * @property {string} status       - Normalized: "active" | "new" | "resolved" | "closed" | "other"
 * @property {1|2|3|4} priority    - 1=critical, 2=high, 3=medium, 4=low
 * @property {string} type         - "bug" | "task" | "story" | "epic" | "other"
 * @property {string} url          - Direct link to item in the tool
 * @property {string} project      - Project name or key
 * @property {string} [sprint]     - Current sprint name (if applicable)
 * @property {string} assignee     - Assignee display name
 * @property {Date} updatedAt
 */

module.exports = {
  id: 'provider-id',       // unique string key
  name: 'Provider Name',   // human-readable
  icon: '🟦',              // emoji icon for UI

  /**
   * Returns open items assigned to the authenticated user.
   * @param {Object} config  - Provider-specific config object
   * @returns {Promise<WorkItem[]>}
   */
  async getAssignedItems(config) { /* ... */ },

  /**
   * Returns items recently changed by the authenticated user.
   * @param {Object} config
   * @param {number} days   - How many days back to look
   * @returns {Promise<WorkItem[]>}
   */
  async getMyActivity(config, days) { /* ... */ },

  /**
   * Validate provider config before saving.
   * @param {Object} config
   * @returns {{ valid: boolean, error?: string }}
   */
  validateConfig(config) { /* ... */ },
};
```

---

## Multi-Provider Config Schema (V2)

Config will be stored in `data/config.json` (replacing `data/devops-config.json`):

```json
{
  "version": 2,
  "providers": {
    "azure-devops": {
      "enabled": true,
      "organization": "my-org",
      "pat": "...",
      "email": "user@company.com",
      "activityDays": 14,
      "projects": [
        { "id": "...", "name": "Project", "abbreviation": "PRJ", "color": "#e94560" }
      ]
    },
    "jira": {
      "enabled": true,
      "host": "https://mycompany.atlassian.net",
      "email": "user@company.com",
      "apiToken": "...",
      "projects": ["ABC", "XYZ"]
    },
    "github": {
      "enabled": true,
      "pat": "ghp_...",
      "repos": ["org/repo1", "org/repo2"]
    }
  }
}
```

---

## Folder Structure

```
V2/
├── README.md               ← This file
├── providers/
│   ├── index.js            ← Provider registry & loader
│   ├── azure-devops.js     ← Migrated from V1 server.js
│   ├── jira.js             ← Jira Cloud + Server
│   ├── github.js           ← GitHub Issues + PRs
│   ├── gitlab.js           ← GitLab Issues + MRs
│   └── linear.js           ← Linear tasks (GraphQL)
├── server.js               ← V2 Express backend
└── public/
    └── index.html          ← V2 SPA (multi-provider wizard + dashboard)
```

---

## Development Notes

- V2 is backwards-compatible: users with existing `devops-config.json` get auto-migrated to V2 schema
- Provider loading is dynamic — only providers with `"enabled": true` are initialized
- Each provider runs in isolation — one failing provider doesn't break others
- Rate limiting is handled per-provider
