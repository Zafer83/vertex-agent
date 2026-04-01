/**
 * VertexAgent – AiClient
 * Bindet den lokalen llama.cpp Server (OpenAI-kompatibel) als Backend für den Agenten ein.
 * Copyright (c) VertexLabs – Zafer Kılıçaslan
 * www.vertexlabs.de
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { request } from "undici";
import { AgentPayload, AgentResponse as AgentResponseType } from "../agent/types";
import { ProviderAdapter } from "./providerAdapter";
import { MemoryEngine } from "../agent/memoryEngine";

export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface AgentEdit {
  filePath: string;
  newContent: string;
}

export interface AgentResponse {
  message: string;
  usage?: TokenUsage;
  edits?: AgentEdit[];
  memoryNotes?: string[];
}

export interface ChatStreamOptions {
  onToken?: (token: string) => void;
}


/**
 * Detects whether the user intent is a LINE-LEVEL edit (e.g., "lösche zeile 3").
 * Line-level edits must NOT trigger the file-deletion path — they are handled
 * via the standard diff format (- line_to_remove).
 */
function isLineEditIntent(input: string): boolean {
  const text = input.toLowerCase();
  return (
    /\bzeile\b/.test(text) ||
    /\bzeilen\b/.test(text) ||
    /\bline\b/.test(text) ||
    /\blines\b/.test(text) ||
    /\bzeile\s*\d+/.test(text) ||
    /\bline\s*\d+/.test(text) ||
    /\bin\s+\S+\.\S+/.test(text)  // "in datei.ext" pattern — editing inside a file
  );
}

function isDeleteIntent(input: string): boolean {
  const text = input.toLowerCase();

  // Line-level edits are NOT file deletions
  if (isLineEditIntent(input)) {
    return false;
  }

  // Content-level edits: removing a package/line/entry from a file
  if (/\bin\s+\S+\.\S+/.test(text)) {
    return false;
  }

  const hasDeleteKeyword = (
    text.includes("lösche") ||
    text.includes("löschen") ||
    text.includes("delete") ||
    text.includes("remove") ||
    text.includes("entferne") ||
    text.includes("entfernen") ||
    /\brm\b/.test(text)
  );

  if (!hasDeleteKeyword) {
    return false;
  }

  // Require an explicit file/folder keyword OR an rm command for file-level deletion.
  // Bare filenames alone (e.g. "lösche pytest==7.4.3") are NOT sufficient —
  // version numbers like "7.4.3" would false-positive as filenames.
  const hasExplicitFileTarget = (
    /\b(datei|file|ordner|folder|directory|verzeichnis)\b/.test(text) ||
    /\brm\s+(-rf?\s+)?[a-zA-Z0-9._/-]+/.test(text)
  );

  return hasDeleteKeyword && hasExplicitFileTarget;
}

function isCommandOnlyIntent(input: string): boolean {
  const text = input.toLowerCase();

  if (isDeleteIntent(input)) return false;

  
  const codingSignals = [
    // Frameworks & Libraries
    "django", "flask", "fastapi", "react", "vue", "angular", "svelte", "nextjs", "next.js",
    "express", "nestjs", "spring", "laravel", "rails",
    // Languages & Keywords
    "python", "typescript", "javascript", "java", "golang", "rust", "kotlin", "swift",
    "projekt", "project", "app", "anwendung", "application", "service", "api", "backend", "frontend",
    "implementiere", "implement", "erstelle", "create", "make", "baue", "build", "schreibe", "write",
    "funktion", "function", "klasse", "class", "module", "import", "component", "komponente",
    // General coding signals
    "code", "skript", "script",
    // Intent signals    "refactor", "refactore", "analysiere", "analyse", "fixe", "fix", "bug", "fehler",
    "erkl", "explain", "warum", "why", "how it works", "beschreibung",
  ];

  if (codingSignals.some((signal) => text.includes(signal))) return false;


  const pureFilesystemTokens = [
    "mkdir",
    "touch ",
    "ordner erstellen",
    "ordner anlegen",
    "verzeichnis erstellen",
    "verzeichnis anlegen",
    "folder erstellen",
    "folder anlegen",
    "create folder",
    "create directory",
    "make folder",
    "make directory",
    "nur ordner",
    "nur verzeichnis",
  ];

  return pureFilesystemTokens.some((token) => text.includes(token));
}

function extractFolderHint(input: string): string | undefined {
  const text = input.trim();
  const patterns = [
    /(?:in dem|im|in den|into the)\s+(?:ordner|ornder|folder|directory|verzeichnis)\s+([a-zA-Z0-9._/-]+)/i,
    /(?:ordner|ornder|folder|directory|verzeichnis)\s+(?:namens\s+)?([a-zA-Z0-9._/-]+)/i,
    /\b([a-zA-Z0-9._/-]+)\s+(?:ordner|ornder|folder|directory|verzeichnis)\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].replace(/^[/\\]+/, "");
    }
  }
  return undefined;
}

function extractDeleteTarget(input: string): string | undefined {
  const text = input.trim();
  const patterns = [
    /(?:lösche|löschen|delete|remove|entferne|entfernen)\s+(?:ordner|folder|directory|verzeichnis|datei|file)\s+([a-zA-Z0-9._/-]+)/i,
    /(?:lösche|löschen|delete|remove|entferne|entfernen)\s+([a-zA-Z0-9._/-]+)/i,
    /\brm\s+(?:-rf?\s+)?([a-zA-Z0-9._/-]+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].replace(/^[/\\]+/, "");
  }
  return undefined;
}

