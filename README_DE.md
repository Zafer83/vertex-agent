# VertexAgent — Autonomer Private AI Code-Agent

**Entwickelt von VertexLabs**
Copyright Zafer Kılıçaslan
www.vertexlabs.de

VertexAgent ist eine VS Code Extension für autonomes AI-Coding mit Multi-Provider-Support, nicht-destruktiver Dateibearbeitung, persistentem Memory und einem gehärteten Sicherheitsmodell — für Entwickler, die volle Kontrolle über ihr AI-Tooling wollen.

---

## Warum VertexAgent?

| Feature | VertexAgent | GitHub Copilot | Cursor | Continue.dev |
|---|---|---|---|---|
| 100% lokal / air-gapped | ✅ | ❌ | ❌ | ✅ |
| Eigenes Modell einbinden | ✅ | ❌ | teilweise | ✅ |
| Nicht-destruktive Diff-Edits | ✅ | ❌ | ❌ | ❌ |
| API Keys im OS-Schlüsselbund | ✅ | n/a | ❌ | ❌ |
| Persistentes Session-Memory | ✅ | ❌ | ❌ | ❌ |
| Duplikat-Schutz bei Edits | ✅ | ❌ | ❌ | ❌ |
| CSP-konformes Webview | ✅ | n/a | n/a | n/a |
| Kein Telemetrie | ✅ | ❌ | ❌ | teilweise |

---

## Features

### Multi-Provider LLM Support
- **Google Gemini** — Direkte API-Integration (`gemini-2.0-flash-latest`, 1M Kontext)
- **Anthropic Claude** — Claude 3.5 Sonnet / Claude 3 Haiku
- **OpenAI-kompatibel** — llama.cpp, LiteLLM, jeder OpenAI-kompatible Server
- **Ollama** — Lokale Modelle, kein API Key nötig
- **Custom** — Beliebige OpenAI-kompatible Endpoints mit optionalem Bearer Token

### Nicht-destruktive Dateibearbeitung
- **Intelligente Diff-Erkennung** — Unterscheidet echte Diffs von Markdown-Listen anhand von Kontext-Zeilenabgleich
- **Patch-Anwendung** — `applyDiffPatch()` wendet Änderungen chirurgisch an; unberührte Zeilen werden nie modifiziert
- **Automatische Erkennung impliziter Additions** — Zeilen, die nicht im Original vorhanden sind, werden automatisch als Hinzufügungen behandelt, auch ohne `+`-Prefix
- **Deduplizierung** — Identische Edits für dieselbe Datei werden nur einmal angewendet, auch wenn das LLM sie mehrfach ausgibt
- **Vollständiger Ersatz als Fallback** — Nicht-Diff-Inhalt ersetzt die Datei atomar

### Intelligente Intent-Erkennung
- **Zeilen-Edit vs. Datei-Löschen** — "lösche zeile 3 in requirements.txt" → Diff; "lösche datei X" → DELETE
- **Versionsnummern-Schutz** — `7.4.3` wird nie als zu löschender Dateiname interpretiert
- **Content-Edit-Erkennung** — "entferne flask aus requirements.txt" löst keine Dateilöschung aus
- **Command-only Modus** — Ordner-/Dateistruktur-Anfragen liefern saubere Bash-Befehle (`mkdir`, `touch`)

### Automatische Dateikontext-Injektion
- Referenzierte Dateien werden automatisch gelesen und als konkretes Diff-Format-Template in den LLM-Prompt eingebettet
- Das Template enthält den echten Dateinamen — LLMs folgen konkreten Beispielen zuverlässiger als abstrakten Anweisungen
- Dateikontext wird in passende Code-Fences eingebettet, damit das LLM den Inhaltstyp korrekt versteht

### Persistentes Memory-System
- Design-Entscheidungen und Architektur-Notizen bleiben über Sessions in `.vertex/memory.json` erhalten
- Die letzten 20 Memory-Einträge werden in jeden neuen Chat-Request eingespeist
- Auto-Initialisierung — kein manuelles Setup nötig

