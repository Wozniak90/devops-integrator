# AI Features

DevOps Integrator includes three layers of AI/smart features — no external LLM required for the core ones.

---

## Tier 0 — Smart Algorithms (No LLM)

These run entirely in `server.js` — no internet connection, no external services.

### Priority Score

Every item gets a score from 0–100 based on weighted factors:

| Factor | Points | Notes |
|---|---|---|
| Staleness | `days × weight` (max 30) | How long since last update |
| Priority P1 | 25 | Configurable |
| Priority P2 | 15 | Configurable |
| Priority P3 | 8 | Configurable |
| Priority P4 | 2 | Configurable |
| Type: Bug | +15 | Configurable |
| Type: Epic | -5 | Configurable |
| Status: Active | +10 | Configurable |

**UI:** Each item shows a colored pill `⚡N`:
- 🔴 Score ≥ 70 — high urgency
- 🟡 Score 40–69 — medium
- 🟢 Score < 40 — normal

**Configuration:** Click `🤖 AI` in the header → adjust weights → Save.

**API:** `GET /api/ai/config`, `POST /api/ai/config`, `POST /api/ai/config/reset`

---

### Stale Item Detector

Items that haven't moved in N days get a visual warning:

| State | Default threshold | Visual |
|---|---|---|
| ⚠️ Warning | 5 days | Yellow card border |
| 🧊 Stale | 14 days | Red card border |

**Configuration:** Same `🤖 AI` modal → Stale thresholds section.

---

## MCP Server — App as AI Data Source

The most powerful AI integration: expose your task data to any AI assistant via the Model Context Protocol.

### Setup

The MCP server runs as a separate `node` process. Register it in your AI client config:

**GitHub Copilot CLI** (`~/.copilot/mcp.json`):
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

**Claude Desktop / Cursor** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "devops-integrator": {
      "command": "node",
      "args": ["/path/to/devops-integrator/mcp-server.mjs"]
    }
  }
}
```

### Available MCP Tools (12)

| Tool | Description | Example prompt |
|---|---|---|
| `get_my_tasks` | All assigned items from all providers | "What are my open tasks today?" |
| `get_task_detail` | Detail + comments for one item | "What's the status of ABC-123?" |
| `get_stale_items` | Items stagnating > N days | "What have I had stuck for a while?" |
| `get_sprint_items` | Items in current sprint | "What's in this sprint?" |
| `search_tasks` | Full-text search across all providers | "Find tasks about migration" |
| `get_activity` | My recent activity | "What did I work on this week?" |
| `add_note` | Add personal note to item | "Add a note to ABC-123: waiting for QA" |
| `get_standup` | Generate standup content | "Prepare my daily standup" |
| `get_priority_tasks` | Top items by priority score | "What should I focus on today?" |
| `get_overdue_items` | Items past due date | "What's overdue?" |
| `summarize_workload` | Workload summary stats | "How many open items do I have?" |
| `get_task_comments` | Comments for a specific item | "Show me the comments on JIRA-456" |

### Practical Usage Examples

Once MCP is registered, you can ask your AI assistant:

> *"Prepare my standup — what did I do yesterday and what's on for today?"*

The AI calls `get_activity(days=1)` + `get_my_tasks()` → generates the standup without any copy-pasting from 5 different tools.

> *"What should I focus on this afternoon?"*

The AI calls `get_priority_tasks()` → returns top items ranked by priority score.

---

## Tier 1 — Local LLM (Ollama) — Planned

After installing [Ollama](https://ollama.ai) locally, additional AI features unlock (no data leaves your machine):

| Feature | Description |
|---|---|
| Ticket Summarizer | Right-click item → "Summarize" → 3-bullet summary from comments |
| Daily Briefing | "☀️ Today's briefing" button → AI-generated prioritized plan |
| Standup Generator | "📋 Standup" → yesterday/today/blockers pre-filled |
| Natural Language Search | "Show high priority stuck bugs" → translates to filters |
| Comment Sentiment | Detect frustration / "waiting for you" in comments |

Recommended model: `llama3.2:3b` (2 GB RAM, fast) or `mistral:7b` (higher quality, 4 GB).

---

## Tier 2 — Cloud LLM (OpenAI / Claude) — Planned

Optional opt-in with explicit data warning. Planned features:
- Cross-provider relationship intelligence
- AI prioritization with user context
- Automatic tagging across providers
