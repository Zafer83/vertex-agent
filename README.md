# VertexAgent — Autonomous Private AI Coding Agent

**Developed by VertexLabs**
Copyright Zafer Kılıçaslan
www.vertexlabs.de

VertexAgent is a VS Code extension providing an autonomous AI coding agent with multi-provider LLM support, non-destructive file editing, persistent memory, and a hardened security model — built for developers who want full control over their AI tooling.

---

## Why VertexAgent?

| Feature | VertexAgent | GitHub Copilot | Cursor | Continue.dev |
|---|---|---|---|---|
| 100% local / air-gapped | ✅ | ❌ | ❌ | ✅ |
| Bring your own model | ✅ | ❌ | partial | ✅ |
| Non-destructive diff edits | ✅ | ❌ | ❌ | ❌ |
| API keys in OS keychain | ✅ | n/a | ❌ | ❌ |
| Persistent cross-session memory | ✅ | ❌ | ❌ | ❌ |
| Duplicate edit protection | ✅ | ❌ | ❌ | ❌ |
| CSP-compliant webview | ✅ | n/a | n/a | n/a |
| Zero telemetry | ✅ | ❌ | ❌ | partial |

---

## Features

### Multi-Provider LLM Support
- **Google Gemini** — Direct API integration (`gemini-2.0-flash-latest`, 1M context)
- **Anthropic Claude** — Claude 3.5 Sonnet / Claude 3 Haiku
- **OpenAI-compatible** — llama.cpp, LiteLLM, any OpenAI-format server
- **Ollama** — Local models, no API key required
- **Custom** — Any OpenAI-compatible endpoint with optional Bearer token

### Non-Destructive File Editing
- **Smart diff detection** — Distinguishes real diffs from markdown lists by matching minus-line content against context lines
- **Patch application** — `applyDiffPatch()` applies changes surgically; untouched lines are never modified
- **Auto-detection of implicit additions** — Lines not present in the original file are automatically treated as additions, even without `+` prefix
- **Deduplication** — Identical edits targeting the same file are applied only once, even if the LLM outputs them multiple times
- **Full replacement fallback** — Non-diff content replaces the file atomically

### Intelligent Intent Recognition
- **Line-level vs file-level** — "lösche zeile 3 in requirements.txt" routes to diff format; "lösche datei X" routes to DELETE
- **Version number protection** — `7.4.3` is never misread as a filename to delete
- **Content-edit detection** — "entferne flask aus requirements.txt" never triggers file deletion
- **Command-only mode** — Folder/file structure requests return clean Bash commands (`mkdir`, `touch`)

### Auto File Context Injection
- Referenced files are automatically read and injected into the LLM prompt with a concrete diff-format template
- The template uses the actual filename, ensuring the LLM produces structured diffs rather than full file replacements
- File context uses code fences matching the file language for better LLM comprehension

### Persistent Memory System
- Design decisions and architecture notes persist across sessions in `.vertex/memory.json`
- Last 20 memory entries are injected into every new chat request
- Auto-initialized — no manual setup required

### Hardened System Prompts
- Explicit prohibition of simulated correction loops ("Versuch 2:", "Erneuter Versuch:")
- Concrete diff examples with worked `requirements.txt` cases
- Security rules: no hardcoded secrets, no `eval()`, no unsafe YAML loading
- Logging standards: JSON-format structured logging
- Type safety requirements: Python type hints, strict TypeScript types

### Streaming for All Providers
- Token-by-token live rendering for Gemini, Claude, OpenAI-compatible, and Ollama
- Files are written to disk as soon as their code blocks complete — no waiting for the full response

### Modern Chat UI
- **Diff visualization** — `+` lines green, `-` lines red, `+N -M` statistics in header
- **Placeholder-based syntax highlighting** — Two-phase tokenizer with non-printable placeholder markers prevents HTML artifact leakage (`class="tok-number">`)
- **Collapsible code blocks** — First 4 lines visible, click stats to expand
- **CSP-compliant** — No inline `onclick` handlers; uses event delegation
- **Duplicate block suppression** — If the LLM repeats a code block, only the first is shown
- **Command blocks** — Terminal-style UI for bash commands
- **Markdown rendering** — Lists, headings, inline code
- **Token tracking** — "Used Tokens:" counter per response

