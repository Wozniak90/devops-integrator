# Getting Started

## Prerequisites

- **Node.js 18+** — verify: `node --version`
- **Git** — verify: `git --version`
- Access to at least one supported PM tool (Azure DevOps, Jira)

---

## Installation

### Option A — Via AI assistant (recommended)

If you have GitHub Copilot CLI, Claude Desktop or Cursor configured:

```bash
# One-time MCP setup:
npx @wozniak90/tools setup
# Restart your AI client, then say:
# "Install Wozniak's DevOps Integrator"
```

### Option B — Manual

```bash
git clone https://github.com/Wozniak90/devops-integrator
cd devops-integrator
npm install
```

---

## Running the App

### Windows
```bat
start.bat
```
Or double-click `start.bat` in Explorer.

### macOS / Linux
```bash
chmod +x start.sh
./start.sh
```

### Universal (any OS)
```bash
npm start
```

The app opens at **http://localhost:4242**.  
On first launch the setup wizard runs automatically.

---

## Setup Wizard (5 Steps)

### Step 1 — Environment Check
Automatically verifies Node.js version and port 4242 availability.

### Step 2 — Organization
Enter your Azure DevOps organization name from the URL:
`https://dev.azure.com/**{organization}**/...`

### Step 3 — PAT Token
Personal Access Token from Azure DevOps.

**How to generate:**
1. DevOps → User Settings → Personal Access Tokens → New Token
2. Scope: `Work Items (Read)` + `Project and Team (Read)`
3. Recommended validity: 1 year

After entering, the app verifies the connection and loads your project list.

### Step 4 — Projects
Select projects to track. For each project set:
- **Abbreviation** — short label shown on items (e.g. `iCE`, `RV`)
- **Color** — HEX color for the project badge

### Step 5 — Email & Settings
- **Email** — your Azure AD email (same as your DevOps profile)
- **Activity days** — how many days back to track activity (default: 14)

Config is saved to `data/devops-config.json`.

---

## Adding More Providers

After initial Azure DevOps setup, add additional providers from the header:

| Button | Provider |
|---|---|
| `🟦 Jira` | Jira Cloud |
| _(more coming)_ | GitHub Issues, GitLab, Linear |

See individual provider docs for setup details:
- [Azure DevOps](providers/azure-devops.md)
- [Jira](providers/jira.md)

---

## Resetting Configuration

Click **⚙️ Reset** in the header, or delete `data/devops-config.json` manually.

---

## Node.js Compatibility

| Node.js | Express | Status |
|---|---|---|
| v24.x | express@5 | ✅ works |
| v22.x | express@5 | ✅ works |
| v18.x | express@5 | ✅ works |
| v24.x | express@4 | ❌ `array-flatten` crash |

> Express 5 is used because Express 4 depends on `array-flatten` which has a broken `package.json` `main` entry on Node.js v24.
