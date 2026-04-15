# Filter Bar

The filter bar sits below the header and persists across dashboard re-renders.

---

## Filters

| Filter | Type | Values |
|---|---|---|
| 🔍 Search | Text input | Full-text match on item title |
| Status | Chips | Aktivní · Nové · Vyřešené · Uzavřené |
| Priority | Chips | P1 · P2 · P3 · P4 |
| Stagnation | Chips | OK · ⚠️ Warning · 🧊 Stale |
| Type | Chips | Bug · Story · Task · Epic |
| Project | Dropdown | Dynamically populated from loaded data |

All filters are combined with AND logic.

---

## Active Filter Indicator

- The header shows a count of active filters: `Filtry (3)`
- A **Vymazat** (Clear) button appears when any filter is active
- Each section heading shows `X/Y` count when filtered: `Přiřazeno mně (5/21)`

---

## Behavior

- Filters survive dashboard refresh (live outside `#app-body`)
- Clearing all filters restores the full unfiltered view
- The Project dropdown is populated from actual loaded items — only projects currently in your data appear
- Status values map across providers:

| Display | Azure DevOps | Jira |
|---|---|---|
| Aktivní | Active | In Progress |
| Nové | New | To Do |
| Vyřešené | Resolved | — |
| Uzavřené | Closed / Done / Removed | Done |

---

## Stagnation Filter

Works in combination with the [Stale Item Detector](ai-features.md):

- **OK** — updated within the warning threshold (default: 5 days)
- **⚠️ Warning** — not updated for 5–14 days
- **🧊 Stale** — not updated for 14+ days

Thresholds are configurable in `🤖 AI` → Stale thresholds.