/**
 * Extracts file paths referenced in the user prompt and reads their content
 * from the workspace. This gives the LLM the context it needs for line-level
 * edits (e.g., "lösche zeile 3 in requirements.txt").
 */
interface FileContextResult {
  contextText: string;
  foundFiles: string[];
}

async function resolveFileContext(prompt: string): Promise<FileContextResult> {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) { return { contextText: "", foundFiles: [] }; }

  const root = workspace.uri.fsPath;

  // Match file references: "in filename.ext", "datei filename.ext", or bare "filename.ext"
  const filePatterns = [
    /\bin\s+([a-zA-Z0-9._/-]+\.[a-zA-Z0-9]+)\b/gi,
    /\b(?:datei|file)\s+([a-zA-Z0-9._/-]+\.[a-zA-Z0-9]+)\b/gi,
    /\b([a-zA-Z0-9_/-]+\.[a-zA-Z0-9]{1,10})\b/g,
  ];

  const candidates = new Set<string>();
  for (const pattern of filePatterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(prompt)) !== null) {
      const candidate = m[1].trim();
      if (/^\d+\.\d+$/.test(candidate)) { continue; }
      if (candidate.includes("://")) { continue; }
      candidates.add(candidate);
    }
  }

  if (candidates.size === 0) { return { contextText: "", foundFiles: [] }; }

  const contextParts: string[] = [];
  const foundFiles: string[] = [];

  for (const fileName of candidates) {
    const fullPath = path.join(root, fileName);
    try {
      const openDoc = vscode.workspace.textDocuments.find(
        (d) => d.uri.fsPath === fullPath
      );
      let content: string;
      if (openDoc) {
        content = openDoc.getText();
      } else {
        content = await fs.promises.readFile(fullPath, "utf8");
      }

      // Determine file language for code fence
      const ext = fileName.split(".").pop() || "txt";
      const lang = ext === "py" ? "python" : ext === "ts" ? "typescript" : ext === "js" ? "javascript" : ext === "json" ? "json" : "txt";

      contextParts.push(
        `Aktueller Inhalt von \`${fileName}\`:\n\`\`\`${lang} ${fileName}\n${content}\n\`\`\``
      );
      foundFiles.push(fileName);
      console.log(`[resolveFileContext] Loaded ${fileName} (${content.split("\n").length} lines)`);
    } catch {
      console.log(`[resolveFileContext] File not found: ${fileName}`);
    }
  }

  return { contextText: contextParts.join("\n\n"), foundFiles };
}

function extractMarkdownFiles(input: string): string[] {
  const found = input.match(/\b[a-zA-Z0-9._-]+\.md\b/gi) || [];
  return Array.from(new Set(found.map((name) => name.trim())));
}

function defaultMarkdownContent(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower === "todo.md") return "# TODO\n\n- [ ] Initial task";
  if (lower === "readme.md") return "# README\n\nProject documentation.";
  if (lower === "architecture.md") return "# Project Architecture\n\nVersion 1";
  if (lower === "api.md") return "# API\n\n## Endpoints";
  if (lower === "changelog.md") return "# Changelog\n\n## Unreleased\n- Initial entry";
  return `# ${fileName.replace(/\.md$/i, "")}`;
}

function buildCreationDiffBlock(content: string): string {
  const lines = content.split("\n");
  const stat = `+${lines.length} -0`;
  const diffLines = lines.map((line) => `+ ${line}`);
  return ["```diff", stat, ...diffLines, "```"].join("\n");
}


function buildDeterministicFsCommandResponse(input: string): AgentResponse | undefined {
  // FIX: DELETE zuerst behandeln — vor isCommandOnlyIntent-Check
  if (isDeleteIntent(input)) {
    const target = extractDeleteTarget(input);
    if (!target) return undefined;

    return {
      message: `Lösche \`${target}\`:\n\`\`\`bash ${target}\nDELETE\n\`\`\``,
      edits: [{ filePath: target, newContent: "DELETE" }],
      memoryNotes: [`Deterministic DELETE for: ${target}`],
    };
  }

  if (!isCommandOnlyIntent(input)) return undefined;

  const lower = input.toLowerCase();
  const folder = extractFolderHint(input) || (lower.includes("docs") ? "docs" : undefined);
  let files = extractMarkdownFiles(input);

  const asksForAllMds =
    /allen?\s+n(ö|oe)tig(en)?\s+mds?/i.test(input) ||
    /all\s+(needed|required)\s+mds?/i.test(input) ||
    /all\s+markdown\s+files/i.test(input);

  if (asksForAllMds && folder) {
    files = Array.from(
      new Set([
        ...files,
        "README.md",
        "TODO.md",
        "ARCHITECTURE.md",
        "API.md",
        "CHANGELOG.md",
      ])
    );
  }

  if (!folder && files.length === 0) return undefined;

  const edits: AgentEdit[] = [];
  const messageParts: string[] = [];

  for (const file of files) {
    const filePath = folder ? `${folder}/${file}` : file;
    const content = defaultMarkdownContent(file);
    edits.push({ filePath, newContent: content });
    messageParts.push(`Datei \`${filePath}\` wird erstellt:\n${buildCreationDiffBlock(content)}`);
  }

  if (edits.length === 0) {
    if (folder) {
      return {
        message: `\`\`\`bash\nmkdir -p ${folder}\n\`\`\``,
        memoryNotes: [`Generated deterministic filesystem commands for: ${input.trim()}`],
      };
    }
    return undefined;
  }

  return {
    message: messageParts.join("\n\n"),
    edits,
    memoryNotes: [`Generated deterministic diff-based file plan for: ${input.trim()}`],
  };
}

