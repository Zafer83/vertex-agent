# Changelog

## [1.8.3] - 2026-04-19

### Added
- **Tool Use / Function Calling** (`src/ai/tools/`) — 7 typed tools replace fragile regex/code-block parsing for sub-agents running in tool-use mode: `read_file`, `write_file`, `list_files`, `grep`, `git_diff`, `run_tests`, `run_bash`. Each tool has a strict JSON Schema, a security-first design (path traversal blocking, allowlists), and a pure-Node fallback so tests run without VS Code.
- **ToolRunner** (`src/agent/toolRunner.ts`) — Agentic loop that drives the tool-use conversation: LLM → tool calls → results → LLM → … until a plain-text response is received. Compatible with all four providers. Integrated into the Orchestrator as an opt-in path via `vertexAgent.toolUseEnabled`.
- **Provider Tool-Use Support** (`src/ai/providerAdapter.ts`) — New static methods: `buildRequestWithTools()` (multi-turn message builder for OpenAI, Claude, Gemini, Ollama) and `parseToolCallResponse()` (extracts tool calls from each provider's wire format). Ollama uses a JSON-schema-in-system-prompt fallback since it has no native function calling.
- **SemanticIndex** (`src/agent/semanticIndex.ts`) — Pure-JS BM25 workspace file ranker. Replaces random 40-file sampling in ContextBuilder with ranked top-K results for each query. No native modules, no external API calls. Tokeniser handles camelCase/PascalCase splitting. Supports incremental updates via `registerChangeListener()` (re-indexes files on save).
- **Role-based tool subsets** — Each sub-agent role gets a curated tool set: Coder (read/write/list/grep), Security Auditor (read/list/grep/git_diff), Test Writer (read/write/list/run_tests), Refactor Expert (read/write/list/grep/git_diff).
- **New VS Code Settings**: `vertexAgent.toolUseEnabled` (default: `false`) and `vertexAgent.semanticContextEnabled` (default: `false`). Both are opt-in — defaults preserve existing Phase 1/2 behaviour.
- **Unit Tests** — `tests/unit/tool-registry.test.js` (85 assertions) covering tool completeness, schema validation, role subsets, run_bash allowlist, run_tests allowlist, path traversal, DELETE detection, and subset lookup. `tests/unit/semantic-index.test.js` (36 assertions) covering tokeniser camelCase splitting, stop word filtering, BM25 ranking, topK limiting, edge cases, incremental updates, and IDF weighting.

### Changed
- **ContextBuilder** — `collect()` now accepts an optional `query` string. When `semanticContextEnabled=true`, delegates to the SemanticIndex BM25 ranker. Falls back to random sampling otherwise.
- **Extension activation** — When `semanticContextEnabled=true`, builds the semantic index in the background and registers a file-save listener to keep it fresh. Zero impact on activation time for the default configuration.
- **Orchestrator** — `runStep()` branches to `runStepWithTools()` when `toolUseEnabled=true`, passing the role-appropriate tool subset via ToolRunner.

## [1.8.0] - 2026-04-17

### Added
- **Orchestrator — Master/Sub-Agent Pipeline** (`src/agent/orchestrator.ts`) — For highly complex tasks (classifier score ≥ 4), a dedicated Orchestrator decomposes the request via a Planner LLM, runs up to `maxSubAgents` Coder sub-agents in parallel, optionally triggers a Security Auditor and Test Writer, and finally routes the merged edits through the Judge quality gate. The single-call path is preserved for all simpler tasks.
- **Planner Sub-Agent** — The Planner receives the full task context and outputs a structured JSON plan (`steps[]` with roles, target files, and per-step prompts). Falls back to a single coder step on any JSON parse error, ensuring the flow is never blocked.
- **Parallel Coder Sub-Agents** — Up to `vertexAgent.maxSubAgents` (default: 3, max: 6) Coder agents run concurrently via `Promise.all`, each receiving only its relevant file context. Edit conflicts are resolved by last-write-wins per filepath.
- **Implicit Security Audit** — When the user prompt contains security-related keywords (`auth`, `password`, `jwt`, `encrypt`, `sql`, `xss`, etc.), a `security_auditor` step is automatically appended to the plan even if the Planner didn't include it.
- **Test Writer Sub-Agent** — When `vertexAgent.autoWriteTests` is enabled (default: `true`), a `test_writer` step is automatically added for tasks that create new modules or classes.
- **Mixed-Provider Routing** (`src/ai/providerRouter.ts`) — `vertexAgent.plannerProvider` lets you route Planner calls to a stronger model (e.g., Claude Sonnet) while Coder sub-agents use your main (cheaper/faster) model. `vertexAgent.judgeApiKey` allows a separate API key for the judge provider.
- **Sub-Agent Progress Callbacks** — Real-time status updates are streamed to the chat panel during orchestration: `🗺 Planning task…`, `⚡ Coding N file(s) in parallel…`, `🔒 Security audit…`, `🧪 Writing tests…`, `🔍 Reviewing edits…`, `⚠️ Issues found — retrying…`
- **Role-Specific System Prompts** (`src/ai/prompts.ts`) — Each sub-agent role (planner, coder, refactor_expert, security_auditor, test_writer) receives a focused, token-efficient English system prompt instead of the generic full-context prompt.
- **New VS Code Settings**: `vertexAgent.orchestratorEnabled` (default: `true`), `vertexAgent.plannerProvider` (default: `"same"`), `vertexAgent.maxSubAgents` (default: 3), `vertexAgent.autoWriteTests` (default: `true`)
- **Unit Tests** — `tests/unit/orchestrator-planning.test.js` (45 assertions) covering Planner JSON parsing, fallback scenarios, role sanitization, maxSubAgents capping, code block extraction, path traversal blocking, edit deduplication, and security keyword detection. `tests/unit/orchestrator-routing.test.js` (28 assertions) covering all provider routing combinations including mixed-provider, access token propagation, and same-as-main identity checks.

### Changed
- **Duplicate variable fix** — Removed shadowed `multiAgentForOllama` constant declaration from the judge gate block in `aiClient.ts`; the variable declared at the orchestrator routing block is reused throughout.

## [1.7.95] - 2026-04-17

### Added
- **LLM-as-Judge Quality Gate** — After completing a complex task, a second LLM call independently reviews proposed edits before writing them to disk. The judge checks for syntax errors, missing imports, security issues (hardcoded secrets, `eval()`), and incomplete task fulfilment. Configurable via `vertexAgent.judgeEnabled` (default: `true`).
- **Automatic Retry on Judge Rejection** — If the judge rejects edits with confidence ≥ `judgeMinConfidence` (default: 0.7), the agent automatically reruns with the judge's issues as explicit constraints. Only one retry is attempted to keep latency bounded.
- **Mixed-Provider Judge** — Set `vertexAgent.judgeProvider` to `claude`, `gemini`, `openai`, or `ollama` to route judge calls to a different (typically stronger) model than the coder. Use `"same"` (default) to reuse the main provider.
- **Task Complexity Classifier** (`src/ai/taskClassifier.ts`) — Zero-token regex-based classifier that routes every request to one of three tiers: `trivial` (deterministic path, no LLM), `simple` (lean prompt, no judge), or `complex` (full prompt + judge). Signals: file count, keyword matching, prompt length, multiline structure, multi-step conjunctions.
- **Lean System Prompt for Simple Tasks** — Simple and trivial tasks now use a ~400-token system prompt instead of the full ~1400-token prompt, saving up to ~1000 input tokens per request with no quality loss.
- **Claude Streaming Support** — Claude provider now supports token-by-token streaming via the Anthropic SSE format (`consumeClaudeStream`).
- **Prompt Caching for Claude** — Complex tasks with Claude provider include `cache_control: {type: "ephemeral"}` on the system prompt, enabling the Anthropic 5-minute prompt cache and reducing repeat-call costs by ~90% on the system prompt tokens.
- **All System Prompts in English** — All LLM system prompts (`buildDefaultSystemPrompt`, `buildSimpleSystemPrompt`, `buildCommandOnlySystemPrompt`, judge system prompt) are now in English for better cross-model compatibility. User-facing explanations remain in German.
- **New VS Code Settings**: `vertexAgent.judgeEnabled`, `vertexAgent.judgeProvider`, `vertexAgent.judgeApiKey`, `vertexAgent.judgeMinConfidence`, `vertexAgent.multiAgentForOllama`
- **Unit Tests** — `tests/unit/task-classifier.test.js` (52 assertions) and `tests/unit/judge-gating.test.js` (37 assertions) covering classifier scoring, trivial/simple/complex thresholds, judge verdict parsing, fail-open scenarios, gate conditions, and retry trigger logic.

### Changed
- **Gemini API URL** — Corrected model URL format from `gemini-flash-latest` to `gemini-2.0-flash-latest` with proper `systemInstruction` field (separate from user content).
- **OpenAI Adapter** — Added `Authorization: Bearer` header for API keys (not just access tokens), allowing direct OpenAI API calls with `vertexAgent.apiKey`.

## [1.7.93] - 2026-04-01

### Fixed
- **Duplicate Code Block Execution** — `deduplicateChatCodeBlocks()` removes identical code blocks from LLM output before chat display and file writing. If the LLM outputs the same diff block twice, only the first occurrence is applied.
- **Edit Deduplication in FileEditEngine** — Identical edits (same filepath + same content) are deduplicated before applying to workspace files, preventing double-writes.
- **`+` Prefix Written to File** — New files created from all-`+`-line blocks (e.g., `+ pytest==7.4.3`) now correctly strip the `+` markers. Files no longer contain literal `+` characters.
- **Leading Whitespace from Diff Lines** — `"+ numpy==1.24.0".slice(1)` produced `" numpy==1.24.0"` with a leading space. Fixed: `slice(2)` when prefix is `"+ "`, `slice(1)` when prefix is `"+"` only.
- **Diff Format Not Generated by LLM** — File context injected into prompts now includes a concrete diff-format template using the actual filename. LLMs follow concrete examples far more reliably than abstract instructions.
- **Line Numbers in Chat Display** — Chat UI strips `N: ` prefixes (e.g., `1: flask==3.0.0`) from LLM output before rendering, including diff-prefixed patterns (e.g., `- 2: pytest==7.4.3` → `- pytest==7.4.3`).

### Added
- **Regression Test Suite** — `tests/unit/bugfix-regression.test.js` with 61 assertions covering: diff detection, delete intent, line number stripping, arrow function fixing, HTML entities, diff patch application, plus-line stripping, edit deduplication, chat block deduplication, nested fence parsing.
- **Auto Version Bump on Compile** — `npm run compile` automatically increments the patch version via `bump-version.js`.

## [1.7.90] - 2026-04-01

### Fixed
- **Diff Markers Lost After Line-Number Fix** — Removing line numbers from file context caused the LLM to stop generating diff format and output full file replacements instead. Fixed by injecting a concrete diff-format template with the actual filename directly before the LLM response.
- **Robust Line Number Stripping** — Pattern now handles diff lines with number prefixes: `"- 2: pytest==7.4.3"` strips correctly to `"- pytest==7.4.3"`, preserving the diff marker.

## [1.7.88] - 2026-04-01

### Fixed
- **Line Numbers Injected into Files** — `resolveFileContext()` was sending `1: flask==3.0.0` prefixes to the LLM, which then copied them into output, writing literal `1:`, `2:` markers into the target file. Fixed: raw content is sent, explicit instruction added not to output line numbers.
- **Missing Additions in Diffs** — LLM sometimes outputs new lines without `+` prefix. `applyDiffPatch()` now auto-detects lines that don't exist in the original file and treats them as additions.

### Added
- **Line Number Stripping in Post-Processing** — Strips `N: ` prefixes from LLM output before writing to disk, handling both plain (`1: text`) and diff-prefixed (`- 2: text`) patterns.

## [1.7.82] - 2026-04-01

### Fixed
- **Nested Code Fence Parser** — Markdown files containing code examples (e.g., README.md with bash snippets) are no longer split into multiple broken blocks. Stateful parser with `nestLevel` tracking correctly handles nested fences.
- **MD Language Detection** — Files with `.md` extension are now always rendered as MARKDOWN, not PYTHON. New `extLangMap` corrects language based on file extension.
- **DELETE vs Line-Edit Ambiguity (Round 2)** — System prompt now explicitly instructs the LLM to use diff format for line/entry removal ("lösche pytest in requirements.txt") instead of DELETE. Concrete diff examples added to prompt.
- **False-Positive File Deletion** — `isDeleteIntent()` no longer triggers on version numbers (e.g., `7.4.3`) or content-edit patterns ("lösche X in datei.ext"). Requires explicit file/folder keywords (`datei`, `file`, `rm`).

### Changed
- **System Prompt Hardening** — Clear separation between file deletion (requires "Datei/File/rm") and content editing (uses diff format). Added worked examples for line removal in requirements.txt.
- **Code Block Extraction** — `extractCodeBlocksAsEdits()` uses stateful fence parser matching the UI parser, preventing content loss in files with nested code fences.

## [1.7.80] - 2026-03-31

### Fixed
- **HTML Artifact Leakage (Bug 1)** — Internal CSS classes (`class="tok-number">`) no longer leak into visible chat output. Placeholder-based tokenizer prevents cascading regex corruption.
- **Token Merging / Keyword Spacing (Bug 4)** — Fixed `defcalculate_sum` rendering as single word. Root cause: `.code-line` had `display: flex` collapsing whitespace between `<span>` elements.
- **Destructive Diff Logic (Bug 2)** — File edits no longer overwrite entire files. `FileEditEngine` now detects diff-formatted content and applies it as a non-destructive patch.
- **Command Ambiguity — DELETE vs Line Edit (Bug 3)** — `isLineEditIntent()` distinguishes "lösche zeile 3 in requirements.txt" from "lösche datei X". Line-level edits route via diff format.

### Added
- **Auto File Context Injection** — `resolveFileContext()` reads files referenced in prompts and injects content into LLM context.
- **Diff Patch Engine** — `isDiffContent()` and `applyDiffPatch()` in `FileEditEngine` for intelligent non-destructive patch application with context-aware region matching and fallback strategies.

## [1.7.81] - 2026-03-31

### Fixed
- **Security: API Keys in OS Keychain** — `vertexAgent.apiKey` and `vertexAgent.accessToken` use `"secret": true` so VS Code stores them in the OS keychain instead of plaintext `settings.json`.

## [1.6.2] - 2026-03-31

### Added
- **Live File Writing during Streaming** — Files are written immediately when code blocks complete during streaming. No longer waits for the full response.

## [1.6.1] - 2026-03-31

### Added
- **Complete Streaming Support for All Providers** — Gemini, Claude, OpenAI/llama.cpp, and Ollama all support token-by-token streaming.

## [1.5.14] - 2026-03-31

### Added
- **Real-time streaming in chat** — Token-by-token live response rendering for OpenAI-compatible and Ollama providers.
