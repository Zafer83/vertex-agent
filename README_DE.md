# VertexAgent – Autonomer Private AI Code-Agent

**Entwickelt von VertexLabs**  
Copyright Zafer Kılıçaslan  
www.vertexlabs.de

VertexAgent ist eine VS Code Extension, die einen autonomen AI-Agenten mit Multi-Provider-Support, automatischer Fehlerkorrektur und persistentem Memory bereitstellt.

---

## Features

### Multi-Provider Support
- **Google Gemini** - Direkte API-Integration
- **Anthropic Claude** - Claude 3.5 Sonnet Support
- **OpenAI-kompatibel** - llama.cpp, LiteLLM, Ollama
- **Ollama** - Lokale Modelle ohne API Key
- **Custom** - Beliebige OpenAI-kompatible APIs

### Autonomer Agent-Loop
- **Automatisches Testen** - Code wird nach Erstellung getestet
- **Fehler-Erkennung** - VS Code Diagnostics Integration
- **Auto-Fix** - Fehler werden automatisch behoben
- **Iterative Verbesserung** - Loop bis Code fehlerfrei

### Persistentes Memory-System
- **Design-Entscheidungen** - Architektur-Notizen werden gespeichert
- **Kontext-Erhaltung** - Memory bleibt über Sessions erhalten
- **Automatische Speicherung** - memoryNotes in `.vertex/memory.json`
- **Auto-Initialisierung** - `.vertex/memory.json` wird automatisch erstellt
- **Memory-Kontext im Chat** - Letzte Notizen werden in neue Chat-Requests eingespeist

### Intelligente Code-Verarbeitung
- **Automatische Datei-Erstellung** - Code-Blöcke werden extrahiert und als Dateien angelegt
- **Multi-File Support** - Mehrere Dateien gleichzeitig erstellen
- **Non-destruktive Diff-Bearbeitung** - Diff-formatierte Änderungen werden als Patches angewendet, unberührte Zeilen bleiben erhalten
- **Auto-Dateikontext-Injektion** - Referenzierte Dateien werden automatisch gelesen und in den LLM-Kontext eingespeist
- **Intelligente Intent-Erkennung** - Unterscheidet zeilenbezogene Edits von Datei-Löschung
- **Datei-/Ordner-Löschung** - DELETE-Support für Dateien und Ordner (rekursiv)
- **Relative Pfade** - Workspace-basierte Pfadauflösung
- **Command-Only Modus** - Für Ordner-/Datei-Requests kann der Agent reine Bash-Befehle liefern
- **Sichere Bash-FS-Anwendung** - `mkdir`/`touch`/`rm -rf` aus Bash-Codeblöcken werden sicher im Workspace angewendet
- **Gehärtete Prompts** - Sicherheitsregeln, Testanforderungen und Standards für strukturiertes Logging

### Modernes UI
- **Minimalistisches Design** - Dunkles Theme mit VertexLabs-Branding
- **Sauberes Syntax-Highlighting** - Placeholder-basierter Tokenizer verhindert HTML-Artefakt-Leakage
- **Diff-Visualisierung** - Code-Blöcke zeigen +X -Y Statistiken mit Syntax-Highlighting
- **Einklappbare Code-Blöcke** - Erste 4 Zeilen sichtbar, Header anklicken zum Aufklappen
- **Command-Blöcke** - Terminal-ähnliche UI für Bash-Befehle
- **Live-Status-Feedback** - Spinner zeigt aktuelle Aktivität
- **Markdown-Rendering** - Formatierte Antworten mit Listen und Überschriften
- **Token-Tracking** - Rechtsbündige "Used Tokens:" Anzeige

### Konfigurierbare Settings
- **Provider-Auswahl** - Dropdown mit automatischer Konfiguration
- **Dynamische Felder** - UI passt sich an gewählten Provider an
- **API Key Management** - Sichere Speicherung in VS Code Settings
- **Token-Optionen** - Checkbox für optionale Authentication