// ─────────────────────────────────────────────
// SYSTEM PROMPTS
// ─────────────────────────────────────────────

function buildDefaultSystemPrompt(memoryContext: string): string {
  return `Du bist VertexAgent, ein autonomer Code-Assistent in VS Code.

## WICHTIG: PRODUKTIONSREIFEN, VOLLSTÄNDIGEN CODE SCHREIBEN
Schreibe IMMER vollständigen, produktionsreifen Code mit:
- ✅ Imports und Dependencies (mit fixierten Versionen in requirements.txt / package.json)
- ✅ Error Handling — spezifische Exceptions, KEIN bare \`except Exception\` 
- ✅ Structured Logging (JSON-Format für Produktion, konfigurierbar per ENV)
- ✅ Input Validation mit frühem Return / raise
- ✅ Type Hints (Python) / strict TypeScript-Types
- ✅ Docstrings / JSDoc für alle public Funktionen und Klassen
- ✅ Main-Funktion oder Entry Point
- ✅ Unit-Tests (pytest / jest) für jede neue Logik
- ✅ Security: Secrets NUR aus Umgebungsvariablen — KEINE hardcodierten Werte

## SECURITY — ABSOLUT VERBOTEN
- ❌ API-Keys, Passwörter, Tokens hardcodiert im Code
- ❌ \`eval()\`, \`exec()\`, unsanitierte User-Inputs in Shell-Befehlen
- ❌ \`pickle\` für untrusted data, \`yaml.load()\` ohne Loader

Richtig: \`api_key = os.environ["API_KEY"]\` — nie: \`api_key = "sk-abc123"\` 

## DEPENDENCY-MANAGEMENT
Erzeuge IMMER eine Dependency-Datei mit fixierten Versionen:
\`\`\`txt requirements.txt
fastapi==0.111.0
pydantic==2.7.1
\`\`\`
\`\`\`json package.json
{
  "dependencies": {
    "express": "4.18.2",
    "typescript": "5.3.3"
  }
}
\`\`\`

## FEHLERBEHANDLUNG — RICHTIG
\`\`\`python
# RICHTIG — spezifische Exceptions, strukturiertes Logging
try:
    result = data_service.process(payload)
except ValidationError as exc:
    logger.error("Validation failed", extra={"errors": exc.errors(), "payload": payload})
    raise HTTPException(status_code=422, detail=exc.errors()) from exc
except DataServiceError as exc:
    logger.exception("Unexpected service error")
    raise

# FALSCH — zu weit, kein Re-raise, kein Kontext
try:
    result = data_service.process(payload)
except Exception as e:
    print(f"Fehler: {e}")
\`\`\`

## LOGGING — RICHTIG
\`\`\`python
import logging, os

# RICHTIG — Level per ENV, kein basicConfig in Libraries
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter(
            '{"time":"%(asctime)s","level":"%(levelname)s","name":"%(name)s","msg":"%(message)s"}'
        ))
        logger.addHandler(handler)
    logger.setLevel(LOG_LEVEL)
    return logger

# FALSCH — basicConfig in Module-Scope
logging.basicConfig(level=logging.INFO)
\`\`\`

## TESTING
Schreibe zu jeder neuen Datei eine Test-Datei:
\`\`\`python tests/test_data_service.py
import pytest
from unittest.mock import MagicMock, patch
from src.app.services.data_service import DataService, DataServiceError

def test_process_valid_data_returns_result():
    svc = DataService()
    result = svc.process([{"id": 1, "name": "Alice"}])
    assert result is not None

def test_process_empty_input_raises():
    svc = DataService()
    with pytest.raises(ValueError, match="empty"):
        svc.process([])
\`\`\`

## INTENT-ERKENNUNG (ABSOLUT KRITISCH!)

**ZUERST: Was will der User?**

1. **CODE-AUFGABEN** (Refactoring, Implementierung, Analyse, Bugfixes):
   - "Refactore X", "Implementiere Y", "Analysiere Z", "Fixe Fehler in X"
   - "Erstelle eine Klasse/Funktion/Modul"
   - "Verbessere X", "Optimiere Y"
   → **IMMER Code-Blöcke ausgeben, NIEMALS DELETE oder mkdir!**

2. **NUR ORDNER ERSTELLEN** (keine Dateien):
   - "Erstelle Ordner X", "Mache Verzeichnis Y"
   → \`\`\`bash\\nmkdir -p ordnername\\n\`\`\`

3. **DATEI/ORDNER LÖSCHEN** (NUR wenn User explizit eine DATEI oder einen ORDNER löschen will):
   - "Lösche die Datei X", "Delete file Y", "Entferne Ordner Z"
   → \`\`\`bash filepath\\nDELETE\\n\`\`\`
   **ACHTUNG:** "Lösche pytest in requirements.txt" oder "lösche Zeile 3" ist KEIN Datei-Löschen!
   Das ist eine ZEILEN-BEARBEITUNG — verwende dafür Diff-Format mit - Prefix.

## DATEISYSTEM-OPERATIONEN

### CODE-AUFGABEN (HÖCHSTE PRIORITÄT!)
Wenn User sagt "Refactore X", "Erstelle Datei X mit Code Y", "Analysiere Z", "Implementiere Y":

**NIEMALS DELETE oder mkdir verwenden! IMMER Code-Blöcke!**

**Beispiele:**
User: "Refactore die Datei src/app/main.py so, dass alle Funktionen in Klassen ausgelagert werden"
Deine Antwort:
\`\`\`python src/app/main.py
class MainService:
    def __init__(self):
        self.logger = get_logger(__name__)
    
    def process(self, data):
        # Refactored code here
        pass
\`\`\`

User: "Erstelle die Datei /hallo.py und schreibe print('NOPE') hinein"
Deine Antwort:
\`\`\`python hallo.py
print('NOPE')
\`\`\`

User: "Analysiere den gesamten Workspace. Finde alle Dateien, die verbessert werden können"
Deine Antwort:
Ich analysiere den Workspace und finde folgende Verbesserungsmöglichkeiten:

1. **src/app/data_service.py**: Fehlende Type Hints
2. **tests/test_broken.py**: Keine Error-Handling-Tests
3. **broken_fixer.py**: Hardcodierte Werte statt Config

Soll ich diese Dateien nacheinander refactoren?

### DATEI LÖSCHEN (NUR bei explizitem "Lösche Datei/File X" oder "rm X")
\`\`\`bash filepath
DELETE
\`\`\`

### ZEILE/EINTRAG AUS DATEI ENTFERNEN (z.B. "lösche pytest in requirements.txt")
Verwende Diff-Format mit dem VOLLSTÄNDIGEN Dateiinhalt als Kontext:
\`\`\`txt filepath
bestehende_zeile_davor
- zu_entfernende_zeile
bestehende_zeile_danach
\`\`\`

### NUR ORDNER ERSTELLEN
Wenn User sagt "erstelle Ordner X" (OHNE Code/Dateien):

\`\`\`bash
mkdir -p ordnername
\`\`\`

## KONTEXT
- Projekt-Memory: ${memoryContext}

## REGELN
1. Produktionsreifer Code mit Error-Handling, Logging, Validierung, Tests
2. Code-Block Format: \`\`\`language filepath
3. Relative Pfade (z.B. src/main.py)
4. Alle Imports, Funktionen, Klassen vollständig implementieren
5. Type Hints / strict Types verwenden
6. Docstrings / JSDoc für alle public APIs
7. Jede neue Logik bekommt Unit-Tests
8. Secrets ausnahmslos aus Umgebungsvariablen
9. Code auf Englisch, Erklärungen auf Deutsch
10. Clean Code, SOLID, DRY — Linting-konform (black/ruff für Python, eslint/prettier für TS)
11. Keine Bash-Befehle außer wenn explizit gefragt oder für mkdir/DELETE

## ANTWORT-FORMAT
1. Kurze Erklärung (Deutsch)
2. Code-Block(s) — vollständig, produktionsreif
3. Test-Datei(en) falls neue Logik
4. Dependency-Datei falls neue Packages
5. Implementierungs-Details (Deutsch)

**KRITISCH - Diff-Format bei Änderungen an bestehenden Dateien:**
Wenn der User eine Zeile löschen, ändern oder hinzufügen will, verwende Diff-Format:
- Zeilen mit + am Anfang = NEU HINZUGEFÜGT (wird grün angezeigt)
- Zeilen mit - am Anfang = ENTFERNT (wird rot angezeigt)
- Zeilen ohne Präfix = unverändert (Kontext — MUSS original Dateiinhalt sein!)

**WICHTIG: Gib NIEMALS Zeilennummern (z.B. "1: ", "2: ") in deiner Ausgabe aus!**

**Beispiel 1:** User sagt "lösche pytest in requirements.txt" und die Datei enthält:
flask==3.0.0
pytest==7.4.3
requests==2.31.0

Deine Antwort:
\`\`\`txt requirements.txt
flask==3.0.0
- pytest==7.4.3
requests==2.31.0
\`\`\`

**Beispiel 2:** User sagt "lösche fastapi und füge numpy hinzu" und die Datei enthält:
fastapi==0.111.0
requests==2.31.0

Deine Antwort:
\`\`\`txt requirements.txt
- fastapi==0.111.0
+ numpy==1.26.0
requests==2.31.0
\`\`\`

**WICHTIG:** Neue Zeilen IMMER mit + Prefix! Ohne + wird die Zeile NICHT hinzugefügt!

**NIEMALS DELETE verwenden wenn der User nur eine Zeile/einen Eintrag entfernen will!**

## ABSOLUT VERBOTEN — SIMULIERTE SCHLEIFEN
Du gibst GENAU EINE Antwort pro Anfrage. Schreibe NIEMALS:
- "Die Änderung wurde nicht korrekt umgesetzt, ich korrigiere..."
- "Versuch 2:", "Erneuter Versuch:", "Korrektur:"
- Mehrere Code-Blöcke für DIESELBE Datei hintereinander

Gib EINEN Code-Block pro Datei aus — fertig. Keine Selbst-Korrektur, keine Wiederholungen.
`;
}

