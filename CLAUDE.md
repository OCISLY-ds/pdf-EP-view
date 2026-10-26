# CLAUDE.md

Chrome-Extension (Manifest V3) **"PDF Link Opener for the EP"**. Sie öffnet oder lädt alle PDFs (v. a. Änderungsanträge/Amendments) eines Berichts des Europäischen Parlaments. Veröffentlicht im Chrome Web Store (Link in `README.md`), Quellcode: https://github.com/OCISLY-ds/pdf-EP-view. Version: siehe `manifest.json`.

Verwandt: **https://check-some-votes.eu** (Abstimmungen und Reden aller MEPs, Quellcode lokal in `../check_some_votes`). Das Popup verlinkt im Footer dorthin, die `README.md` ebenfalls.

## Dateien

| Datei | Zweck |
|---|---|
| `manifest.json` | MV3. Rechte: `activeTab`, `storage`, Host `https://www.europarl.europa.eu/*`. Content-Script auf `/doceo/**/document/*.html` |
| `popup.html` | Popup (640 px breit). Nur Markup, **kein** `<style>`-Block, alles Styling in `styles.css` |
| `popup.js` | Logik des Popups (kein Build, keine Dependencies) |
| `content-script.js` | Fügt auf EP-Dokumentseiten den Button "Download all amendments" ein |
| `styles.css` | Styling des Popups, Montserrat per `@font-face` |
| `ep_unsplash.jpg` | Popup-Hintergrund, 1280×960 (2× für 640×400), ~165 KB |
| `Montserrat-Latin.woff2` | Montserrat (variabel, wght 100–900), Latin-Subset, ~37 KB |
| `logo.png` | Logo im Popup, 180×100 (2× für 90×50 px) |
| `icon16/48/128.png` | Toolbar-/Store-Icons, quadratisch |
| `github-mark.png` | GitHub-Icon im Popup, 32×32 (angezeigt mit 16 px) |
| `pdf-lib.min.js` | **Wird nirgends verwendet** (525 KB), siehe "Offene Punkte" |
| `design/` | Originale/Quellen (8 MB Foto, volle TTF), in `.gitignore`, **nicht ausliefern** |
| `releases/` | Alte Release-ZIPs, in `.gitignore` |

## Funktionsweise

### Popup (`popup.js`)
- `#urlInput`: wird mit der URL des aktiven Tabs vorbelegt, Rahmen grün bei EP-URL, sonst rot (`validateUrlInput`).
- `#docNumberInput`: kommagetrennte Dokument-IDs. `convertDocNumberToUrl()` baut daraus `https://www.europarl.europa.eu/doceo/document/A-10-2025-0044_<LANG>.html`. Unterstützt `A10-0044/2025` und `RC-B10-0324/2025(/REV1)`. Dokument-IDs haben Vorrang vor der URL.
- `#languageSelect`: 24 EU-Sprachen (Standard DE), wird in `chrome.storage.local` gespeichert (`selectedLanguage`). `adjustUrlLanguage()` tauscht `_XX.html` in der URL, `filterPdfLinks()` filtert auf `-NNN_<LANG>.pdf`. Im geschlossenen Dropdown stehen nur Flagge und Kürzel, beim Öffnen die vollen Namen (`updateLanguageSelectDisplay` / `showFullLanguageNames`).
- Ablauf: Seite per `fetch` laden, `a[href$=".pdf"]` sammeln, auf EP-Hosts beschränken (`sanitizeUrl`), filtern. Ohne Häkchen **"Download Reports"** nur Amendments (genau 3 Ziffern vor `_<LANG>.pdf`), mit Häkchen alle PDFs (`filterCheckboxState`).
- Mehr als 5 PDFs: Bestätigungsdialog (`showConfirmationDialog`).
- **Open all PDFs**: `chrome.tabs.create` je PDF. **Download all PDFs**: programmatischer Klick auf `<a download>`.
- Bei mehreren Dokument-IDs wird 500 ms zwischen den Dokumenten gewartet (`processUrlsForAction`).

### Content-Script (`content-script.js`)
Läuft auf `document_idle` in allen Frames der EP-Dokumentseiten. `tryInsert()` sucht den Amendments-Dropdown (`#esDropdownAMDButton`, danach Heuristiken) und setzt Button plus "Include report"-Checkbox daneben. Findet es nichts, startet ein `MutationObserver` (250 ms Debounce, maximal 15 s) und nach 4 s greift `insertFallbackFloatingButton()`: Toolbar oben in `main > .container-fluid > .row`, sonst schwebender Button unten rechts (nur im Top-Frame). Gelesen werden `selectedLanguage`, `filterCheckboxState`, `includeReports` (nur Content-Script).

