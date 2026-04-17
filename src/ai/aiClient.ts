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
import { classifyTask } from "./taskClassifier";
import { judgeEdits } from "./judge";
import { Orchestrator } from "../agent/orchestrator";
import { resolveProviderRouting } from "./providerRouter";

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
  /** Called with human-readable progress updates during orchestrated (multi-agent) tasks. */
  onProgress?: (status: string) => void;
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
  return `You are VertexAgent, an autonomous AI coding assistant running inside VS Code.

## CODE QUALITY — ALWAYS REQUIRED
Write complete, production-ready code with:
- ✅ All imports and pinned dependencies (requirements.txt / package.json)
- ✅ Specific exception handling — NO bare \`except Exception\`
- ✅ Structured JSON logging configurable via ENV
- ✅ Input validation with early return / raise
- ✅ Type hints (Python) / strict TypeScript types
- ✅ Docstrings / JSDoc for all public functions and classes
- ✅ Unit tests (pytest / jest) for every new piece of logic
- ✅ Secrets ONLY from environment variables — NEVER hardcoded

## SECURITY — ABSOLUTELY FORBIDDEN
- ❌ Hardcoded API keys, passwords, tokens in code
- ❌ \`eval()\`, \`exec()\`, unsanitised user input in shell commands
- ❌ \`pickle\` for untrusted data, \`yaml.load()\` without explicit Loader

Correct: \`api_key = os.environ["API_KEY"]\` — never: \`api_key = "sk-abc123"\`

## DEPENDENCIES
Always produce a pinned dependency file:
\`\`\`txt requirements.txt
fastapi==0.111.0
pydantic==2.7.1
\`\`\`

## ERROR HANDLING
\`\`\`python
# CORRECT — specific exceptions, structured logging
try:
    result = data_service.process(payload)
except ValidationError as exc:
    logger.error("Validation failed", extra={"errors": exc.errors(), "payload": payload})
    raise HTTPException(status_code=422, detail=exc.errors()) from exc

# WRONG — too broad, no context, no re-raise
try:
    result = data_service.process(payload)
except Exception as e:
    print(f"Error: {e}")
\`\`\`

## LOGGING
\`\`\`python
import logging, os

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
# WRONG: logging.basicConfig(level=logging.INFO) at module scope in a library
\`\`\`

## INTENT RECOGNITION (CRITICAL)

**First determine what the user wants:**

1. **CODE TASKS** (refactoring, implementation, analysis, bug fixes) → ALWAYS output code blocks, NEVER DELETE or mkdir
2. **FOLDER CREATION ONLY** (no files) → \`\`\`bash\\nmkdir -p dirname\\n\`\`\`
3. **FILE / FOLDER DELETION** (only when the user explicitly says "delete file X" / "rm X") → \`\`\`bash filepath\\nDELETE\\n\`\`\`
   ⚠️ "Remove pytest from requirements.txt" or "delete line 3" is NOT file deletion — use diff format!

## FILE OPERATIONS

### CODE TASKS (HIGHEST PRIORITY)
For "Refactor X", "Create file X with code Y", "Implement Y" — ALWAYS output code blocks, NEVER DELETE.

### FILE DELETION (only for explicit "delete file/folder X" or "rm X")
\`\`\`bash filepath
DELETE
\`\`\`

### REMOVE A LINE / ENTRY FROM A FILE (e.g. "remove pytest from requirements.txt")
Use diff format — show only the changed lines plus 1-2 context lines:
\`\`\`txt filepath
line_before
- line_to_remove
line_after
\`\`\`

### CREATE FOLDER ONLY
\`\`\`bash
mkdir -p dirname
\`\`\`

## CONTEXT
- Project memory: ${memoryContext}

## RULES
1. Production-ready code: error handling, logging, validation, tests
2. Code block format: \`\`\`language filepath
3. Relative paths only (e.g. src/main.py)
4. All imports, functions, classes fully implemented
5. Type hints / strict types always
6. Docstrings / JSDoc for all public APIs
7. Every new piece of logic gets unit tests
8. Secrets exclusively from environment variables
9. Code and comments in English; user-facing explanations in German
10. Clean Code, SOLID, DRY — lint-compliant (black/ruff for Python, eslint/prettier for TS)

## RESPONSE FORMAT
1. One-line explanation (German)
2. Code block(s) — complete, production-ready
3. Test file(s) for new logic
4. Dependency file if new packages added

## DIFF FORMAT (CRITICAL for editing existing files)
When the user wants to add, change, or remove a line — use diff format:
- Lines starting with \`+\` = ADDED (shown in green)
- Lines starting with \`-\` = REMOVED (shown in red)
- Lines without prefix = unchanged context (MUST match the original file content exactly)

**NEVER output line numbers (e.g. "1: ", "2: ") in your response!**
**NEVER output the full file content when a diff is sufficient!**

**Example 1:** "Remove pytest from requirements.txt" (file contains flask, pytest, requests):
\`\`\`txt requirements.txt
flask==3.0.0
- pytest==7.4.3
requests==2.31.0
\`\`\`

**Example 2:** "Remove fastapi and add numpy" (file contains fastapi, requests):
\`\`\`txt requirements.txt
- fastapi==0.111.0
+ numpy==1.26.0
requests==2.31.0
\`\`\`

New lines MUST use \`+\` prefix — without it the line will NOT be added!
NEVER use DELETE when the user only wants to remove a line or entry!

## NO SIMULATED LOOPS
Give EXACTLY ONE response per request. NEVER write:
- "The change was not applied correctly, let me fix it..."
- "Attempt 2:", "Retry:", "Correction:"
- Multiple code blocks for THE SAME file in sequence

One code block per file — done. No self-correction, no repetition.
`;
}

