# AGENTS.md — DevOps Integrator

> Instrukce pro AI agenty (GitHub Copilot, Claude, Cursor) jak nainstalovat a spustit tento nástroj.

## Co tento nástroj dělá

Standalone webová aplikace (Node.js + Express) pro přehled Azure DevOps work itemů.
Zobrazuje úkoly přiřazené tobě, tvoji aktivitu, umožňuje osobní poznámky — vše lokálně, bez cloudu.
Běží na `http://localhost:4242`.

## Prerekvizity

- **Node.js 18+** — ověř: `node --version`
- **Přístup na** `https://dev.azure.com`
- **PAT token** s oprávněními: Work Items (Read), Project and Team (Read)
- OS: Windows, macOS, Linux

## Instalace (krok za krokem pro AI)

```bash
# 1. Klonuj repo
git clone https://github.com/Wozniak90/devops-integrator
cd devops-integrator

# 2. Nainstaluj závislosti
npm install

# 3. Spusť server
node server.js
```

Na Windows lze také dvojklikem na `start.bat`.

Po spuštění otevři: **http://localhost:4242**  
Průvodce (wizard) tě provede konfigurací — zadáš organizaci, PAT token, vyber projekty.

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

## Zastavení

`Ctrl+C` v terminálu kde běží `node server.js`.

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

## Řešení problémů

- **Port 4242 obsazen** → Ukonči jiný proces na tomto portu nebo změň port v `server.js`
- **401 Unauthorized** → PAT token je neplatný nebo vypršel → vygeneruj nový v DevOps → User Settings → PAT
- **Prázdný dashboard** → Zkontroluj organizaci a email v konfiguraci (musí souhlasit s DevOps profilem)
