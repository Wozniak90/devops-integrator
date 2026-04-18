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

## Provider Management Endpoints (Generic)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/providers` | List manageable providers and configuration status |
| `GET` | `/api/providers/:providerId/config` | Read provider config (secrets masked) |
| `POST` | `/api/providers/:providerId/config` | Create or replace provider config |
| `PATCH` | `/api/providers/:providerId/config` | Update provider config partially |
| `DELETE` | `/api/providers/:providerId/config` | Remove provider config |
| `POST` | `/api/providers/:providerId/test` | Validate provider credentials/connectivity |

### `GET /api/providers` response
```json
{
  "ok": true,
  "providers": [
    {
      "id": "jira",
      "name": "Jira",
      "icon": "🟦",
      "configured": true,
      "enabled": true
    }
  ]
}
```

### `POST /api/providers/jira/config` body (create/replace)
```json
{
  "host": "https://mycompany.atlassian.net",
  "email": "user@company.com",
  "apiToken": "my-token",
  "projects": ["APP", "INT"],
  "projectColors": { "APP": "#0052cc" },
  "enabled": true
}
```

### `PATCH /api/providers/jira/config` body (partial update)
```json
{
  "host": "https://mycompany.atlassian.net",
  "projects": ["APP", "INT"],
  "keepToken": true
}
```

Set `keepToken: true` to preserve the currently stored provider secret(s) when omitting token fields.

### `GET /api/providers/jira/config` response (configured)
```json
{
  "ok": true,
  "providerId": "jira",
  "configured": true,
  "config": {
    "enabled": true,
    "host": "https://mycompany.atlassian.net",
    "email": "user@company.com",
    "apiToken": "***",
    "projects": ["APP", "INT"],
    "projectColors": { "APP": "#0052cc" }
  }
}
```

### `POST /api/providers/jira/test` response (success)
```json
{
  "ok": true,
  "providerId": "jira",
  "displayName": "Jakub Wozniak",
  "projects": [
    { "key": "APP", "name": "Demo App" },
    { "key": "INT", "name": "Internal Tools" }
  ]
}
```

### Error response contract
```json
{ "error": "Unknown provider 'foo'", "code": "PROVIDER_NOT_FOUND" }
```

Common status codes:

- `400` invalid provider config payload (`INVALID_PROVIDER_CONFIG`)
- `401` provider authentication failed (`PROVIDER_AUTH_FAILED`)
- `404` provider or provider config not found (`PROVIDER_NOT_FOUND`, `PROVIDER_CONFIG_NOT_FOUND`)
- `500` provider connectivity/runtime error (`PROVIDER_TEST_FAILED`)

---

## Jira Endpoints (Backward-Compatible Aliases)

The following endpoints are preserved for the existing UI and route internally through the generic provider-management layer:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/jira/config` | Alias for Jira config read (token masked) |
| `POST` | `/api/jira/save` | Alias for Jira config save (`keepToken` supported) |
| `POST` | `/api/jira/test` | Alias for Jira credential test |
| `POST` | `/api/jira/disable` | Disable Jira config without deleting credentials |
| `DELETE` | `/api/jira/config` | Alias for Jira config delete |

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