## Regeln beim Ändern

- **Host-Check immer exakt** mit `isEpUrl()` (https, `europarl.europa.eu` oder `*.europarl.europa.eu`). Kein `hostname.includes(...)`: das lässt `europarl.europa.eu.evil.com` durch.
- Die **Filterlogik steht doppelt** (`filterPdfLinks` in `popup.js` und `content-script.js`) und muss synchron bleiben.
- `getElementById(...)` auf eine nicht existierende ID wirft auf Top-Level und beendet das ganze Skript. IDs in `popup.html` und `popup.js` abgleichen.
- Styles nur in `styles.css`. Kein `<style>`-Block mehr in `popup.html` (war ein Duplikat).
- Bilder in Anzeigegröße ausliefern (Retina = 2×). Manifest-Icons müssen quadratisch sein. Originale gehören nach `design/`, nicht ins Paket.
- Neue Zeichen außerhalb Latin (U+0020–017F, gängige Satzzeichen) brauchen ein neues Font-Subset:
  ```bash
  python3 -m fontTools.subset design/Montserrat-VariableFont_wght.ttf --unicodes="U+0020-007E,U+00A0-00FF,U+0100-017F,U+2013-2014,U+2018-201E,U+2022,U+2026,U+2190-2193" --flavor=woff2 --output-file=Montserrat-Latin.woff2
  ```
- Fremde Daten nur per `textContent` einfügen, nie per `innerHTML`.

## Testen

Keine automatisierten Tests. Manuell: `chrome://extensions` → Entwicklermodus → **Load unpacked** → diesen Ordner, Popup öffnen (Rechtsklick → Untersuchen für die Konsole) und eine EP-Dokumentseite wie `https://www.europarl.europa.eu/doceo/document/A-10-2025-0049_EN.html` laden, um das Content-Script zu prüfen.

Ohne Chrome lässt sich das Popup in einem normalen Browser testen: `popup.html` mit einem Stub-Skript vor `popup.js` (stellt `window.chrome` mit `runtime.getManifest`, `tabs.query/create`, `storage.local` und ein gemocktes `fetch` bereit), per `python3 -m http.server` ausliefern. Das Content-Script braucht nur `chrome.storage.local`.

`www.europarl.europa.eu` antwortet auf `curl` mit **403** (Bot-Schutz), die Seiten sind also nur im Browser prüfbar.

## Release-Paket

Nur Laufzeitdateien packen (kein `design/`, `releases/`, `pdf-lib.min.js`, `.DS_Store`, kein `__MACOSX`). Das ZIP war früher durch das 8-MB-Foto und die TTF-Datei rund 8,6 MB groß, jetzt unter 300 KB:

```bash
zip releases/release-X.Y.Z.zip manifest.json popup.html popup.js styles.css content-script.js logo.png icon16.png icon48.png icon128.png github-mark.png ep_unsplash.jpg Montserrat-Latin.woff2 LICENSE
```

Vorher `version` in `manifest.json` erhöhen.

## Offene Punkte

- **Nicht committet:** `ep_unsplash.jpg`, `Montserrat-Latin.woff2`, `github-mark.png`, `logo.png`, `icon16/48/128.png` sind neu bzw. untracked. Das Repo auf GitHub referenziert sie, enthielt sie aber nie, ein Klon hat also kaputten Hintergrund, Schrift und Icons. `git add` nicht vergessen.
- **`pdf-lib.min.js`** (525 KB) ist in keiner Datei referenziert, steckte aber in jedem Release-ZIP. Entfernen, wenn bestätigt unbenutzt.
- **Download im Popup** nutzt `<a download>` auf EP-URLs. Ob Chrome das für Extension-Seiten mit `host_permissions` zuverlässig als Download behandelt (statt zu navigieren), ist hier nicht in echtem Chrome geprüft. Falls nicht: `chrome.downloads.download` plus Berechtigung `downloads` (löst beim Update eine neue Berechtigungsabfrage aus).
- Download-Dateinamen sind `document_N.pdf` / `doc_N.pdf` (Index statt Amendment-Nummer, bei mehreren Berichten nummeriert Chrome neu durch).
- Toter Code: `insertAboveElement`, `findTopProcedureContainer` im Content-Script, `updateLanguageDisplay` und der `#icon`-Handler in `popup.js`. Die Handler für "Open" und "Download" sind in `popup.js` fast doppelt.
- Oberflächentexte sind gemischt (Popup Englisch, Content-Script-Dialoge Deutsch).
