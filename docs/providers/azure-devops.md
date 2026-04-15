# Provider: Azure DevOps

## Setup

Azure DevOps is configured through the initial setup wizard.  
See [Getting Started](../getting-started.md) for the full wizard walkthrough.

---

## Configuration Fields

| Field | Description |
|---|---|
| Organization | From `https://dev.azure.com/{organization}/...` |
| PAT Token | Personal Access Token (see below) |
| Email | Your Azure AD email — must match your DevOps profile exactly |
| Projects | Select which projects to track |
| Abbreviation | Short label shown on item badges (e.g. `iCE`) |
| Color | HEX color for the project badge |
| Activity Days | How many days back to track "My Activity" (default: 14) |

---

## Generating a PAT Token

1. Open Azure DevOps
2. Click your avatar → **User Settings** → **Personal Access Tokens**
3. **New Token**
4. Set scopes:
   - `Work Items` → **Read**
   - `Project and Team` → **Read**
5. Recommended expiry: 1 year
6. Copy the token immediately — it won't be shown again

---

## Resetting Config

Click **⚙️ Reset** in the app header, or delete `data/devops-config.json` manually.

---

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| `401 Unauthorized` | PAT expired or wrong scopes | Generate a new PAT in DevOps → User Settings |
| Empty dashboard | Wrong email in config | Email must match your Azure AD profile exactly |
| Missing projects | Project not selected during setup | Run `⚙️ Reset` → re-configure |
| Port 4242 busy | Another process running | Kill the process or change port in `server.js` |

---

## Technical Notes

### WIQL Queries
Work item queries run in parallel across all projects (`Promise.all`).  
IDs are collected into a `Set` — no duplicates even if an item appears in multiple projects.  
Then a single batch fetch via `_apis/wit/workitems?ids=...` (cross-project, max 200 items).

### Correct Priority Field
Use `Microsoft.VSTS.Common.Priority` — **not** `Microsoft.VSTS.Scheduling.Priority` (that returns 400).

### Comments API
`_apis/wit/workItems/{id}/comments?api-version=7.1-preview.3`  
The `-preview.3` suffix is required.
