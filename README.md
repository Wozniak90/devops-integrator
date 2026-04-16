# DevOps Integrator

A local web dashboard that aggregates your tasks from **multiple PM tools** (Azure DevOps, Jira, and more) in one place. No cloud, no accounts — runs on `localhost:4242`.

> 📚 **Full documentation:** [docs/](docs/README.md)

---

## Supported Providers

| Provider | Status |
|---|---|
| Azure DevOps | ✅ Stable |
| Jira Cloud | ✅ Implemented |
| GitHub Issues | 📋 Planned |
| GitLab | 📋 Planned |
| Linear | 📋 Planned |

## 🤖 Instalace přes AI asistenta (doporučeno)

Chceš aby AI nainstaloval nástroj za tebe? Funguje s GitHub Copilot CLI, Claude Desktop a Cursor.

**Krok 1** — Nastav MCP server (jednorázově):
```bash
npx @wozniak90/tools setup
```

**Krok 2** — Restartuj svého AI klienta.

**Krok 3** — Řekni AI:
> „Nainstaluj mi Wozniakův DevOps Integrator"

AI se tě zeptá, kam chceš nástroj nainstalovat, a pak ho stáhne a nainstaluje za tebe.

---

## Rychlý start (manuálně)

### Windows
Dvakrát klikni na `start.bat`

### macOS / Linux
```bash
chmod +x start.sh
./start.sh
```

Aplikace se automaticky otevře na **http://localhost:4242**.
Při prvním spuštění se spustí průvodce nastavením.

> `start.bat` při každém spuštění udělá čistou instalaci závislostí (`node_modules` smaže a `npm install` pustí znovu). Zajistí to kompatibilitu s aktuální verzí Node.js.

---

## Průvodce nastavením (5 kroků)

### Krok 1 — Prostředí
Automaticky ověří:
- verzi Node.js a platformu
- dostupnost serveru na portu 4242

### Krok 2 — Organizace
Zadej název organizace z URL:
`https://dev.azure.com/**{organizace}**/...`

### Krok 3 — PAT token
Osobní přístupový token z Azure DevOps.

**Jak vygenerovat:**
1. DevOps → User Settings → Personal Access Tokens → New Token
2. Scope: `Work Items (Read)` + `Project and Team (Read)`
3. Doporučená platnost: 1 rok

Po zadání token aplikace automaticky ověří připojení a načte seznam projektů.

### Krok 4 — Projekty
Ze seznamu projektů vyber ty, které chceš sledovat.
Pro každý projekt nastav:
- **Zkratka** — krátký štítek zobrazovaný u itemů (např. `iCE`, `RV`)
- **Barva** — HEX barva štítku projektu

### Krok 5 — Email a nastavení
- **Email** — tvůj Azure AD email (stejný jako v DevOps profilu); slouží k filtrování přiřazených itemů a aktivity
- **Dny aktivity** — kolik dnů zpětně se sleduje aktivita (výchozí: 14)

Konfigurace se uloží do `data/devops-config.json`.

---

## Funkce aplikace

### 👤 Přiřazeno mně
Itemy přiřazené tvému účtu, které nejsou ve stavu Closed / Done / Removed / Resolved.

- **Seskupení podle Area Path** — každá oblast má vlastní sloupec
- **Řazení** — primárně podle stavu (Active → New → Resolved → ostatní), sekundárně podle data změny
- **Volba rozložení** — lišta s tlačítky přímo nad sekcí:
  - `1 sl.` / `2 sl.` / `3 sl.` / `4 sl.` — pevný počet sloupců
  - `Auto ×2` — responzivní grid, min. šířka sloupce ~480 px
  - `Auto ×4` — responzivní grid, min. šířka sloupce ~220 px
  - Výběr se pamatuje v `localStorage`

### 💬 Moje aktivita
Posledních 10 itemů, u kterých jsi něco měnil (changedBy = tvůj email), seřazených od nejnovějšího.

- **2 sloupce** — vždy max 5 itemů na sloupec, druhý sloupec se zobrazí až po přetečení
- **Čas změny** zobrazený u každého itemu (🕐)

### 📊 Zobrazení itemu
Každý item zobrazuje:
| Prvek | Popis |
|---|---|
| Ikona typu | 🐛 Bug · 📋 Task · 📖 User Story · 🎯 Feature · ⚡ Epic · 🧪 Test Case |
| `#ID` | Číslo work itemu (kliknutím otevře v DevOps) |
| Barevný štítek | Zkratka projektu s vlastní barvou |
| State badge | `Active` (modrá) · `New` (šedá) · `Resolved` (zelená) · ostatní (žlutá) |
| Priorita | `P1` červená · `P2` oranžová · `P3` žlutá · `P4` šedá |
| Sprint | Poslední segment IterationPath |
| Čas změny | Jen v sekci "Moje aktivita" |