function buildCommandOnlySystemPrompt(): string {
  return `You are a Bash command generator. Output ONLY safe, executable Bash commands.

## FORMAT
Commands inside a single \`\`\`bash code block:

\`\`\`bash
set -euo pipefail
mkdir -p src/components
touch src/components/Button.tsx
\`\`\`

## SECURITY — STRICT ALLOWLIST
Allowed (filesystem, read-only inspection):
- \`mkdir -p\`, \`touch\`, \`echo ... >\`, \`cp\`, \`cat\`, \`ls\`, \`find\`, \`pwd\`
- \`git init\`, \`git add\`, \`git commit\`, \`git status\`, \`git log\`

Not allowed without explicit user request:
- \`rm\`, \`mv\` (destructive) — only if explicitly asked, then with \`-i\` flag
- \`curl\`, \`wget\`, \`pip install\`, \`npm install\` — only if explicitly asked
- \`chmod\`, \`chown\`, \`sudo\` — forbidden
- \`eval\`, \`$()\` substitution with user input — forbidden

## MANDATORY RULES
1. Every script starts with \`set -euo pipefail\` — fail fast, no silent errors
2. Relative paths only — never absolute paths like \`/home/user/...\`
3. Idempotent commands (\`mkdir -p\` not \`mkdir\`)
4. No explanations outside the code block
5. No secrets, API keys, or passwords in commands — use environment variables`;
}

/**
 * Lean system prompt for simple/trivial tasks (~400 tokens vs ~1400 for full prompt).
 * Skips elaborate error handling / logging / testing code examples to save tokens.
 * The diff-format section is preserved because even simple tasks need it for file edits.
 */