### Gehärtete System-Prompts
- Explizites Verbot von simulierten Korrektur-Schleifen ("Versuch 2:", "Erneuter Versuch:")
- Konkrete Diff-Beispiele mit `requirements.txt` Anwendungsfällen
- Sicherheitsregeln: keine hardcodierten Secrets, kein `eval()`, kein unsicheres YAML-Laden
- Logging-Standards: JSON-Format, kein `basicConfig` in Libraries
- Typanforderungen: Python Type Hints, strict TypeScript Types

### Streaming für alle Provider
- Token-für-Token Live-Rendering für Gemini, Claude, OpenAI-kompatibel und Ollama
- Dateien werden auf Disk geschrieben, sobald ihre Code-Blöcke vollständig sind — kein Warten auf die komplette Antwort

### Modernes Chat-UI
- **Diff-Visualisierung** — `+` Zeilen grün, `-` Zeilen rot, `+N -M` Statistik im Header
- **Placeholder-basiertes Syntax-Highlighting** — Zweiphasiger Tokenizer mit nicht-druckbaren Platzhaltern verhindert HTML-Artefakt-Leakage
- **Einklappbare Code-Blöcke** — Erste 4 Zeilen sichtbar, Klick zum Aufklappen
- **CSP-konform** — Keine inline `onclick`-Handler; Event Delegation
- **Duplikat-Block-Unterdrückung** — Wenn das LLM einen Code-Block wiederholt, wird nur der erste angezeigt
- **Command-Blöcke** — Terminal-ähnliche UI für Bash-Befehle
- **Markdown-Rendering** — Listen, Überschriften, Inline-Code
- **Token-Tracking** — "Used Tokens:" Zähler pro Antwort

### Sicherheitsmodell
- **API Keys im OS-Schlüsselbund** — `vertexAgent.apiKey` und `vertexAgent.accessToken` nutzen VS Code `"secret": true` (OS Keychain / Credential Manager, niemals Klartext in `settings.json`)
- **Kein Telemetrie** — Keine Daten werden weitergeleitet außer an den konfigurierten LLM-Provider
- **Air-Gap-fähig** — Funktioniert vollständig offline mit Ollama oder llama.cpp
- **Sichere Pfad-Auflösung** — `toSafeRelativePath()` blockiert Path Traversal (`../`) und absolute Pfade
- **Workspace-beschränkte Schreibzugriffe** — Alle Dateioperationen sind auf das geöffnete Workspace-Root beschränkt
- **CSP-konformes Webview** — Kein `eval()`, keine Inline-Scripts, nur Event Delegation

---

## Installation

### Voraussetzungen
- **Node.js** >= 18
- **VS Code** >= 1.85
- **LLM Provider** — Gemini API Key, Ollama, llama.cpp oder OpenAI-kompatibler Server

