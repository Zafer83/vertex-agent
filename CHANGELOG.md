# Changelog

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