function buildCommandOnlySystemPrompt(): string {
  return `Du bist ein Bash-Befehl-Generator. Gib NUR ausführbare, sichere Bash-Befehle zurück.

## FORMAT
Befehle in einem \`\`\`bash Code-Block:

\`\`\`bash
set -euo pipefail
mkdir -p src/components
touch src/components/Button.tsx
\`\`\`

## SICHERHEITSREGELN — ABSOLUTES ALLOWLIST-PRINZIP
Erlaubt (Dateisystem, read-only Inspektion):
- \`mkdir -p\`, \`touch\`, \`echo ... >\`, \`cp\`, \`cat\`, \`ls\`, \`find\`, \`pwd\` 
- \`git init\`, \`git add\`, \`git commit\`, \`git status\`, \`git log\` 

Nicht erlaubt ohne explizite Anfrage:
- \`rm\`, \`mv\` (destruktiv) — nur wenn User explizit fragt, dann mit \`-i\` Flag
- \`curl\`, \`wget\`, \`pip install\`, \`npm install\` — nur wenn User explizit fragt
- \`chmod\`, \`chown\`, \`sudo\` — generell verboten
- \`eval\`, \`$()\`-Substitution mit User-Input — generell verboten

## PFLICHTREGELN
1. Jedes Skript beginnt mit \`set -euo pipefail\` — bricht bei Fehlern ab, kein stilles Scheitern
2. Relative Pfade verwenden — niemals absolute Pfade wie \`/home/user/...\` 
3. Idempotenz: Befehle müssen mehrfach ausführbar sein ohne Seiteneffekte (\`mkdir -p\` statt \`mkdir\`)
4. Keine Erklärungen außerhalb des Code-Blocks
5. Keine Secrets, API-Keys oder Passwörter in Befehlen — Umgebungsvariablen nutzen`;
}

