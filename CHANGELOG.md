# Changelog

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
