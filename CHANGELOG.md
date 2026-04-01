# Changelog

## [1.7.82] - 2026-04-01

### Fixed
- **Nested Code Fence Parser** — Markdown files containing code examples (e.g., README.md with bash snippets) are no longer split into multiple broken blocks. New stateful parser with `nestLevel` tracking correctly handles nested fences.
- **MD Language Detection** — Files with `.md` extension are now always rendered as MARKDOWN, not PYTHON. New `extLangMap` corrects language based on file extension.
- **DELETE vs Line-Edit Ambiguity (Round 2)** — System prompt now explicitly instructs the LLM to use diff format for line/entry removal ("lösche pytest in requirements.txt") instead of DELETE. Added concrete diff examples to the prompt.
- **False-Positive File Deletion** — `isDeleteIntent()` no longer triggers on version numbers (e.g., `7.4.3`) or content-edit patterns ("lösche X in datei.ext"). Requires explicit file/folder keywords (`datei`, `file`, `rm`) for file-level deletion.

### Changed
- **System Prompt Hardening** — Clear separation between file deletion (requires "Datei/File/rm") and content editing (uses diff format with `-` prefix). Added worked examples for line removal in requirements.txt.
- **Code Block Extraction** — `extractCodeBlocksAsEdits()` now uses stateful fence parser matching the UI parser, preventing content loss in files with nested code fences.

## [1.7.81] - 2026-03-31

### Fixed
- **Security: API-Keys im OS-Schlüsselbund** — `vertexAgent.apiKey` und `vertexAgent.accessToken` verwenden nun `"secret": true`, sodass VS Code sie im OS-Keychain speichert statt als Klartext in `settings.json`.
- **Version-Drift bei `npm run compile`** — `bump-version.js` wurde aus dem `compile`-Script entfernt. Versionsbump erfolgt jetzt ausschließlich über `vscode:prepublish` bei Marketplace-Releases.

### Added
- **CLAUDE.md** — Projekt-Dokumentation für Claude Code mit Verzeichnisstruktur, Build-Commands, Provider-Übersicht, Konventionen und häufigen Aufgaben.

## [1.7.80] - 2026-03-31

### Fixed
- **HTML Artifact Leakage (Bug 1)** — Internal CSS classes (`class="tok-number">`) no longer leak into visible chat output. Syntax highlighter now uses a placeholder-based tokenizer that prevents cascading regex corruption. Plain text blocks (`txt`, `plaintext`, `diff`) skip highlighting entirely.
- **Token Merging / Keyword Spacing (Bug 4)** — Fixed `defcalculate_sum` rendering as single word. Root cause: `.code-line` had `display: flex` which collapsed whitespace text nodes between `<span>` elements. Added `display: block` override for agent message code lines.
- **Destructive Diff Logic (Bug 2)** — File edits no longer overwrite entire files. `FileEditEngine` now detects diff-formatted content and applies it as a non-destructive patch using `applyDiffPatch()`. Original file content is treated as source of truth.
- **Command Ambiguity — DELETE vs Line Edit (Bug 3)** — New `isLineEditIntent()` function distinguishes "lösche zeile 3 in requirements.txt" (line removal) from "lösche datei X" (file deletion). Line-level edits are routed to the LLM with diff format instead of triggering `rm -rf`.

### Added
- **Auto File Context Injection** — `resolveFileContext()` automatically reads files referenced in user prompts and injects numbered content into the LLM context. Prevents hallucination when user requests line-level edits by number.
- **Diff Patch Engine** — `isDiffContent()` and `applyDiffPatch()` methods in `FileEditEngine` for intelligent diff application with context-aware region matching and fallback strategies.

## [1.6.2] - 2026-03-31

### Added
- **Live File Writing during Streaming**
  - Files are now written immediately when code blocks are complete during streaming
  - No longer waits for entire response to finish before writing files
  - `detectCompleteCodeBlocks()` function detects complete code blocks in real-time
  - `writeFileFromStream` backend handler writes files as soon as they're detected
  - Duplicate detection prevents same file from being written multiple times

### Changed
- File writing now happens **during** streaming, not after
- User sees files appear in workspace while agent is still generating response
- Improved UX: Faster feedback, files available immediately