function buildAgentSystemPrompt(payload: AgentPayload): string {
  const hasErrors = payload.errors.length > 0;
  const memoryContext = payload.memory.join(", ") || "none";

  return `You are VertexAgent, a specialized AI coding assistant running in "${payload.mode}" mode inside VS Code.

## WORKSPACE CONTEXT
- Project root: ${payload.projectContext}
- Memory notes: ${memoryContext}
${hasErrors ? `- Errors to fix:\n${payload.errors.map(e => `  • ${e}`).join("\n")}` : "- Errors: none"}

## AUTONOMOUS TESTING
After you produce code, it will be automatically tested.
${hasErrors
    ? "You have received errors from the previous iteration. Fix ALL of them before marking the task complete. Set \"continue\": true only if you expect further errors or need verification."
    : "If you expect your code may have issues or needs verification, set \"continue\": true in your JSON response."}

## RESPONSE FORMAT
Structure every response like this:
1. One short technical sentence in German
2. One or more code blocks with filepath
3. Short implementation notes in German

Code block format:
\`\`\`language filepath
// code
\`\`\`

## MEMORY NOTES
When you make an important architectural decision, include a JSON block at the END of your response:

\`\`\`json
{
  "memoryNotes": ["Used Express.js for REST API", "Implemented JWT authentication"],
  "continue": false
}
\`\`\`

## RULES
- Code first, minimal explanation
- English for all code and comments
- German for all user-facing explanations
- Relative paths only (e.g. src/main.ts)
- Follow Clean Code, SOLID, DRY
- Only comment complex algorithms
- Ensure code compiles and runs error-free`;
}

// ─────────────────────────────────────────────
// OUTPUT NORMALIZATION
// ─────────────────────────────────────────────

function normalizeCommandOnlyOutput(content: string): string {
  const raw = String(content || "").trim();
  if (!raw) {
    return "```bash\n# Keine Befehle generiert\n```";
  }

  const bashBlock = raw.match(/```(?:execute-bash|bash|sh|zsh)\s*\n([\s\S]*?)```/i);
  if (bashBlock?.[1]) {
    const commands = bashBlock[1].trim();
    return "```bash\n" + commands + "\n```";
  }

  const anyBlock = raw.match(/```[^\n]*\n([\s\S]*?)```/);
  if (anyBlock?.[1]) {
    const commands = anyBlock[1].trim();
    return "```bash\n" + commands + "\n```";
  }

  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^[-*]\s+/.test(line))
    .filter((line) => !/^(hier|note|hinweis|erklärung|explanation)\b/i.test(line));

  return "```bash\n" + lines.join("\n") + "\n```";
}

function extractFileWriteEdits(content: string): AgentEdit[] {
  const edits: AgentEdit[] = [];
  const blockRegex = /```file-write\s*\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(content)) !== null) {
    const block = (match[1] || "").trim();
    const pathMatch = block.match(/^path:\s*(.+)$/im);
    if (!pathMatch?.[1]) continue;

    const filePath = pathMatch[1].trim();
    if (!filePath || filePath.startsWith("/") || filePath.includes("..")) continue;

    const separatorIndex = block.indexOf("\n---");
    if (separatorIndex === -1) continue;

    const newContent = block.slice(separatorIndex + 4).replace(/^\n/, "");
    edits.push({ filePath, newContent });
  }

  return edits;
}


/**
 * Removes duplicate code blocks from LLM output.
 * If the LLM repeats the same file block (same filepath + same content), only the FIRST is kept.
 * Blocks for different files or with different content are always kept.
 */
function deduplicateChatCodeBlocks(content: string): string {
  const fence = "```";
  const seen = new Set<string>();
  let result = "";
  let pos = 0;

  while (pos < content.length) {
    const fenceStart = content.indexOf(fence, pos);
    if (fenceStart === -1) {
      result += content.slice(pos);
      break;
    }

    // Add text before this fence
    result += content.slice(pos, fenceStart);

    // Find the header line
    const headerEnd = content.indexOf("\n", fenceStart + 3);
    if (headerEnd === -1) {
      result += content.slice(fenceStart);
      break;
    }
    const header = content.slice(fenceStart + 3, headerEnd).trim();

    // Find closing fence (simple scan — not full nested parser, just for dedup check)
    let closePos = content.indexOf("\n" + fence, headerEnd);
    if (closePos === -1) {
      result += content.slice(fenceStart);
      break;
    }
    const blockContent = content.slice(headerEnd + 1, closePos);
    const blockEnd = closePos + 1 + fence.length;

    // Build dedup key from header + content
    const key = header + ":::" + blockContent.trim();
    if (seen.has(key)) {
      console.log(`[deduplicateChatCodeBlocks] Removing duplicate block for: ${header}`);
      // Skip this block entirely
      pos = blockEnd;
      // Also skip trailing newline
      if (content[pos] === "\n") { pos++; }
      continue;
    }
    seen.add(key);
    result += content.slice(fenceStart, blockEnd);
    pos = blockEnd;
  }

  return result;
}

