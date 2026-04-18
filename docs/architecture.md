# Technical Architecture

## Overview

DevOps Integrator is a local Node.js + Express web application that aggregates work items from multiple PM tools into a single dashboard.

- Runs on `localhost:4242`
- No cloud, no external accounts required
- Read-only access — only needs API tokens with read permissions
- Single-user (personal dashboard)

---

## Repository Structure

```
devops-integrator/
├── server.js                    # Express 5 backend, port 4242 (CommonJS)
├── mcp-server.mjs               # Standalone MCP server (12 tools)
├── mcp-test.mjs                 # MCP test script
├── package.json
├── start.bat                    # Windows launcher
├── start.sh                     # macOS/Linux launcher
├── AGENTS.md                    # AI agent installation instructions
├── public/
│   └── index.html               # SPA — dashboard + filters + modals + AI badges
├── V2/
│   └── providers/
│       ├── index.js             # Provider registry
│       ├── jira.js              # Jira Cloud provider
│       └── azure-devops.js      # Azure DevOps V2 wrapper
├── scripts/
│   └── jira-seed.mjs            # Seed test data into Jira
├── docs/                        # ← You are here
└── data/                        # gitignored
    ├── devops-config.json       # Config (Azure + Jira + AI settings)
    ├── notes.json               # Personal item notes
    └── provider-audit.log       # JSONL audit trail for provider config changes
```

---

## V1 vs V2 Architecture

### V1 (Current runtime)
- `server.js` is the main backend (CommonJS)
- Azure DevOps logic is inline in `server.js`
- Jira uses V2 provider imported via `require('./V2/providers/jira')`

### V2 Provider System
Each PM tool is a self-contained provider module implementing the unified interface:

```js
module.exports = {
  id: 'provider-id',     // unique string
  name: 'Provider Name', // human-readable
  icon: '🟦',            // emoji for UI badges

  async getAssignedItems(config) → WorkItem[],
  async getMyActivity(config, days) → WorkItem[],
  validateConfig(config) → { valid: boolean, error?: string }
};
```

---

## Provider Management Layer

`server.js` now exposes generic provider-management endpoints under `/api/providers/*`.
Legacy Jira routes (`/api/jira/*`) are kept as backward-compatible wrappers for the existing frontend.

Flow:

1. Route validates `providerId` against the provider registry.
2. Config helpers read/write both schemas for migration safety:
   - current: top-level `jira`
   - migration-safe: `providers.jira`
3. Secret fields are masked in read responses.
4. Mutating operations append JSON lines to `data/provider-audit.log`.

This keeps feature #5 compatible with the ongoing config-migration work from feature #3 without requiring a full runtime migration.

---

## WorkItem — Unified Data Model

All providers normalize their data to this shape before returning to the frontend:

```js
{
  id: string,           // original ID ("ABC-123", "#456", "12345")
  provider: string,     // "jira" | "azure" | "github" | "linear" | ...
  title: string,
  status: string,       // normalized: "active" | "new" | "resolved" | "closed" | "other"
  priority: 1|2|3|4,    // 1=critical/highest, 2=high, 3=medium, 4=low
  type: string,         // "bug" | "task" | "story" | "epic" | "other"
  url: string,          // direct link to item in the tool
  project: string,      // project name or key
  sprint?: string,      // current sprint name (if available)
  assignee: string,     // assignee display name
  updatedAt: Date,
  _priorityScore?: number,  // computed by AI scoring
  _staleDays?: number,      // computed by stale detector
}
```

---

## Config Schema (Current)

Stored in `data/devops-config.json`:

```json
{
  "organization": "azure-org-name",
  "pat": "azure-pat-token",
  "email": "user@company.com",
  "activityDays": 14,
  "projects": [
    { "id": "...", "name": "Project", "abbreviation": "PRJ", "color": "#e94560" }
  ],
  "jira": {
    "enabled": true,
    "host": "https://mycompany.atlassian.net",
    "email": "user@company.com",
    "apiToken": "...",
    "projects": ["ABC", "XYZ"]
  },
  "providers": {
    "jira": {
      "enabled": true,
      "host": "https://mycompany.atlassian.net",
      "email": "user@company.com",
      "apiToken": "...",
      "projects": ["ABC", "XYZ"]
    }
  },
  "ai": {
    "priorityWeights": {
      "staleness": 2,
      "priority": { "p1": 25, "p2": 15, "p3": 8, "p4": 2 },
      "typeBug": 15,
      "typeEpic": -5,
      "statusActive": 10
    },
    "staleThresholds": {
      "warning": 5,
      "stale": 14
    }
  }
}
```

---

## `fetchAllItems()` — Merge Logic

`server.js` merges Azure DevOps and Jira items:

1. Fetch Azure assigned items → collect IDs into a `Set`
2. Fetch Jira assigned items
3. Fetch Azure activity (last N days) → skip if ID already in Set
4. Fetch Jira activity → skip if ID already in Set
5. Compute priority score for every item
6. Return merged array

This deduplication prevents the same item appearing twice if it shows up in both "assigned" and "activity" queries.

---

## Provider Priority Order

| Priority | Provider | API | Auth | Status |
|---|---|---|---|---|
| 1 | Azure DevOps | REST | PAT | ✅ Stable (V1) |
| 2 | Jira | REST v3 | API Token | ✅ Implemented |
| 3 | GitHub Issues | REST v3 / GraphQL | PAT | 📋 Next |
| 4 | GitLab | REST / GraphQL | PAT | 📋 Planned |
| 5 | Linear | GraphQL | API Key | 📋 Planned |
| 6 | Asana | REST | OAuth/PAT | 📋 Backlog |
| 7 | Trello | REST | API Key | 📋 Backlog |
| 8 | ClickUp | REST | API Key | 📋 Backlog |
| 9 | Notion | REST | Bearer | 📋 Backlog |
| 10 | YouTrack | REST | Bearer | 📋 Backlog |