### Technical Details
- Frontend: `detectCompleteCodeBlocks()` uses regex to find complete \`\`\`language filepath\n...\`\`\` blocks
- Backend: `writeFileFromStream` case in message handler
- Deduplication: `writtenCodeBlocks` Set tracks already-written blocks by blockId
- blockId format: `filepath + ':' + content.substring(0, 50)`

## [1.6.1] - 2026-03-31

### Added
- **Complete Streaming Support for All Providers**
  - Gemini streaming with `streamGenerateContent` endpoint
  - Claude streaming with Server-Sent Events (SSE)
  - OpenAI/llama.cpp streaming (already working, now with error handling)
  - Ollama streaming (already working, now with error handling)


### Changed
- **Write pipeline now follows deterministic creation order**
  - Plan structure -> create folders -> create files -> write content file-by-file
  - File write status now shows per-file progress in chat

- **Status UX improvements**
  - Status bubble stays below the latest agent output
  - Localized randomized status texts (German/English based on VS Code UI language)

- **Docs synchronization**
  - Updated `README_DE.md` to match current English README feature scope and roadmap status

### Fixed
- **Robust edit extraction and file application**
  - Hardened `file-write` parsing across output variants
  - Added preview-diff edit extraction fallback
  - Improved bash command normalization for chained single-line commands

- **File write reliability for open documents**
  - Added disk-write fallback when `workspace.applyEdit(...)` returns `false`
  - Improved error propagation for per-file write failures

- **Chat rendering issues**
  - Removed false diff stats on non-diff markdown code blocks
  - Skip empty code fences in renderer
  - Suppressed noisy "Ausgeführt: X Ordner..." follow-up message

## [1.5.14] - 2026-03-31

### Added
- **Real-time streaming support in chat**
  - Token-by-token live response rendering for OpenAI-compatible and Ollama providers
  - Streaming preview now renders formatted Markdown/code blocks during generation

### Changed
- **Status UX improvements**
  - Status indicator stays below the latest agent output
  - File edits are now applied sequentially (file-by-file) with progress text
  - Randomized fun status messages based on VS Code UI language (German/English)
- **Footer now includes live version display**
  - Version is shown on the right side and kept separate from provider updates

## [1.5.13] - 2026-03-31

### Fixed
- **Marketplace logo restored**
  - Re-added extension root icon in `package.json` via `"icon": "media/icon.png"`
  - This restores the logo display on the Visual Studio Marketplace listing

## [1.5.12] - 2026-03-31

### Changed
- **Chat panel now opens in right split view**
  - VertexAgent chat opens beside the active editor (`ViewColumn.Beside`)
  - Existing chat panel is revealed in the right split instead of reusing the current editor column

### Removed
- **Unstable auto-docking fallback commands**
  - Removed best-effort commands that moved the editor to secondary sidebars
  - This avoids inconsistent placement across different VS Code versions

## [1.5.9] - 2026-03-31

### Fixed
- **mkdir command now processes all arguments**
  - Previously: `mkdir -p src/app/services src/app/utils` only created `src/app/services`
  - Now: All directories specified in a single mkdir command are created correctly
  - Regex updated from `[^\s;&|]+` to `[^\n;&|]+` to capture full argument list
  - Arguments are split by whitespace and processed individually

### Technical Details
- Fixed regex in `applySafeBashFsCommandsFromText()` to capture all mkdir arguments
- Same pattern applied consistently to both mkdir and touch commands

## [1.5.8] - 2026-03-31

### Added
- **Intent Recognition System (Critical Fix)**
  - Agent now correctly distinguishes between CODE-AUFGABEN and filesystem operations
  - Prevents agent from outputting DELETE when user requests refactoring or file creation
  - Three-tier intent hierarchy: CODE-AUFGABEN > NUR ORDNER ERSTELLEN > NUR LÖSCHEN

### Fixed
- **Agent no longer interprets everything as DELETE**
  - "Refactore src/app/main.py" now outputs Python code instead of `rm -rf`
  - "Erstelle /hallo.py mit Code" now creates file with content instead of DELETE
  - "Analysiere Workspace" now provides analysis instead of DELETE command
- Removed "HÖCHSTE PRIORITÄT" from LÖSCHEN section to prevent over-prioritization
- Added explicit examples for refactoring, file creation, and workspace analysis

### Changed
- Reorganized system prompt with INTENT-ERKENNUNG section at the top
- CODE-AUFGABEN now have highest priority in prompt hierarchy
- DELETE operations only triggered by explicit "lösche X" commands

## [1.5.7] - 2026-03-31

### Added
- **File creation takes precedence over deletion**
  - Added explicit rules: "erstelle Datei X" always creates files, never DELETE
  - Examples added for file creation with absolute paths (auto-converted to relative)
  - Clear distinction between "create file with code" vs "delete file"

### Fixed
- Agent no longer outputs DELETE when user says "Erstelle die Datei /hallo.py"
- Absolute paths like `/hallo.py` are automatically converted to relative paths

## [1.5.6] - 2026-03-30

### Added
- **Enhanced Chat UI with Diff Visualization**
  - Code blocks now display diff statistics (+X -Y) in header
  - Green highlighting for added lines, red for removed lines
  - Collapsible code blocks (first 4 lines visible, click header to expand)
  - Command blocks with terminal-style UI for bash commands
  - Right-aligned "Used Tokens:" display in chat header

- **Hardened System Prompts**
  - Security rules: No hardcoded secrets, no eval/exec, no unsafe operations
  - Testing requirements: Unit tests for all new logic (pytest/jest)
  - Structured logging: JSON format, configurable via ENV
  - Dependency management: Pinned versions in requirements.txt/package.json
  - Error handling standards: Specific exceptions, proper context logging

- **File System Operations**
  - DELETE support for files and directories (recursive)
  - Command-block rendering for all bash commands
  - Improved DELETE detection (recognizes rm, rm -rf, DELETE keyword)

### Changed
- Temperature increased from 0.2 to 0.3 for better creativity while maintaining code quality
- Reorganized system prompts with clear sections (Security, Testing, File Operations)
- DELETE operations now have highest priority in prompt hierarchy
- Improved prompt examples with User/Agent dialog format

### Fixed
- DELETE commands now properly execute (files and directories)
- Command-only intent detection excludes DELETE operations
- UI correctly recognizes rm/rm -rf as DELETE commands
- Code block parsing handles multiple DELETE format variations
- Layout issues with chat input field positioning

### Technical Details
- Version progression: 1.3.6 → 1.5.6
- Major refactor of system prompts for clarity and effectiveness
- Enhanced code block parsing with flexible DELETE detection
- Improved FileEditEngine with directory deletion support

## [1.3.6] - Previous Version
- Initial diff visualization
- Basic command execution
- File editing capabilities