function buildSimpleSystemPrompt(memoryContext: string): string {
  return `You are VertexAgent, an autonomous AI coding assistant inside VS Code.

## QUALITY
Write complete, production-ready code with correct imports, error handling, type hints, and relative paths.
Secrets ONLY from environment variables — NEVER hardcoded. No \`eval()\` or \`exec()\`.

## INTENT RECOGNITION
1. **CODE TASKS** → code blocks with full implementation, NEVER DELETE or mkdir
2. **FOLDER CREATION ONLY** → \`\`\`bash\\nmkdir -p dirname\\n\`\`\`
3. **FILE DELETION** (only explicit "delete file X" or "rm X") → \`\`\`bash filepath\\nDELETE\\n\`\`\`
4. **EDIT A LINE / ENTRY** → diff format (NOT DELETE!)

## DIFF FORMAT (for changes to existing files)
\`\`\`txt requirements.txt
flask==3.0.0
- pytest==7.4.3
+ pytest==8.1.0
requests==2.31.0
\`\`\`
Lines with \`+\` = added, \`-\` = removed, no prefix = unchanged context.
NEVER output line numbers! NEVER output the full file when a diff is enough!

## CONTEXT
- Project memory: ${memoryContext}

## RULES
1. Code block format: \`\`\`language filepath
2. Relative paths only (e.g. src/main.py)
3. Code and comments in English; user-facing explanations in German
4. Exactly ONE response per request — no repetition, no "Attempt 2:"
`;
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

  private async consumeClaudeStream(
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
        if (!line.startsWith("data:")) continue;

        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;

        const parsed = ProviderAdapter.parseClaudeStreamChunk(data);
        if (parsed.done) return { content, usage };

        if (typeof parsed.token === "string" && parsed.token.length > 0) {
          content += parsed.token;
          onToken?.(parsed.token);
        }

        if (parsed.usage) {
          usage = {
            ...usage,
            ...parsed.usage,
            total_tokens: (usage?.prompt_tokens ?? parsed.usage.prompt_tokens ?? 0) +
              (usage?.completion_tokens ?? 0) +
              (parsed.usage.completion_tokens ?? 0),
          };
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

    // 3. Classify task complexity (zero tokens — pure regex heuristic)
    const deleteIntentForClassifier = isDeleteIntent(prompt);
    const commandOnlyIntent = isCommandOnlyIntent(prompt);
    const classified = classifyTask(prompt, foundFiles, commandOnlyIntent, deleteIntentForClassifier);
    console.log(
      `[AiClient] Task classified: complexity=${classified.complexity}, score=${classified.score}, ` +
      `needsJudge=${classified.needsJudge}, signals=[${classified.signals.join(", ")}]`
    );

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

    // 4. Build context and select system prompt
    // Token optimization: simple/trivial tasks use a lean ~550-token prompt instead of 2162.
    const memory = new MemoryEngine();
    const recentMemory = memory.recent(20);
    const memoryContext = recentMemory.length > 0 ? recentMemory.join(" | ") : "keine";

    const systemPrompt = commandOnlyIntent
      ? buildCommandOnlySystemPrompt()
      : classified.complexity === "complex"
        ? buildDefaultSystemPrompt(memoryContext)
        : buildSimpleSystemPrompt(memoryContext);

    const providerConfig = { provider, serverUrl, serverPort, apiKey, useAccessToken, accessToken };

    // ── Orchestrator routing (Phase 2) ───────────────────────────────────────
    // Activated for complex tasks (score >= 4) when the orchestrator is enabled.
    // The orchestrator handles planner → parallel coders → judge internally;
    // the regular single-call path is bypassed entirely.
    const orchestratorEnabled = config.get<boolean>("orchestratorEnabled", true);
    const multiAgentForOllama = config.get<boolean>("multiAgentForOllama", false);

    if (
      classified.needsOrchestrator &&
      orchestratorEnabled &&
      !stream && // orchestrator is always synchronous
      !(provider === "ollama" && !multiAgentForOllama)
    ) {
      console.log("[AiClient] Routing to Orchestrator (score=%d)", classified.score);
      const routing = resolveProviderRouting(config, providerConfig);
      const orchestrator = new Orchestrator(routing);
      return orchestrator.planAndExecute(prompt, enrichedPrompt, foundFiles, classified, {
        maxSubAgents: config.get<number>("maxSubAgents", 3),
        autoWriteTests: config.get<boolean>("autoWriteTests", true),
        judgeEnabled: config.get<boolean>("judgeEnabled", true),
        judgeMinConfidence: config.get<number>("judgeMinConfidence", 0.7),
        onProgress: streamOptions?.onProgress,
        memoryContext,
      });
    }
    // ── End orchestrator routing ─────────────────────────────────────────────

    // Claude streaming support added; Gemini streaming is handled by consumeGeminiStream
    const supportsStreaming = provider === "openai" || provider === "ollama" || provider === "custom" || provider === "claude";
    const stream = !!streamOptions?.onToken && supportsStreaming;

    // Token optimization: enable prompt caching for Claude on complex tasks (saves ~500 input tokens/request)
    const promptCaching = provider === "claude" && classified.complexity === "complex";

    const { url, headers, body } = ProviderAdapter.buildRequest(
      providerConfig,
      enrichedPrompt,
      systemPrompt,
      { temperature: commandOnlyIntent ? 0.0 : 0.2, stream, promptCaching }
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
      } else if (provider === "claude") {
        const streamResult = await this.consumeClaudeStream(res.body, streamOptions?.onToken);
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

    // ── Judge gate (Phase 1 quality check) ──────────────────────────────────
    // Only runs for complex tasks when judge is enabled and edits were produced.
    // Never runs in streaming mode (judge needs sync response for JSON verdict).
    // Ollama: skipped by default (too slow locally) unless multiAgentForOllama=true.
    const judgeEnabled = config.get<boolean>("judgeEnabled", true);
    const judgeMinConfidence = config.get<number>("judgeMinConfidence", 0.7);

    const shouldRunJudge =
      judgeEnabled &&
      classified.needsJudge &&
      allEdits.length > 0 &&
      !stream &&
      !(provider === "ollama" && !multiAgentForOllama);

    if (shouldRunJudge) {
      // Resolve optional judge provider (may differ from main coder)
      const judgeProviderName = config.get<string>("judgeProvider", "same");
      let judgeProviderConfig = providerConfig;

      if (judgeProviderName !== "same") {
        const judgeApiKey = config.get<string>("judgeApiKey", apiKey);
        const cloudPorts: Record<string, { url: string; port: number }> = {
          claude: { url: "https://api.anthropic.com", port: 443 },
          gemini: { url: "https://generativelanguage.googleapis.com", port: 443 },
          openai: { url: "https://api.openai.com", port: 443 },
        };
        const cloudConfig = cloudPorts[judgeProviderName];

        judgeProviderConfig = {
          provider: judgeProviderName,
          serverUrl: cloudConfig?.url ?? serverUrl,
          serverPort: cloudConfig?.port ?? serverPort,
          apiKey: judgeApiKey,
          useAccessToken,
          accessToken,
        };
      }

      console.log(
        `[AiClient] Running judge for ${allEdits.length} edit(s) ` +
        `(complexity=${classified.complexity}, score=${classified.score}, provider=${judgeProviderConfig.provider})`
      );

      const verdict = await judgeEdits(allEdits, prompt, providerConfig, {
        judgeProvider: judgeProviderConfig,
      });

      if (!verdict.approved && verdict.confidence >= judgeMinConfidence && verdict.issues.length > 0) {
        console.log(`[AiClient] Judge rejected — issues: ${verdict.issues.join("; ")}`);
        console.log("[AiClient] Triggering single retry with issue constraints");

        const retryPrompt =
          `${enrichedPrompt}\n\n` +
          `⚠️ Code-Review hat folgende Probleme gefunden:\n` +
          `${verdict.issues.map(i => `- ${i}`).join("\n")}\n\n` +
          `Liefere NUR die gefixten Diffs. Beachte alle genannten Probleme.`;

        const retryReq = ProviderAdapter.buildRequest(providerConfig, retryPrompt, systemPrompt, {
          temperature: 0.1,
          stream: false,
        });

        try {
          const retryRes = await request(retryReq.url, {
            method: "POST",
            headers: retryReq.headers,
            body: JSON.stringify(retryReq.body),
          });

          if (retryRes.statusCode >= 200 && retryRes.statusCode < 300) {
            const retryJson = (await retryRes.body.json()) as any;
            const { content: retryRaw, usage: retryUsage } = ProviderAdapter.parseResponse(providerConfig, retryJson);
            const retryDedup = deduplicateChatCodeBlocks(retryRaw);
            const retryEdits = [...extractCodeBlocksAsEdits(retryDedup), ...extractFileWriteEdits(retryDedup)];

            // Apply same post-processing as the original path
            for (const edit of retryEdits) {
              if (edit.newContent && edit.newContent !== "DELETE") {
                edit.newContent = edit.newContent
                  .replace(/&gt;/g, ">")
                  .replace(/&lt;/g, "<")
                  .replace(/&amp;/g, "&");
              }
            }

            if (retryEdits.length > 0) {
              const retryNotes = extractMemoryNotes(retryDedup);
              if (retryNotes.length > 0) { memory.append(retryNotes); }

              const combinedUsage: TokenUsage | undefined = retryUsage
                ? {
                    prompt_tokens: (usage?.prompt_tokens ?? 0) + (retryUsage.prompt_tokens ?? 0),
                    completion_tokens: (usage?.completion_tokens ?? 0) + (retryUsage.completion_tokens ?? 0),
                    total_tokens: (usage?.total_tokens ?? 0) + (retryUsage.total_tokens ?? 0),
                  }
                : usage;

              console.log("[AiClient] Retry produced", retryEdits.length, "edit(s) — using retry result");
              return {
                message: retryDedup,
                usage: combinedUsage,
                edits: retryEdits,
                memoryNotes: retryNotes.length > 0 ? retryNotes : undefined,
              };
            }
          }
        } catch (retryErr) {
          console.warn("[AiClient] Retry request failed — returning original result:", retryErr);
        }
      } else {
        console.log(`[AiClient] Judge approved (confidence=${verdict.confidence.toFixed(2)})`);
      }
    }
    // ── End judge gate ───────────────────────────────────────────────────────

    return { message: deduplicatedContent, usage, edits, memoryNotes };
  }
}

export async function sendChatRequest(prompt: string, streamOptions?: ChatStreamOptions): Promise<AgentResponse> {
  const client = new AiClient();
  return client.sendChat(prompt, streamOptions);
}
