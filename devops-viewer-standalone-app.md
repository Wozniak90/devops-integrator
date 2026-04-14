# DevOps Viewer — standalone app

> **Kontext**: Widget Azure DevOps v dashboardu funguje výborně. Otázka: dalo by se to extrahovat jako samostatná aplikace, kterou by mohl použít kdokoli v týmu bez přístupu k celému dashboardu?

---

## Myšlenka

Stejná funkcionalita jako widget v dashboardu — ale jako **self-contained Electron nebo jednoduché webové apky** s průvodcem nastavením při prvním spuštění. Uživatel nemusí nic konfigurovat ručně v JSON — app se ho zeptá.

---

## Konfigurovací průvodce (onboarding)

Při prvním spuštění (nebo pokud chybí `devops-config.json`) se zobrazí průvodce:

### Krok 1 — Organizace
```
Jaká je tvoje Azure DevOps organizace?
Najdeš ji v URL: dev.azure.com/[TOTO]/projekt

[ innogyDevOps                    ]  ← input
```

### Krok 2 — PAT token
```
Vytvoř si Personal Access Token:
1. Jdi na dev.azure.com → User Settings → Personal Access Tokens
2. Klikni "New Token"
3. Scope: Work Items (Read), Comments (Read)
4. Zkopíruj token sem (zobrazí se jen jednou!)

[ ******************************** ]  ← password input
                              [Ověřit →]
```
Po kliknutí na Ověřit app zkusí zavolat API a potvrdí platnost tokenu.

### Krok 3 — Projekty
```
Které projekty chceš sledovat?
(Načteno z tvé organizace automaticky po ověření PAT)

☑ iCE-CREAM        barva: [■ #818cf8]  zkratka: [ICE   ]
☑ Rozvoj_B2C_CRM   barva: [■ #34d399]  zkratka: [Rozvoj]
☐ Archiv-2024      ...
```

### Krok 4 — Tvůj email
```
Zadej svůj pracovní email (musí odpovídat Azure AD):

[ jakub.wozniak@firma.cz          ]

(Používá se pro filtrování "přiřazeno mně" a "moje aktivita")
```

### Krok 5 — Hotovo
```
✅ Konfigurace uložena!

Přiřazeno mně:   5 itemů
Moje aktivita:   4 itemy (posledních 14 dní)

                              [Otevřít app →]
```

---

## Technická forma — možnosti

### Varianta A: Electron app ⭐ doporučeno
- Instalátor `.exe` / `.dmg`
- Ikona v systray — app běží na pozadí
- Notifikace při novém přiřazení
- Config uložen lokálně (`%APPDATA%/devops-viewer/config.json`)
- **Výhoda**: funguje offline (cache), systray badge, notifikace
- **Nevýhoda**: větší bundle (~80 MB), potřeba buildu

### Varianta B: Node.js + browser (stejný přístup jako dashboard)
- Jednoduchý `npm start` nebo `.bat` soubor
- Otevře se v prohlížeči na `localhost:4242`
- Config v `data/config.json` vedle app
- **Výhoda**: minimální přidaná práce — 90 % kódu lze vzít z dashboardu
- **Nevýhoda**: uživatel musí mít Node.js, spouštět terminál

### Varianta C: Webová appka (hosted)
- Deploy na Vercel/Netlify jako serverless
- PAT se zadává při každém přihlášení (nebo uloží do localStorage — bezpečnostní riziko)
- **Nevýhoda**: PAT na klientovi = bezpečnostní problém → vyžaduje backend

**→ Nejreálnější pro rychlé nasazení: Varianta B** (Node.js + browser, kód z dashboardu)

---

## Co by bylo potřeba udělat (Varianta B)

1. **Extrahovat server kód** — zkopírovat DevOps endpointy ze `server.js` do nového `devops-server.js`
2. **Extrahovat frontend** — DevOps widget HTML/CSS/JS do samostatné `index.html`
3. **Přidat setup wizard** — detekce chybějícího configu → zobrazit onboarding místo dashboardu
4. **Onboarding API** — endpoint `POST /setup` který uloží config + endpoint pro načtení seznamu projektů z org
5. **README** — instrukce: nainstaluj Node.js, `npm install`, `npm start`

Odhadovaný objem práce: **1–2 dny** (většina kódu existuje).

---

## Funkce které by standalone app zdědila

- ✅ Přiřazeno mně — 4 sloupce podle area, sort Active→New
- ✅ Moje aktivita — 2 sloupce, seřazeno podle data
- ✅ Hover tooltip s komentáři (můj + nejnovější)
- ✅ Right-click poznámky (lokální, uložené vedle app)
- ✅ Číslo itemu, state badge, priorita, sprint
- ✅ Cache 5 min, manuální refresh
- ✅ Klik na titul → otevře DevOps

## Funkce které by bylo dobré přidat navíc

| Funkce | Popis |
|--------|-------|
| **Auto-start** | Spuštění s Windows (Varianta A — Electron) |
| **Systray badge** | Počet nových přiřazených itemů od posledního zobrazení |
| **Desktop notifikace** | Upozornění při novém přiřazení (poll každých 10 min) |
| **Nastavení** | UI pro změnu konfigurace bez editace JSON |
| **Export** | Export aktuálního pohledu do CSV/clipboardu |

---

## Poznámky k bezpečnosti

- PAT token nesmí opustit lokální stroj → vždy server-side proxy
- Config soubor by měl mít omezená oprávnění (`chmod 600` na Linuxu)
- Electron: použít `safeStorage` API pro šifrování PAT v úložišti
- Neverzovat `config.json` do Gitu (`.gitignore`)

---

*Vytvořeno: 31. 3. 2026*