### Security Model
- **API keys in OS keychain** — `vertexAgent.apiKey` and `vertexAgent.accessToken` use VS Code `"secret": true` (OS keychain / credential manager, never plaintext `settings.json`)
- **Zero telemetry** — No data sent anywhere except your configured LLM provider
- **Air-gap capable** — Works fully offline with Ollama or llama.cpp
- **Safe path resolution** — `toSafeRelativePath()` blocks path traversal (`../`) and absolute paths
- **Workspace-scoped writes** — All file operations are confined to the open workspace root
- **CSP-compliant webview** — No `eval()`, no inline scripts, event delegation only

---

## Installation

### Requirements
- **Node.js** >= 18
- **VS Code** >= 1.85
- **LLM provider** — Gemini API key, Ollama, llama.cpp, or any OpenAI-compatible server

### From VSIX (Recommended)
1. Download `vertex-agent-x.x.x.vsix` from the [Releases page](https://github.com/Zafer83/vertex-agent/releases)
2. In VS Code: `Extensions` → `...` → `Install from VSIX...`

### From Source
```bash
git clone https://github.com/Zafer83/vertex-agent.git
cd vertex-agent
npm install
npm run compile
# Press F5 in VS Code to launch debug instance
```

---

## Configuration

Open settings via the ⚙️ button in chat or `Cmd+Shift+P` → "VertexAgent Settings".

### Google Gemini
| Setting | Value |
|---|---|
| Provider | `gemini` |
| Server URL | `https://generativelanguage.googleapis.com` |
| Server Port | `443` |
| API Key | Your key from [makersuite.google.com](https://makersuite.google.com/app/apikey) |

### Ollama (Local, Free)
| Setting | Value |
|---|---|
| Provider | `ollama` |
| Server URL | `http://localhost` |
| Server Port | `11434` |
| API Key | *(leave empty)* |

```bash
ollama pull llama3.2
ollama serve
```

### llama.cpp (Local, Free)
| Setting | Value |
|---|---|
| Provider | `openai` (compatible) |
| Server URL | `http://localhost` |
| Server Port | `8080` |

```bash
./server -m model.gguf -c 4096 --port 8080
```

### Anthropic Claude
| Setting | Value |
|---|---|
| Provider | `claude` |
| Server URL | `https://api.anthropic.com` |
| Server Port | `443` |
| API Key | Your Anthropic key |

---

## Usage

### Basic Code Tasks
```
Create a Python function that validates email addresses with regex
```
```
Refactor src/app.ts to use async/await instead of callbacks
```
```
Fix the TypeScript errors in src/utils.ts
```

### File Editing with Diffs
```
Remove the pytest line from requirements.txt
```
```
Add numpy==1.24.0 to requirements.txt after requests
```
The agent outputs a diff (`-` / `+`), applies it as a patch — no other lines are touched.

### Multi-file Projects
```
Create a complete REST API with FastAPI:
- src/main.py (app entrypoint)
- src/routes/users.py (user endpoints)
- src/models/user.py (pydantic models)
- tests/test_users.py (pytest tests)
- requirements.txt
```

### File & Folder Management
```
Create folder structure: src/components, src/hooks, src/utils
```
```
Delete the old_tests directory
```

---

## Architecture

```
vertex-agent/
├── src/
│   ├── agent/
│   │   ├── loopEngine.ts        # Autonomous agent loop
│   │   ├── memoryEngine.ts      # Persistent memory
│   │   ├── errorAnalyzer.ts     # VS Code diagnostics
│   │   └── contextBuilder.ts    # Project context
│   ├── ai/
│   │   ├── aiClient.ts          # LLM client, intent detection, diff logic
│   │   └── providerAdapter.ts   # Multi-provider API adapter
│   ├── fs/
│   │   └── fileEditEngine.ts    # Non-destructive file operations
│   ├── ui/
│   │   ├── chatPanel.ts         # Chat webview (CSP-compliant)
│   │   └── settingsPanel.ts     # Settings UI
│   └── extension.ts             # Extension entry point
├── tests/
│   └── unit/
│       └── bugfix-regression.test.js  # 61 regression tests
├── .vertex/
│   └── memory.json              # Persistent cross-session memory
└── package.json
```

---

## Roadmap

### Completed ✅
- [x] Multi-provider LLM support (Gemini, Claude, OpenAI, Ollama, Custom)
- [x] Streaming for all providers with live file writing
- [x] Non-destructive diff editing with `applyDiffPatch()`
- [x] Smart diff vs markdown-list detection
- [x] Auto file context injection with concrete diff-format templates
- [x] Persistent cross-session memory
- [x] Diff visualization in chat (+N -M, green/red)
- [x] Collapsible code blocks with expand toggle
- [x] Placeholder-based syntax highlighter (no HTML artifact leakage)
- [x] CSP-compliant webview (event delegation, no inline scripts)
- [x] API keys in OS keychain (`"secret": true`)
- [x] Safe path traversal protection
- [x] Workspace-scoped file writes
- [x] Duplicate edit deduplication (file writes + chat display)
- [x] Intent disambiguation (line edit vs file delete vs command-only)
- [x] LLM self-loop prevention
- [x] Hardened system prompts with security rules and examples
- [x] Regression test suite (61 assertions)
- [x] Auto version bump on compile

### Planned 🔧
- [ ] **Git integration** — Auto-commit after successful file writes, show diff in source control panel
- [ ] **Multi-turn context** — Full conversation history sent to LLM (currently stateless per request)
- [ ] **Workspace indexing** — Semantic search over project files for relevant context injection
- [ ] **Custom system prompts** — `.vertex/system-prompt.md` per project overrides default prompt
- [ ] **Workspace-specific settings** — `.vertex/config.json` per repository
- [ ] **Test runner integration** — Auto-run `pytest`/`jest` after writes, feed failures back to LLM
- [ ] **Multi-file diff view** — Preview all pending changes before applying
- [ ] **Undo support** — Revert last agent action via VS Code undo stack
- [ ] **Plugin/tool system** — Custom callable tools (web search, DB query, API calls)
- [ ] **Image input** — Send screenshots/diagrams to vision-capable models
- [ ] **Inline completions** — Ghost text suggestions alongside chat

### Security Backlog 🔒
- [ ] **Rate limiting** — Per-session request budget to prevent runaway loops
- [ ] **Sandboxed Bash execution** — Full sandboxing for shell commands beyond mkdir/touch
- [ ] **Credential scanning** — Detect secrets/API keys in LLM output before writing to disk
- [ ] **Prompt injection detection** — Warn when file content attempts to override the system prompt
- [ ] **Audit log** — Append-only log of all file operations performed by the agent
- [ ] **Permission scopes** — Read-only mode or directory restrictions per workspace

---

## Supported Models

| Provider | Recommended Model | Context | Cost |
|---|---|---|---|
| Gemini | `gemini-2.0-flash-latest` | 1M tokens | Low |
| Claude | `claude-3-5-sonnet-20241022` | 200k tokens | Medium |
| Ollama | `llama3.2`, `codestral` | 128k tokens | Free |
| llama.cpp | Any GGUF model | Variable | Free |
| OpenAI | `gpt-4o` | 128k tokens | High |

---

## Known Issues

- **LLM diff compliance** — Some smaller local models don't reliably output diff format. The patch engine falls back to full-file replacement in that case.
- **Gemini rate limits** — Heavy usage triggers 429 errors. Use `gemini-flash` for lower cost per request.
- **Ollama performance** — Local models are significantly slower than cloud APIs for complex tasks.
- **Memory growth** — Very large `.vertex/memory.json` files (>500 entries) may affect prompt performance.

---

## Development

```bash
npm run compile      # Bump version + build
npm run watch        # Watch mode (no version bump)
npm run package      # Build .vsix for distribution
npm test             # Run all tests
node tests/unit/bugfix-regression.test.js  # Regression suite only
```

---

## License

**Proprietary** — Copyright VertexLabs · Zafer Kılıçaslan
The VertexLabs logo and all VertexAgent branding elements are proprietary.

**Website:** www.vertexlabs.de
