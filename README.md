# VertexAgent - Autonomous Private AI Coding Agent

**Developed by VertexLabs**  
Copyright Zafer Kilicaslan  
www.vertexlabs.de

VertexAgent is a VS Code extension that provides an autonomous AI agent with multi-provider support, automatic error correction, and persistent memory.

---

## Features

### Multi-Provider Support
- **Google Gemini** - Direct API integration
- **Anthropic Claude** - Claude 3.5 Sonnet support
- **OpenAI-compatible** - llama.cpp, LiteLLM, Ollama
- **Ollama** - Local models without API key
- **Custom** - Any OpenAI-compatible API

### Autonomous Agent Loop
- **Automatic testing** - Code is tested after creation
- **Error detection** - VS Code diagnostics integration
- **Auto-fix** - Errors are fixed automatically
- **Iterative improvement** - Loop runs until code is clean

### Persistent Memory System
- **Design decisions** - Architecture notes are stored
- **Context continuity** - Memory persists across sessions
- **Automatic storage** - `memoryNotes` in `.vertex/memory.json`
- **Auto-initialization** - `.vertex/memory.json` is created automatically
- **Memory context in chat** - Recent notes are injected into new chat requests

### Intelligent Code Processing
- **Automatic file creation** - Code blocks are extracted and written as files
- **Multi-file support** - Create multiple files in one response
- **File/directory deletion** - DELETE support for files and folders (recursive)
- **Relative paths** - Workspace-based path resolution
- **Command-only mode** - For folder/file requests, the agent can return pure Bash commands
- **Safe Bash FS application** - `mkdir`/`touch`/`rm -rf` from Bash code blocks are applied safely inside the workspace
- **Hardened prompts** - Security rules, testing requirements, structured logging standards

### Modern UI
- **Minimalist design** - Dark theme with VertexLabs branding
- **Diff visualization** - Code blocks show +X -Y statistics with syntax highlighting
- **Collapsible code blocks** - First 4 lines visible, click header to expand
- **Command blocks** - Terminal-style UI for bash commands
- **Live status feedback** - Spinner shows current activity
- **Markdown rendering** - Formatted responses with lists and headings
- **Token tracking** - Right-aligned "Used Tokens:" display

### Configurable Settings
- **Provider selection** - Dropdown with automatic configuration
- **Dynamic fields** - UI adapts to selected provider
- **API key management** - Secure storage in VS Code settings
- **Token options** - Checkbox for optional authentication

---

## Installation

### Requirements
- **Node.js** >= 18
- **VS Code** >= 1.85
- **LLM provider** (Gemini API key, Ollama, or llama.cpp server)

### Setup

1. **Clone the repository:**
```bash
git clone https://github.com/vertexlabs/vertex-agent.git
cd vertex-agent
```

2. **Install dependencies:**
```bash
npm install
```

3. **Compile extension:**
```bash
npm run compile
```

4. **Load extension in VS Code:**
- Press `F5` to launch debug mode
- Or package as `.vsix`: `npm run package`

---

## Configuration

### Set up a provider

**Open settings:**
- Click the ⚙️ button in chat
- Or: `Cmd+Shift+P` -> "VertexAgent: Settings"

### Gemini API

