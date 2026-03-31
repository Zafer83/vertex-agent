/**
 * VertexAgent – AiClient
 * Bindet den lokalen llama.cpp Server (OpenAI-kompatibel) als Backend für den Agenten ein.
 * Copyright (c) VertexLabs – Zafer Kılıçaslan
 * www.vertexlabs.de
 */

import * as vscode from "vscode";
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


function isDeleteIntent(input: string): boolean {
  const text = input.toLowerCase();
  return (
    text.includes("lösche") ||
    text.includes("löschen") ||
    text.includes("delete") ||
    text.includes("remove") ||
    text.includes("entferne") ||
    text.includes("entfernen") ||
    /\brm\b/.test(text)
  );
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

3. **NUR LÖSCHEN** (explizit):
   - "Lösche X", "Delete Y", "Entferne Z"
   → \`\`\`bash filepath\\nDELETE\\n\`\`\`

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

### NUR LÖSCHEN
Wenn User explizit sagt "lösche X":

\`\`\`bash filepath
DELETE
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

**KRITISCH - Diff-Format bei Änderungen:**
Bei Änderungen an bestehenden Dateien verwende Diff-Format:
- Zeilen mit + am Anfang = NEU HINZUGEFÜGT (wird grün angezeigt)
- Zeilen mit - am Anfang = ENTFERNT (wird rot angezeigt)
- Zeilen ohne Präfix = unverändert (Kontext)
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
  const codeBlockRegex = /```(?:[\w]+\s+)?([^\n`]+)\n([\s\S]*?)```/g;

  const languageKeywords = new Set([
    "python", "javascript", "typescript", "java", "cpp", "c", "go", "rust", "ruby",
    "php", "swift", "kotlin", "scala", "bash", "sh", "shell", "json", "yaml", "yml",
    "xml", "html", "css", "scss", "sass", "sql", "markdown", "md", "txt", "plaintext",
    "jsx", "tsx", "vue", "svelte", "rs", "toml", "ini", "conf", "dockerfile", "makefile",
  ]);

  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    const firstLine = match[1].trim();
    const codeContent = match[2];

    console.log("[extractCodeBlocksAsEdits] Found code block:", firstLine);

    const trimmedUpper = codeContent.trim().toUpperCase();
    // Skip blocks that are meant for deletion or are language keywords
    if (
      trimmedUpper === "DELETE" ||
      trimmedUpper === "<<DELETE>>" ||
      trimmedUpper === "DELETE FILE"
    ) continue;

    if (languageKeywords.has(firstLine.toLowerCase())) continue;

    if (
      firstLine.includes("/") ||
      /\.(ts|js|py|java|cpp|c|go|rs|tsx|jsx|vue|html|css|json|yaml|yml|md|txt|sh|rb|php|swift|kt)$/i.test(firstLine)
    ) {
      if (!deletedPaths.has(firstLine)) {
        console.log("[extractCodeBlocksAsEdits] Adding edit for:", firstLine);
        edits.push({ filePath: firstLine, newContent: codeContent });
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

    // 2. Build context and select system prompt
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
      prompt,
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

    const extractedEdits = extractCodeBlocksAsEdits(content);
    const fileWriteEdits = extractFileWriteEdits(content);
    const edits: AgentEdit[] | undefined = json?.edits
      ? [...json.edits, ...extractedEdits, ...fileWriteEdits]
      : (extractedEdits.length + fileWriteEdits.length) > 0
        ? [...extractedEdits, ...fileWriteEdits]
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

    return { message: content, usage, edits, memoryNotes };
  }
}

export async function sendChatRequest(prompt: string, streamOptions?: ChatStreamOptions): Promise<AgentResponse> {
  const client = new AiClient();
  return client.sendChat(prompt, streamOptions);
}