### 💬 Hover tooltip
Najeď myší na libovolný item — zobrazí se plovoucí tooltip se třemi sekcemi:

1. **Můj poslední komentář** (fialový) — poslední komentář přihlášeného uživatele
2. **Nejnovější komentář** (oranžový) — pouze pokud je novější než můj, zobrazí autora a datum
3. **Dashboard poznámka** (zelená) — osobní poznámka uložená lokálně (viz níže)

Tooltip se načítá přes API (komentáře), výsledky se ukládají do cache pro daný item v rámci session.

### 📝 Osobní poznámky (right-click)
Klikni pravým tlačítkem na libovolný item → otevře se modální okno:
- Napiš nebo uprav poznámku (max. 1 poznámka na item)
- **Uložit** — poznámka se uloží do `data/devops-notes.json`
- **Smazat** — poznámku odstraní (tlačítko viditelné jen pokud poznámka existuje)
- **Zrušit** — zavře bez uložení

Poznámky jsou čistě lokální, do Azure DevOps se nic neposílá.

### 🔄 Collapsible sekce
Každá sekce má v headeru tlačítko ▼/▶:
- Kliknutím sekci sbalíš/rozbalíš
- Stav sbalení se pamatuje v `localStorage`

### ↕️ Přetahování sekcí
Uchop sekci za handle **⠿** vlevo v headeru a přetáhni ji nad/pod druhou sekci — pořadí se uloží do `localStorage`.

### 🔁 Auto-refresh
Data se automaticky obnovují každých **5 minut** (pokud je aplikace otevřená).
Manuální obnovení: tlačítko **🔄 Obnovit** v pravém horním rohu.

### ⚙️ Reset konfigurace
Tlačítko **⚙️ Reset** v hlavičce — znovu spustí průvodce nastavením.
Alternativně: smaž soubor `data/devops-config.json` ručně.

---

## Technická architektura

```
devops-integrator/
├── server.js          # Express 5 backend (Node.js 18+)
├── package.json       # Jediná závislost: express@^5
├── start.bat          # Windows launcher (clean install + auto-open)
├── start.sh           # macOS/Linux launcher
├── public/
│   └── index.html     # Celá SPA — wizard + hlavní view (monolitický soubor)
└── data/
    ├── devops-config.json   # Konfigurace (PAT, org, projekty, email)
    └── devops-notes.json    # Osobní poznámky k itemům
```

### API endpointy

| Metoda | URL | Popis |
|---|---|---|
| `GET`  | `/api/setup/status` | Stav konfigurace, verze Node.js |
| `POST` | `/api/setup/verify` | Ověření PAT + org, vrátí seznam projektů |
| `POST` | `/api/setup/save`   | Uložení konfigurace |
| `POST` | `/api/setup/reset`  | Smazání konfigurace |
| `GET`  | `/api/devops/items` | Work itemy (cache, `?refresh=1` pro vynucení) |
| `GET`  | `/api/devops/config`| Konfigurace bez PAT tokenu |
| `GET`  | `/api/devops/comments?id=X&project=Y` | Komentáře k itemu |
| `GET`  | `/api/devops/notes` | Všechny poznámky |
| `POST` | `/api/devops/notes` | Uložit/smazat poznámku `{ id, text }` |

### Jak funguje deduplikace itemů
WIQL queries běží paralelně přes všechny projekty (`Promise.all`).
ID se sbírají do `Set` objektů → žádné duplicity i když se item nachází ve více projektech.
Pak jeden hromadný fetch přes `_apis/wit/workitems?ids=...` (cross-project, max 200 itemů).

### Správné pole priority
`Microsoft.VSTS.Common.Priority` — pozor, `Microsoft.VSTS.Scheduling.Priority` neexistuje a vrátí 400.

### Comments API
`_apis/wit/workItems/{id}/comments?api-version=7.1-preview.3` — suffix `-preview.3` je povinný.

---

## Požadavky

- **Node.js 18+** (testováno na v22 a v24)
- Přístup na `https://dev.azure.com`
- PAT token s oprávněními: Work Items (Read), Project and Team (Read)

## Kompatibilita

| Node.js | Express | Status |
|---|---|---|
| v24.x | express@5 | ✅ funguje |
| v22.x | express@5 | ✅ funguje |
| v18.x | express@5 | ✅ funguje |
| v24.x | express@4 | ❌ `array-flatten` crash |

> Express 4 závisí na `array-flatten`, jehož `package.json` má chybný `main` entry na Node.js v24.
> Express 5 tuto závislost neobsahuje — proto používáme `express@^5`.
