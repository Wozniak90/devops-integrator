# Provider: Jira

## Setup

1. Click **🟦 Jira** in the app header
2. Fill in the modal:
   - **Host URL** — e.g. `https://mycompany.atlassian.net`
   - **Email** — your Atlassian account email (must be exact — see gotchas below)
   - **API Token** — from Atlassian security settings (see below)
   - **Projects** — comma-separated project keys (e.g. `APP, INT`)
3. Click **Otestovat připojení** to verify credentials
4. Click **Uložit**

The `🟦 Jira` button turns green when Jira is active.

---

## Generating an API Token

1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click **Create API token**
3. Name it (e.g. `devops-integrator`)
4. Copy the token — it won't be shown again

---

## Configuration Fields

| Field | Description |
|---|---|
| Host URL | Full URL including `https://` — no trailing slash |
| Email | Exact Atlassian account email |
| API Token | Atlassian API token (stored locally, never sent to any server) |
| Projects | Comma-separated project keys — used to verify connection (items load from all projects you're assigned in) |

---

## Token Security UX

The API token field **never pre-fills** with the stored token.

- If a token is already saved: the field shows `••••••• (token uložen)` as placeholder
- To update other settings without changing the token: leave the field empty and click Save
  - The app sends `keepToken: true` and the server preserves the existing token
- To replace the token: enter the new token and click Save

---

## What Data Is Loaded

| Type | JQL |
|---|---|
| Assigned items | `assignee = currentUser() AND statusCategory != Done` |
| My activity | `updatedBy(currentUser()) AND updated >= YYYY-MM-DD` |

Items are merged with Azure DevOps items in `fetchAllItems()`. Deduplication is applied — the same item won't appear twice.

---

## ⚠️ API Gotchas

### Breaking Change: HTTP 410 on old search endpoint

The old endpoint is **deprecated and returns 410 Gone**:
```
GET /rest/api/3/search?jql=assignee=currentUser()  →  410 Gone
```

**Use the new endpoint:**
```http
POST /rest/api/3/search/jql
Content-Type: application/json
Authorization: Basic base64(email:apiToken)

{
  "jql": "assignee = currentUser() AND statusCategory != Done",
  "fields": ["summary", "status", "priority", "issuetype", "project", "assignee", "updated", "comment"],
  "maxResults": 50
}
```

Rules for the new endpoint:
- JQL in POST body **must NOT be URL-encoded**
- `fields` must be an **array**, not a comma-separated string
- This is implemented in `V2/providers/jira.js` → `jiraRequest()`

---

### Email must be exact

Atlassian Basic Auth uses `Base64(email:apiToken)`.  
A wrong email returns HTTP 401 with no helpful error message.

✅ Correct: `jakub.wozniak90@gmail.com` (with dot)  
❌ Wrong: `jakubwozniak90@gmail.com` (without dot)

Check your exact email at https://id.atlassian.com/manage-profile

---

### Czech (localized) Jira instances

Jira UI and status names are localized. API status names depend on the instance language:

| Status (EN) | Status (CS) |
|---|---|
| To Do | Úkoly |
| In Progress | Probíhající |
| Done | Hotovo |

This affects status transitions when creating items via the API (e.g. the seed script).

---

## Test Data — Seed Script

To populate a Jira instance with test data:

```bash
node scripts/jira-seed.mjs --host https://mycompany.atlassian.net --email user@example.com --token YOUR_TOKEN
```

Creates:
- **2 projects**: `APP` (Demo App) and `INT` (Internal Tools)
- **25 issues** total — varied types (Bug, Story, Task, Epic), priorities (Highest → Low), labels
- Some issues transitioned to In Progress or Done
- Comments added to selected issues

### Test instance (jakubwozniak.atlassian.net)

| Field | Value |
|---|---|
| Host | `https://jakubwozniak.atlassian.net` |
| Projects | `APP` (14 issues), `INT` (11 issues) |
| Email | `jakub.wozniak90@gmail.com` |
| Token name | `devops-integrator` (in Atlassian security settings) |

---

## Disabling / Removing Jira

| Action | Button | Effect |
|---|---|---|
| Disable | **Vypnout** | Sets `enabled: false` — config preserved, items won't load |
| Delete | **Smazat** | Removes entire Jira config from `devops-config.json` |