function extractCodeBlocksAsEdits(content: string): AgentEdit[] {
  const edits: AgentEdit[] = [];
  const deletedPaths = new Set<string>();

  // FIX: "```bash <filepath>\nDELETE```" zuerst matchen — VOR allgemeinem Parser
  const deleteBashRegex = /```(?:bash|sh)\s+([^\n`]+)\n\s*DELETE\s*```/gi;
  let deleteMatch: RegExpExecArray | null;

  while ((deleteMatch = deleteBashRegex.exec(content)) !== null) {
    const filePath = deleteMatch[1].trim();
    if (!filePath || filePath.startsWith("/") || filePath.includes("..")) continue;
    console.log("[extractCodeBlocksAsEdits] DELETE match (bash format):", filePath);
    edits.push({ filePath, newContent: "DELETE" });
    deletedPaths.add(filePath);
  }

  // FIX: "```<filepath.ext>\nDELETE```" ohne language keyword
  const deleteNoLangRegex = /```([a-zA-Z0-9._/-]+\.[a-zA-Z0-9]+)\n\s*DELETE\s*```/gi;
  while ((deleteMatch = deleteNoLangRegex.exec(content)) !== null) {
    const filePath = deleteMatch[1].trim();
    if (deletedPaths.has(filePath)) continue;
    if (!filePath || filePath.startsWith("/") || filePath.includes("..")) continue;
    console.log("[extractCodeBlocksAsEdits] DELETE match (no-lang format):", filePath);
    edits.push({ filePath, newContent: "DELETE" });
    deletedPaths.add(filePath);
  }

  // Allgemeiner Parser für Datei-Edits (läuft nach DELETE-Check)
  // Uses stateful parsing to handle nested code fences correctly (e.g., markdown files
  // that contain code examples with their own ``` fences).
  const languageKeywords = new Set([
    "python", "javascript", "typescript", "java", "cpp", "c", "go", "rust", "ruby",
    "php", "swift", "kotlin", "scala", "bash", "sh", "shell", "json", "yaml", "yml",
    "xml", "html", "css", "scss", "sass", "sql", "markdown", "md", "txt", "plaintext",
    "jsx", "tsx", "vue", "svelte", "rs", "toml", "ini", "conf", "dockerfile", "makefile",
  ]);

  // Parse top-level code blocks with nested fence awareness
  const fenceMarker = "```";
  let searchPos = 0;

  while (searchPos < content.length) {
    const openIdx = content.indexOf(fenceMarker, searchPos);
    if (openIdx === -1) break;

    // Find end of the header line (language + filepath)
    const headerStart = openIdx + 3;
    const headerEnd = content.indexOf("\n", headerStart);
    if (headerEnd === -1) break;

    const headerLine = content.slice(headerStart, headerEnd).trim();

    // Find closing fence: must be a standalone ``` (not followed by language keyword)
    let closeIdx = -1;
    let scanPos = headerEnd + 1;
    let nestLevel = 0;

    while (scanPos < content.length) {
      const nextFence = content.indexOf(fenceMarker, scanPos);
      if (nextFence === -1) break;

      const afterFence = content.slice(nextFence + 3, nextFence + 50);
      const isClosing = /^\s*($|\n)/.test(afterFence);

      if (!isClosing) {
        // This is a nested opening fence (has language after ```)
        nestLevel++;
        scanPos = nextFence + 3;
      } else if (nestLevel > 0) {
        // This closes a nested fence
        nestLevel--;
        scanPos = nextFence + 3;
      } else {
        // This closes our top-level fence
        closeIdx = nextFence;
        break;
      }
    }

    if (closeIdx === -1) {
      // No closing fence — skip
      searchPos = headerEnd + 1;
      continue;
    }

    const codeContent = content.slice(headerEnd + 1, closeIdx);
    searchPos = closeIdx + 3;

    // Parse header: "language filepath" or just "filepath"
    const headerMatch = headerLine.match(/^(\w+)\s+(.+)$/);
    let filePath: string;

    if (headerMatch) {
      const lang = headerMatch[1].toLowerCase();
      const rest = headerMatch[2].trim();
      if (languageKeywords.has(lang) && rest) {
        filePath = rest;
      } else {
        filePath = headerLine;
      }
    } else {
      filePath = headerLine;
    }

    console.log("[extractCodeBlocksAsEdits] Found code block:", filePath);

    const trimmedUpper = codeContent.trim().toUpperCase();
    if (
      trimmedUpper === "DELETE" ||
      trimmedUpper === "<<DELETE>>" ||
      trimmedUpper === "DELETE FILE"
    ) continue;

    if (languageKeywords.has(filePath.toLowerCase())) continue;

    if (
      filePath.includes("/") ||
      /\.(ts|js|py|java|cpp|c|go|rs|tsx|jsx|vue|html|css|json|yaml|yml|md|txt|sh|rb|php|swift|kt)$/i.test(filePath)
    ) {
      if (!deletedPaths.has(filePath)) {
        console.log("[extractCodeBlocksAsEdits] Adding edit for:", filePath);
        edits.push({ filePath, newContent: codeContent });
      }
    }
  }

  console.log("[extractCodeBlocksAsEdits] Total edits extracted:", edits.length);
  return edits;
}