---

## Installation

### Voraussetzungen
- **Node.js** >= 18
- **VS Code** >= 1.85
- **LLM Provider** (Gemini API Key, Ollama, oder llama.cpp Server)

### Setup

1. **Repository klonen:**
```bash
git clone https://github.com/vertexlabs/vertex-agent.git
cd vertex-agent
```

2. **Abhängigkeiten installieren:**
```bash
npm install
```

3. **Extension kompilieren:**
```bash
npm run compile
```

4. **Extension in VS Code laden:**
- Drücke `F5` um Debug-Modus zu starten
- Oder: Extension als `.vsix` packen: `npm run package`

---

## Konfiguration

### Provider einrichten

**Öffne Settings:**
- Klick auf ⚙️ Button im Chat
- Oder: `Cmd+Shift+P` → "VertexAgent: Einstellungen"

### Gemini API

**Provider:** Google Gemini  
**Server URL:** `https://generativelanguage.googleapis.com`  
**Server Port:** `443`  
**API Key:** Dein Gemini Key (von https://makersuite.google.com/app/apikey)

### Ollama (Lokal)

**Provider:** Ollama (lokal)  
**Server URL:** `http://localhost`  
**Server Port:** `11434`  
**API Key:** Leer lassen

**Ollama starten:**
```bash
ollama pull llama3.2
ollama serve
```

### llama.cpp (Lokal)

**Provider:** OpenAI-kompatibel  
**Server URL:** `http://localhost`  
**Server Port:** `8080`  
**Access Token verwenden:** ☐ (deaktiviert)

**llama.cpp starten:**
```bash
./server -m model.gguf -c 4096 --port 8080
```

---

## Verwendung

### Chat öffnen
- `Cmd+Shift+P` → "VertexAgent: Chat öffnen"
- Oder: Shortcut konfigurieren

### Befehle

**Code erstellen:**
```
Erstelle eine Python-Funktion die Fibonacci-Zahlen berechnet
```

**Mehrere Dateien:**
```
Erstelle ein vollständiges CLI-Tool in Python mit:
- main.py (Argument-Parsing)
- utils.py (Helper-Funktionen)
- test_main.py (Unit-Tests)
```

**Fehler beheben:**
```
Behebe die TypeScript-Fehler in src/app.ts
```

**Ordner/Datei per Command-Only:**
```
Erstelle einen Ordner docs und darin TODO.md
```
Erwartete Agent-Antwort (Beispiel):
```bash
mkdir -p docs
touch docs/TODO.md
```

**Dateien/Ordner löschen:**
```
Lösche den Ordner test_folder
```
Erwartete Agent-Antwort (Beispiel):
```bash
rm -rf test_folder
```

Diese Befehle werden als sichere Dateisystem-Aktionen im aktuellen Workspace ausgeführt.

### Live-Status

Während der Verarbeitung siehst du:
- "Thinking..."
- "Collecting context..."
- "Processing response..."
- "Writing 3 file(s)..."

---

## Architektur

### Projektstruktur

```
vertex-agent/
├── src/
│   ├── agent/
│   │   ├── loopEngine.ts        # Autonomer Agent-Loop
│   │   ├── memoryEngine.ts      # Persistentes Memory
│   │   ├── errorAnalyzer.ts     # VS Code Diagnostics
│   │   ├── contextBuilder.ts    # Projekt-Kontext
│   │   └── types.ts             # Type Definitions
│   ├── ai/
│   │   ├── aiClient.ts          # LLM Client
│   │   └── providerAdapter.ts   # Multi-Provider Support
│   ├── fs/
│   │   └── fileEditEngine.ts    # Datei-Operationen
│   ├── ui/
│   │   ├── chatPanel.ts         # Chat-Interface
│   │   └── settingsPanel.ts     # Settings-UI
│   └── extension.ts             # Extension Entry Point
├── .vertex/
│   └── memory.json              # Persistentes Memory
└── package.json
```

### Komponenten

**LoopEngine** - Orchestriert Agent-Iterationen mit Auto-Test und Fix  
**MemoryEngine** - Speichert Design-Entscheidungen persistent  
**ErrorAnalyzer** - Sammelt VS Code Diagnostics für Fehlerkorrektur  
**ProviderAdapter** - Konvertiert zwischen API-Formaten (Gemini, Claude, OpenAI)  
**FileEditEngine** - Wendet Code-Edits im Workspace an  
**ChatPanel** - Minimalistisches UI mit Markdown und Status-Feedback  

### Design-Entscheidungen

- **Provider-Adapter Pattern** - Einheitliche Schnittstelle für verschiedene LLM APIs
- **Automatische Code-Extraktion** - Regex-basiertes Parsing von Code-Blöcken
- **Persistentes Memory** - JSON-basierte Speicherung in `.vertex/`
- **VS Code Diagnostics Integration** - Nutzt native Fehler-Erkennung
- **Minimalistisches UI** - Fokus auf Funktionalität, nicht Ablenkung
- **TypeScript** - Typsicherheit für robuste Extension

---

## Entwicklung

### Kompilieren
```bash
npm run compile
```

### Watch-Modus
```bash
npm run watch
```

### Extension packen
```bash
npm run package
```

### Debugging
- Drücke `F5` in VS Code
- Extension wird in neuem VS Code Fenster geladen
- Console-Logs in "Debug Console"

---

## Testing

Siehe `TESTING.md` für die vollständige Test-Suite.

---

## Provider-Dokumentation

### Gemini Setup
Siehe `GEMINI_SETUP.md` für detaillierte Anleitung zur Gemini API Integration.

### Unterstützte Modelle

| Provider  | Modell              | Context     | Kosten    |
| -----------| ---------------------| -------------| -----------|
| Gemini    | gemini-flash-latest | 1M tokens   | Günstig   |
| Claude    | claude-3-5-sonnet   | 200k tokens | Mittel    |
| Ollama    | llama3.2            | 128k tokens | Kostenlos |
| llama.cpp | Custom              | Variable    | Kostenlos |

---

## Bekannte Probleme

- **Gemini Rate Limits** - Bei vielen Requests kann Gemini Rate-Limiting aktivieren
- **Ollama Performance** - Lokale Modelle sind langsamer als Cloud-APIs
- **Memory-Größe** - Sehr große Memory-Dateien können Performance beeinträchtigen

### Zuletzt behoben (v1.5.7-1.5.9)
- ✅ Agent interpretierte Refactor-Requests als DELETE-Operationen (behoben in v1.5.8)
- ✅ Datei-Erstellung löste DELETE statt Code-Ausgabe aus (behoben in v1.5.7-1.5.8)
- ✅ `mkdir` erstellte bei mehreren Zielpfaden nur den ersten Ordner (behoben in v1.5.9)

---

## Roadmap

- [x] Diff-Visualisierung im Chat (v1.5.0)
- [x] Datei-/Ordner-Löschung (v1.5.0)
- [x] Command-Blöcke mit Terminal-UI (v1.5.0)
- [x] Gehärtete System-Prompts mit Sicherheitsregeln (v1.5.0)
- [ ] Streaming-Support für Echtzeit-Antworten
- [ ] Git-Integration für automatische Commits
- [ ] Custom System-Prompts pro Projekt
- [ ] Workspace-spezifische Settings
- [ ] Plugin-System für Custom-Provider

---

## Lizenz

**Proprietary**  
Copyright VertexLabs – Zafer Kılıçaslan

Das VertexLabs Logo und alle VertexAgent Branding-Elemente sind proprietär.

---

## Support

**Website:** www.vertexlabs.de  
**Entwickler:** Zafer Kılıçaslan  

---