### Via VSIX (Empfohlen)
1. `vertex-agent-x.x.x.vsix` von der [Releases-Seite](https://github.com/Zafer83/vertex-agent/releases) herunterladen
2. In VS Code: `Extensions` → `...` → `Install from VSIX...`

### Aus dem Quellcode
```bash
git clone https://github.com/Zafer83/vertex-agent.git
cd vertex-agent
npm install
npm run compile
# F5 in VS Code drücken um Debug-Instanz zu starten
```

---

## Konfiguration

Einstellungen öffnen: ⚙️ Button im Chat oder `Cmd+Shift+P` → "VertexAgent Settings".

### Google Gemini
| Einstellung | Wert |
|---|---|
| Provider | `gemini` |
| Server URL | `https://generativelanguage.googleapis.com` |
| Server Port | `443` |
| API Key | Dein Key von [makersuite.google.com](https://makersuite.google.com/app/apikey) |

### Ollama (Lokal, Kostenlos)
| Einstellung | Wert |
|---|---|
| Provider | `ollama` |
| Server URL | `http://localhost` |
| Server Port | `11434` |
| API Key | *(leer lassen)* |

```bash
ollama pull llama3.2
ollama serve
```

### llama.cpp (Lokal, Kostenlos)
| Einstellung | Wert |
|---|---|
| Provider | `openai` (kompatibel) |
| Server URL | `http://localhost` |
| Server Port | `8080` |

```bash
./server -m model.gguf -c 4096 --port 8080
```

### Anthropic Claude
| Einstellung | Wert |
|---|---|
| Provider | `claude` |
| Server URL | `https://api.anthropic.com` |
| Server Port | `443` |
| API Key | Dein Anthropic Key |

---

## Verwendung

### Grundlegende Code-Aufgaben
```
Erstelle eine Python-Funktion die E-Mail-Adressen per Regex validiert
```
```
Refactore src/app.ts auf async/await statt Callbacks
```
```
Fixe die TypeScript-Fehler in src/utils.ts
```

### Dateibearbeitung mit Diffs
```
Lösche die pytest-Zeile aus requirements.txt
```
```
Füge numpy==1.24.0 nach requests in requirements.txt hinzu
```
Der Agent gibt einen Diff (`-` / `+`) aus und wendet ihn als Patch an — keine andere Zeile wird verändert.

### Multi-File Projekte
```
Erstelle eine komplette REST API mit FastAPI:
- src/main.py (App Entrypoint)
- src/routes/users.py (User Endpoints)
- src/models/user.py (Pydantic Models)
- tests/test_users.py (pytest Tests)
- requirements.txt
```

### Datei- & Ordner-Verwaltung
```
Erstelle Ordnerstruktur: src/components, src/hooks, src/utils
```
```
Lösche das Verzeichnis old_tests
```

---

## Architektur

```
vertex-agent/
├── src/
│   ├── agent/
│   │   ├── loopEngine.ts        # Autonomer Agent-Loop
│   │   ├── memoryEngine.ts      # Persistentes Memory
│   │   ├── errorAnalyzer.ts     # VS Code Diagnostics
│   │   └── contextBuilder.ts    # Projekt-Kontext
│   ├── ai/
│   │   ├── aiClient.ts          # LLM Client, Intent-Erkennung, Diff-Logik
│   │   └── providerAdapter.ts   # Multi-Provider API-Adapter
│   ├── fs/
│   │   └── fileEditEngine.ts    # Nicht-destruktive Dateioperationen
│   ├── ui/
│   │   ├── chatPanel.ts         # Chat Webview (CSP-konform)
│   │   └── settingsPanel.ts     # Einstellungs-UI
│   └── extension.ts             # Extension Einstiegspunkt
├── tests/
│   └── unit/
│       └── bugfix-regression.test.js  # 61 Regressionstests
├── .vertex/
│   └── memory.json              # Persistentes Session-Memory
└── package.json
```

---

## Roadmap

### Abgeschlossen ✅
- [x] Multi-Provider LLM Support (Gemini, Claude, OpenAI, Ollama, Custom)
- [x] Streaming für alle Provider mit Live-Datei-Schreiben
- [x] Nicht-destruktive Diff-Bearbeitung mit `applyDiffPatch()`
- [x] Intelligente Diff vs. Markdown-Listen-Erkennung
- [x] Automatische Dateikontext-Injektion mit konkreten Diff-Templates
- [x] Persistentes Session-übergreifendes Memory
- [x] Diff-Visualisierung im Chat (+N -M, grün/rot)
- [x] Einklappbare Code-Blöcke mit Expand-Toggle
- [x] Placeholder-basierter Syntax-Highlighter (kein HTML-Artefakt-Leakage)
- [x] CSP-konformes Webview (Event Delegation, keine Inline-Scripts)
- [x] API Keys im OS-Schlüsselbund (`"secret": true`)
- [x] Schutz vor Path Traversal
- [x] Workspace-beschränkte Datei-Schreibzugriffe
- [x] Duplikat-Edit-Deduplizierung (Datei-Schreiben + Chat-Anzeige)
- [x] Intent-Unterscheidung (Zeilen-Edit vs. Datei-Löschen vs. Command-only)
- [x] LLM Self-Loop Prevention
- [x] Gehärtete System-Prompts mit Sicherheitsregeln und Beispielen
- [x] Regressions-Test-Suite (61 Assertions)
- [x] Auto-Versionsbump beim Kompilieren

### Geplant 🔧
- [ ] **Git-Integration** — Auto-Commit nach erfolgreichen Datei-Writes, Diff im Source Control Panel
- [ ] **Multi-Turn Kontext** — Vollständige Gesprächshistorie an LLM senden (aktuell zustandslos pro Request)
- [ ] **Workspace-Indexierung** — Semantische Suche über alle Projektdateien für relevante Kontext-Injektion
- [ ] **Eigene System-Prompts** — `.vertex/system-prompt.md` pro Projekt überschreibt den Standard-Prompt
- [ ] **Workspace-spezifische Settings** — `.vertex/config.json` pro Repository
- [ ] **Test-Runner-Integration** — `pytest`/`jest` nach Writes automatisch ausführen, Fehler zurück an LLM
- [ ] **Multi-File Diff-Vorschau** — Alle ausstehenden Änderungen vor dem Anwenden anzeigen
- [ ] **Undo-Support** — Letzte Agenten-Aktion über den VS Code Undo-Stack rückgängig machen
- [ ] **Plugin/Tool-System** — Eigene aufrufbare Tools (Web-Suche, DB-Abfrage, API-Calls)
- [ ] **Bild-Input** — Screenshots/Diagramme an vision-fähige Modelle senden
- [ ] **Inline Completions** — Ghost-Text-Vorschläge parallel zum Chat

### Sicherheits-Backlog 🔒
- [ ] **Rate Limiting** — Request-Budget pro Session gegen Endlosschleifen
- [ ] **Sandboxed Bash-Ausführung** — Vollständiges Sandboxing für Shell-Befehle über mkdir/touch hinaus
- [ ] **Credential-Scanning** — Secrets/API Keys im LLM-Output erkennen, bevor sie auf Disk geschrieben werden
- [ ] **Prompt-Injection-Erkennung** — Warnung wenn Dateiinhalt versucht den System-Prompt zu überschreiben
- [ ] **Audit-Log** — Append-only Log aller Dateioperationen des Agenten
- [ ] **Permission Scopes** — Read-only Modus oder Verzeichnis-Einschränkungen pro Workspace

---

## Unterstützte Modelle

| Provider | Empfohlenes Modell | Kontext | Kosten |
|---|---|---|---|
| Gemini | `gemini-2.0-flash-latest` | 1M Token | Niedrig |
| Claude | `claude-3-5-sonnet-20241022` | 200k Token | Mittel |
| Ollama | `llama3.2`, `codestral` | 128k Token | Kostenlos |
| llama.cpp | Beliebiges GGUF-Modell | Variabel | Kostenlos |
| OpenAI | `gpt-4o` | 128k Token | Hoch |

---

## Bekannte Probleme

- **LLM Diff-Compliance** — Kleinere lokale Modelle halten sich nicht immer an das Diff-Format. Die Patch-Engine fällt in diesem Fall auf vollständigen Dateiersatz zurück.
- **Gemini Rate Limits** — Starke Nutzung löst 429-Fehler aus. `gemini-flash` für niedrigere Kosten pro Request verwenden.
- **Ollama Performance** — Lokale Modelle sind bei komplexen Aufgaben deutlich langsamer als Cloud-APIs.
- **Memory-Wachstum** — Sehr große `.vertex/memory.json`-Dateien (>500 Einträge) können die Prompt-Performance beeinträchtigen.

---

## Entwicklung

```bash
npm run compile      # Versionsbump + Build
npm run watch        # Watch-Modus (kein Versionsbump)
npm run package      # .vsix für Distribution bauen
npm test             # Alle Tests ausführen
node tests/unit/bugfix-regression.test.js  # Nur Regressions-Suite
```

---

## Lizenz

**Proprietär** — Copyright VertexLabs · Zafer Kılıçaslan
Das VertexLabs-Logo und alle VertexAgent-Branding-Elemente sind proprietär.

**Website:** www.vertexlabs.de