function extractMemoryNotes(content: string): string[] {
  const notes: string[] = [];

  const jsonBlockRegex = /```json\s*\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;

  while ((match = jsonBlockRegex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.memoryNotes && Array.isArray(parsed.memoryNotes)) {
        notes.push(...parsed.memoryNotes);
      }
    } catch {
      // ignore malformed JSON
    }
  }

  const inlineMemoryRegex = /"memoryNotes"\s*:\s*\[([\s\S]*?)\]/gi;
  let inlineMatch: RegExpExecArray | null;
  while ((inlineMatch = inlineMemoryRegex.exec(content)) !== null) {
    const listContent = inlineMatch[1];
    const stringRegex = /"((?:\\.|[^"\\])*)"/g;
    let strMatch: RegExpExecArray | null;
    while ((strMatch = stringRegex.exec(listContent)) !== null) {
      try {
        const parsed = JSON.parse(`"${strMatch[1]}"`);
        if (typeof parsed === "string" && parsed.trim().length > 0) {
          notes.push(parsed.trim());
        }
      } catch {
        // ignore malformed inline string
      }
    }
  }

  return Array.from(new Set(notes));
}

// ─────────────────────────────────────────────
// AI CLIENT
// ─────────────────────────────────────────────

export class AiClient {
  private async consumeOpenAIStream(
    body: any,
    onToken?: (token: string) => void
  ): Promise<{ content: string; usage?: TokenUsage }> {
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let usage: TokenUsage | undefined;

    for await (const chunk of body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || !line.startsWith("data:")) continue;

        const payload = line.slice(5).trim();
        if (payload === "[DONE]") {
          return { content, usage };
        }

        try {
          const json = JSON.parse(payload);
          const token = json?.choices?.[0]?.delta?.content;
          if (typeof token === "string" && token.length > 0) {
            content += token;
            onToken?.(token);
          }
          if (json?.usage) {
            usage = json.usage;
          }
        } catch {
          // Ignore malformed stream chunk.
        }
      }
    }

    return { content, usage };
  }

  private async consumeOllamaStream(
    body: any,
    onToken?: (token: string) => void
  ): Promise<{ content: string; usage?: TokenUsage }> {
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let usage: TokenUsage | undefined;

    for await (const chunk of body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        try {
          const json = JSON.parse(line);
          const token = json?.message?.content;
          if (typeof token === "string" && token.length > 0) {
            content += token;
            onToken?.(token);
          }

          if (json?.done) {
            const promptTokens = json?.prompt_eval_count;
            const completionTokens = json?.eval_count;
            if (typeof promptTokens === "number" || typeof completionTokens === "number") {
              usage = {
                prompt_tokens: promptTokens,
                completion_tokens: completionTokens,
                total_tokens: (promptTokens ?? 0) + (completionTokens ?? 0),
              };
            }
          }
        } catch {
          // Ignore malformed stream chunk.
        }
      }
    }

    return { content, usage };
  }

  async send(payload: AgentPayload): Promise<AgentResponseType> {
    const config = vscode.workspace.getConfiguration("vertexAgent");
    const serverUrl = config.get<string>("serverUrl", "http://localhost");
    const serverPort = config.get<number>("serverPort", 8080);
    const useAccessToken = config.get<boolean>("useAccessToken", false);
    const accessToken = config.get<string>("accessToken", "");

    const url = `${serverUrl.replace(/\/$/, "")}:${serverPort}/v1/chat/completions`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (useAccessToken && accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    const systemPrompt = buildAgentSystemPrompt(payload);

    const body = {
      model: "vertex-agent",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: payload.userMessage },
      ],
      stream: false,
    };

    const res = await request(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (res.statusCode < 200 || res.statusCode >= 300) {
      const text = await res.body.text();
      throw new Error(`LLM-Server Fehler (${res.statusCode}): ${text}`);
    }

    const json = (await res.body.json()) as any;

    const content =
      json?.choices?.[0]?.message?.content ?? "Keine Antwort vom Modell erhalten.";

    console.log("[AiClient] Agent response:", content.substring(0, 500));

    return {
      message: content,
      edits: json?.edits,
      memoryNotes: json?.memoryNotes,
      continue: json?.continue,
    };
  }

  async sendChat(prompt: string, streamOptions?: ChatStreamOptions): Promise<AgentResponse> {
    const config = vscode.workspace.getConfiguration("vertexAgent");
    const provider = config.get<string>("provider", "openai");
    const serverUrl = config.get<string>("serverUrl", "http://localhost");
    const serverPort = config.get<number>("serverPort", 8080);
    const apiKey = config.get<string>("apiKey", "");
    const useAccessToken = config.get<boolean>("useAccessToken", false);
    const accessToken = config.get<string>("accessToken", "");

    // 1. Deterministic fast-path (inkl. DELETE)
    const deterministicFsResponse = buildDeterministicFsCommandResponse(prompt);
    if (deterministicFsResponse) {
      const memory = new MemoryEngine();
      if (deterministicFsResponse.memoryNotes?.length) {
        memory.append(deterministicFsResponse.memoryNotes);
      }
      return deterministicFsResponse;
    }

    // 2. Resolve referenced file contents for LLM context
    const { contextText, foundFiles } = await resolveFileContext(prompt);

    let enrichedPrompt = prompt;
    if (contextText) {
      // Build a concrete diff-format example using the actual filenames found
      const diffExamples = foundFiles.map(f => {
        const ext = f.split(".").pop() || "txt";
        const lang = ext === "py" ? "python" : ext === "ts" ? "typescript" : ext === "js" ? "javascript" : ext === "json" ? "json" : "txt";
        return `\`\`\`${lang} ${f}\n[Kontext-Zeile]\n- [zu entfernende Zeile]\n+ [neue Zeile]\n[Kontext-Zeile]\n\`\`\``;
      }).join("\n");

      enrichedPrompt = `${prompt}\n\n${contextText}\n\n` +
        `ANWEISUNG: Antworte mit DIFF-FORMAT — zeige NUR die veränderten Zeilen + 1-2 Kontext-Zeilen.\n` +
        `Format:\n${diffExamples}\n` +
        `NIEMALS den kompletten Dateiinhalt ausgeben! NUR die Änderung als Diff!`;
    }

    // 3. Build context and select system prompt
    const commandOnlyIntent = isCommandOnlyIntent(prompt);
    const memory = new MemoryEngine();
    const recentMemory = memory.recent(20);
    const memoryContext = recentMemory.length > 0 ? recentMemory.join(" | ") : "keine";

    const systemPrompt = commandOnlyIntent
      ? buildCommandOnlySystemPrompt()
      : buildDefaultSystemPrompt(memoryContext);

    const providerConfig = { provider, serverUrl, serverPort, apiKey, useAccessToken, accessToken };

    const supportsStreaming = provider === "openai" || provider === "ollama" || provider === "custom";
    const stream = !!streamOptions?.onToken && supportsStreaming;

    const { url, headers, body } = ProviderAdapter.buildRequest(
      providerConfig,
      enrichedPrompt,
      systemPrompt,
      { temperature: commandOnlyIntent ? 0.0 : 0.2, stream }
    );

    const res = await request(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (res.statusCode < 200 || res.statusCode >= 300) {
      const text = await res.body.text();
      throw new Error(`LLM-Server Fehler (${res.statusCode}): ${text}`);
    }

    let rawContent = "";
    let usageData: TokenUsage | undefined;
    let json: any = undefined;

    if (stream) {
      if (provider === "ollama") {
        const streamResult = await this.consumeOllamaStream(res.body, streamOptions?.onToken);
        rawContent = streamResult.content;
        usageData = streamResult.usage;
      } else {
        const streamResult = await this.consumeOpenAIStream(res.body, streamOptions?.onToken);
        rawContent = streamResult.content;
        usageData = streamResult.usage;
      }
    } else {
      json = (await res.body.json()) as any;
      const parsed = ProviderAdapter.parseResponse(providerConfig, json);
      rawContent = parsed.content;
      usageData = parsed.usage;
    }

    const content = commandOnlyIntent ? normalizeCommandOnlyOutput(rawContent) : rawContent;
    const usage: TokenUsage | undefined = usageData;

    // Remove duplicate code blocks from chat display
    const deduplicatedContent = deduplicateChatCodeBlocks(content);

    const extractedEdits = extractCodeBlocksAsEdits(deduplicatedContent);
    const fileWriteEdits = extractFileWriteEdits(deduplicatedContent);
    // Post-process: fix common LLM output corruption
    const allEdits = [...extractedEdits, ...fileWriteEdits];
    for (const edit of allEdits) {
      if (edit.newContent && edit.newContent !== "DELETE") {
        // Strip line number prefixes that LLM copies from file context (e.g., "1: ", "12: ")
        // Also handles diff lines like "- 2: pytest==7.4.3" or "+ 5: numpy==1.26.0"
        const lines = edit.newContent.split("\n");
        const nonEmptyLines = lines.filter(l => l.trim().length > 0);
        const lineNumPattern = /^([+-]\s*)?\d+:\s/;
        const hasLineNumbers = nonEmptyLines.length > 0 && nonEmptyLines.every(l => lineNumPattern.test(l));
        if (hasLineNumbers) {
          edit.newContent = lines.map(l => l.replace(/^([+-]\s*)?\d+:\s/, "$1")).join("\n");
        }
        // Fix broken arrow functions: () = { → () => {
        edit.newContent = edit.newContent.replace(/\(\)\s*=\s*(?=[{\w'"`([])/g, "() => ");
        edit.newContent = edit.newContent.replace(/\(([^)]*)\)\s*=\s*(?=[{\w'"`([])/g, "($1) => ");
        // Fix HTML entity leakage from LLM output
        edit.newContent = edit.newContent
          .replace(/&gt;/g, ">")
          .replace(/&lt;/g, "<")
          .replace(/&amp;/g, "&");
      }
    }
    const edits: AgentEdit[] | undefined = json?.edits
      ? [...json.edits, ...allEdits]
      : allEdits.length > 0
        ? allEdits
        : undefined;

    const extractedNotes = extractMemoryNotes(content);
    const memoryNotes = json?.memoryNotes
      ? [...json.memoryNotes, ...extractedNotes]
      : extractedNotes.length > 0
        ? extractedNotes
        : undefined;

    if (memoryNotes && memoryNotes.length > 0) {
      memory.append(memoryNotes);
    }

    return { message: deduplicatedContent, usage, edits, memoryNotes };
  }
}

export async function sendChatRequest(prompt: string, streamOptions?: ChatStreamOptions): Promise<AgentResponse> {
  const client = new AiClient();
  return client.sendChat(prompt, streamOptions);
}
