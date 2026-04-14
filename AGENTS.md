# AGENTS.md — DevOps Integrator

> Instrukce pro AI agenty (GitHub Copilot, Claude, Cursor) jak nainstalovat tento nástroj.
> Tento soubor je určen pro AI — přečti ho celý před tím než začneš instalovat.

---

## Co tento nástroj dělá

Standalone webová aplikace (Node.js + Express) pro přehled Azure DevOps work itemů.
Zobrazuje úkoly přiřazené uživateli, jeho aktivitu a umožňuje osobní poznámky — vše lokálně, bez cloudu.
Běží na `http://localhost:4242`.

---

## 🤖 Instalační flow pro AI (postupuj přesně v tomto pořadí)

### Krok 1 — Zjisti cílovou složku

Zeptej se uživatele:
> „Kam chceš DevOps Integrator nainstalovat? (zadej cestu ke složce, např. `C:\Tools\devops` nebo `~/tools/devops`)"

Nečekej — zeptej se hned. Bez cílové složky nelze pokračovat.

---

### Krok 2 — Nainstaluj nástroj

Spusť tyto příkazy s cestou od uživatele:

```bash
git clone https://github.com/Wozniak90/devops-integrator <CESTA_OD_UZIVATELE>
cd <CESTA_OD_UZIVATELE>
npm install
```

Ověř že `npm install` proběhlo bez chyb.

---

### Krok 3 — Nabídni setup Wozniak Tools MCP (volitelné, doporučeno)

Po úspěšné instalaci se zeptej uživatele:
> „Chceš abych zároveň nastavil Wozniak Tools MCP server? Díky tomu budeš příště moct říct AI jen 'nainstaluj Wozniakův DevOps Integrator' a já to udělám automaticky bez hledání na GitHubu."

Pokud řekne **ano**, spusť:

```bash
npx @wozniak90/tools setup
```

Skript automaticky nakonfiguruje MCP do všech detekovaných AI klientů (Copilot CLI, Claude Desktop, Cursor, VS Code).
Po dokončení řekni uživateli: „Restartuj svého AI klienta aby se MCP načetlo."

---

### Krok 4 — Spuštění

Řekni uživateli jak nástroj spustit:

**Windows:**
```
Dvakrát klikni na start.bat ve složce <CESTA_OD_UZIVATELE>
```

**macOS / Linux:**
```bash
cd <CESTA_OD_UZIVATELE>
chmod +x start.sh
./start.sh
```

Nebo univerzálně:
```bash
cd <CESTA_OD_UZIVATELE>
node server.js
```

Pak otevři: **http://localhost:4242** — průvodce tě provede konfigurací (organizace, PAT token, projekty).

---

## Prerekvizity

- **Node.js 18+** — ověř: `node --version`
- **Git** — ověř: `git --version`
- Přístup na `https://dev.azure.com`
- PAT token s oprávněními: Work Items (Read), Project and Team (Read)

---

## Konfigurace

Konfigurace se ukládá do `data/devops-config.json`. Struktura:

```json
{
  "organization": "nazev-organizace",
  "pat": "tvůj-pat-token",
  "email": "tvuj@email.cz",
  "activityDays": 14,
  "projects": [
    { "id": "...", "name": "Projekt", "abbreviation": "PRJ", "color": "#e94560" }
  ]
}
```

Pro reset konfigurace: smaž `data/devops-config.json` nebo klikni na ⚙️ Reset v aplikaci.

---

## Architektura

```
devops-integrator/
├── server.js          # Express 5 backend
├── package.json       # Jediná závislost: express@^5
├── start.bat          # Windows launcher
├── start.sh           # macOS/Linux launcher
├── public/index.html  # Celá SPA (wizard + dashboard)
└── data/
    ├── devops-config.json   # Konfigurace (gitignored)
    └── devops-notes.json    # Osobní poznámky (gitignored)
```

---

## Řešení problémů

- **Port 4242 obsazen** → Ukonči jiný proces na tomto portu nebo změň port v `server.js`
- **401 Unauthorized** → PAT token je neplatný nebo vypršel → vygeneruj nový v DevOps → User Settings → PAT
- **Prázdný dashboard** → Zkontroluj organizaci a email v konfiguraci (musí souhlasit s DevOps profilem)