**Provider:** Google Gemini  
**Server URL:** `https://generativelanguage.googleapis.com`  
**Server Port:** `443`  
**API Key:** Your Gemini key (from https://makersuite.google.com/app/apikey)

### Ollama (Local)

**Provider:** Ollama (local)  
**Server URL:** `http://localhost`  
**Server Port:** `11434`  
**API Key:** Leave empty

**Start Ollama:**
```bash
ollama pull llama3.2
ollama serve
```

### llama.cpp (Local)

**Provider:** OpenAI-compatible  
**Server URL:** `http://localhost`  
**Server Port:** `8080`  
**Use access token:** ☐ (disabled)

**Start llama.cpp:**
```bash
./server -m model.gguf -c 4096 --port 8080
```

---

## Usage

### Open Chat
- `Cmd+Shift+P` -> "VertexAgent: Open Chat"
- Or configure a shortcut

### Commands

**Create code:**
```
Create a Python function that calculates Fibonacci numbers
```

**Create multiple files:**
```
Create a complete Python CLI tool with:
- main.py (argument parsing)
- utils.py (helper functions)
- test_main.py (unit tests)
```

**Fix errors:**
```
Fix the TypeScript errors in src/app.ts
```

**Folder/file via command-only mode:**
```
Create a folder named docs and a TODO.md file inside it
```
Expected agent response example:
```bash
mkdir -p docs
touch docs/TODO.md
```

**Delete files/folders:**
```
Delete the test_folder directory
```
Expected agent response example:
```bash
rm -rf test_folder
```

These commands are applied as safe filesystem actions in the current workspace.

### Live Status

During processing you will see:
- "Thinking..."
- "Collecting context..."
- "Processing response..."
- "Writing 3 file(s)..."

---

## Architecture

### Project Structure

```
vertex-agent/
├── src/
│   ├── agent/
│   │   ├── loopEngine.ts        # Autonomous agent loop
│   │   ├── memoryEngine.ts      # Persistent memory
│   │   ├── errorAnalyzer.ts     # VS Code diagnostics
│   │   ├── contextBuilder.ts    # Project context
│   │   └── types.ts             # Type definitions
│   ├── ai/
│   │   ├── aiClient.ts          # LLM client
│   │   └── providerAdapter.ts   # Multi-provider support
│   ├── fs/
│   │   └── fileEditEngine.ts    # File operations
│   ├── ui/
│   │   ├── chatPanel.ts         # Chat interface
│   │   └── settingsPanel.ts     # Settings UI
│   └── extension.ts             # Extension entry point
├── .vertex/
│   └── memory.json              # Persistent memory
└── package.json
```

### Components

**LoopEngine** - Orchestrates agent iterations with auto-test and auto-fix  
**MemoryEngine** - Persists design decisions  
**ErrorAnalyzer** - Collects VS Code diagnostics for error correction  
**ProviderAdapter** - Converts API formats (Gemini, Claude, OpenAI)  
**FileEditEngine** - Applies edits in the workspace  
**ChatPanel** - Minimal UI with markdown and status feedback

### Design Decisions

- **Provider adapter pattern** - Unified interface for different LLM APIs
- **Automatic code extraction** - Regex-based parsing of code blocks
- **Persistent memory** - JSON-based storage in `.vertex/`
- **VS Code diagnostics integration** - Uses native error detection
- **Minimalist UI** - Focus on functionality over noise
- **TypeScript** - Type safety for a robust extension

---

## Development

### Compile
```bash
npm run compile
```

### Watch mode
```bash
npm run watch
```

### Package extension
```bash
npm run package
```

### Debugging
- Press `F5` in VS Code
- Extension loads in a new VS Code window
- Console logs appear in "Debug Console"

---

## Testing

See `TESTING.md` for the full test suite.

---

## Provider Documentation

### Gemini Setup
See `GEMINI_SETUP.md` for detailed Gemini API integration guidance.

### Supported Models

| Provider  | Model               | Context     | Cost      |
| --------- | ------------------- | ----------- | --------- |
| Gemini    | gemini-flash-latest | 1M tokens   | Low       |
| Claude    | claude-3-5-sonnet   | 200k tokens | Medium    |
| Ollama    | llama3.2            | 128k tokens | Free      |
| llama.cpp | Custom              | Variable    | Free      |

---

## Known Issues

- **Gemini rate limits** - Heavy request volume can trigger rate limits
- **Ollama performance** - Local models are slower than cloud APIs
- **Memory size** - Very large memory files can affect performance
- **Agent hallucinations** - Complex requests may produce unintended file structures (improved with v1.5.x prompts)

---

## Roadmap

- [x] Diff visualization in chat (v1.5.0)
- [x] File/directory deletion support (v1.5.0)
- [x] Command blocks with terminal UI (v1.5.0)
- [x] Hardened system prompts with security rules (v1.5.0)
- [ ] Streaming support for realtime responses
- [ ] Git integration for automatic commits
- [ ] Custom system prompts per project
- [ ] Workspace-specific settings
- [ ] Plugin system for custom providers

---

## License

**Proprietary**  
Copyright VertexLabs - Zafer Kilicaslan

The VertexLabs logo and all VertexAgent branding elements are proprietary.

---

## Support

**Website:** www.vertexlabs.de  
**Developer:** Zafer Kilicaslan

---
