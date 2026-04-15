# API Reference

All endpoints are served by `server.js` on `http://localhost:4242`.

---

## Setup Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/setup/status` | Config status, Node.js version, port info |
| `POST` | `/api/setup/verify` | Verify Azure PAT + org, returns project list |
| `POST` | `/api/setup/save` | Save Azure DevOps config |
| `POST` | `/api/setup/reset` | Delete config (triggers wizard on next open) |

---

## Work Item Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/devops/items` | All items — Azure + Jira merged |
| `GET` | `/api/devops/items?refresh=1` | Force cache bypass |
| `GET` | `/api/devops/config` | Current config (PAT masked) |
| `GET` | `/api/devops/comments?id=X&project=Y` | Azure DevOps comments for item |
| `GET` | `/api/devops/notes` | All personal notes |
| `POST` | `/api/devops/notes` | Save or delete a note |

### `POST /api/devops/notes` body
```json
{ "id": "12345", "text": "My note here" }
```
Send `"text": ""` to delete the note.

---

## Jira Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/jira/config` | Jira config (token masked as `"***"`) |
| `POST` | `/api/jira/save` | Save Jira config |
| `POST` | `/api/jira/test` | Test Jira credentials |
| `POST` | `/api/jira/disable` | Temporarily disable Jira |
| `DELETE` | `/api/jira/config` | Remove Jira config entirely |

### `POST /api/jira/save` body
```json
{
  "host": "https://mycompany.atlassian.net",
  "email": "user@company.com",
  "apiToken": "my-token",
  "projects": ["APP", "INT"],
  "keepToken": false
}
```

Set `keepToken: true` (and omit or leave `apiToken` empty) to preserve the existing stored token when updating other fields.

### `POST /api/jira/test` body
```json
{
  "host": "https://mycompany.atlassian.net",
  "email": "user@company.com",
  "apiToken": "my-token"
}
```

### `POST /api/jira/test` response (success)
```json
{
  "ok": true,
  "user": "Jakub Wozniak",
  "projects": [
    { "key": "APP", "name": "Demo App" },
    { "key": "INT", "name": "Internal Tools" }
  ]
}
```

---

## AI Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/ai/config` | Current AI weights and thresholds |
| `POST` | `/api/ai/config` | Update AI weights/thresholds |
| `POST` | `/api/ai/config/reset` | Reset to default values |

### `POST /api/ai/config` body
```json
{
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
```

---

## MCP Server

The MCP server runs as a separate process (`mcp-server.mjs`) and exposes the dashboard data to AI assistants.

See [AI Features](ai-features.md) for the full list of MCP tools.

**Registration in `~/.copilot/mcp.json`:**
```json
{
  "mcpServers": {
    "devops-integrator": {
      "command": "node",
      "args": ["C:/path/to/devops-integrator/mcp-server.mjs"]
    }
  }
}
```
