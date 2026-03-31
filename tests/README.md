# VertexAgent Tests

## Test Structure

```
tests/
├── unit/           # Unit tests for individual functions
│   ├── diff-logic.test.js
│   ├── system-prompt.test.js
│   └── chat-html.test.js
├── integration/    # Integration tests for end-to-end scenarios
│   ├── full-pipeline.test.js
│   └── llm-to-chat-pipeline.test.js
└── requirements/   # Requirement-based tests (TDD approach)
    ├── html-artifacts.test.js
    ├── delete-command.test.js
    └── chat-display-integration.test.js
```

## Running Tests

```bash
# All tests (unit + integration + requirements)
npm test

# Only unit tests
npm run test:unit

# Only integration tests
npm run test:integration

# Only requirement tests
npm run test:requirements

# Single test
node tests/requirements/html-artifacts.test.js
```

## Test Categories

### Unit Tests (3 tests)

- **diff-logic.test.js** - Tests `applyDiffToContent` logic
- **system-prompt.test.js** - Tests system prompt behavior
- **chat-html.test.js** - Tests HTML artifact cleaning in chat

### Integration Tests (2 tests)

- **full-pipeline.test.js** - Tests complete pipeline: System-Prompt → LLM → Diff → File
- **llm-to-chat-pipeline.test.js** - Tests LLM → Backend → Chat UI pipeline

### Requirement Tests (5 test suites, 60+ total tests)

**Requirement-based tests follow TDD principles:**
1. Write test based on requirement (not implementation)
2. Run test to see if code passes
3. Fix code if test fails
4. Verify test passes

#### html-artifacts.test.js (21 tests)
**Requirement:** Agent must NEVER display HTML artifacts in chat UI

Test coverage:
- ✅ 8 positive cases (valid HTML that must be removed)
- ✅ 8 negative cases (edge cases, empty strings, plain text)
- ✅ 3 boundary cases (long strings, only HTML, nested HTML)
- ✅ 2 integration cases (real-world diffs, code blocks)

#### delete-command.test.js (12 tests)
**Requirement:** Distinguish between line deletion (diff) and file deletion (DELETE)

Test coverage:
- ✅ 5 positive cases (should generate diff format)
- ✅ 4 negative cases (should generate DELETE command)
- ✅ 3 edge cases (ambiguous inputs)

#### chat-display-integration.test.js (5 tests)
**Requirement:** HTML artifacts must never appear in chat, regardless of LLM output

Test coverage:
- ✅ Backend code extraction cleaning
- ✅ Streaming token cleaning
- ✅ Final message cleaning
- ✅ Real-world scenario reproduction
- ✅ UI syntax highlighting validation

#### keyword-spacing-bug.test.js (1 test)
**Requirement:** Syntax highlighting must preserve spaces between keywords and identifiers

Bug reproduction:
- Screenshot showed "defbroken_function" instead of "def broken_function"
- Test validates that `<span class="hl-keyword">def</span> broken_function` preserves space

#### webview-rendering-bug.test.js (5 tests)
**Requirement:** Browser rendering must not collapse spaces in code

Test coverage:
- ✅ Normal HTML with span tags
- ✅ Multiple spans with spaces
- ✅ HTML without spaces (bug scenario)
- ✅ Escaped spaces (&nbsp;)
- ✅ Double-escaped HTML detection

## Test Results

All tests pass:
- ✅ Unit tests: 3/3
- ✅ Integration tests: 2/2
- ✅ Requirement tests: 44/44 (21 + 12 + 5 + 1 + 5)

**Total: 49 tests passing**

## Bug Fixes

### Syntax Highlighting Spacing Bug (v1.7.52)
**Problem:** Screenshot showed "defbroken_function" without space between keyword and identifier.

**Root Cause:** Double-escaped regex patterns in `highlightCodeLine()`:
- `\\\\b` was being interpreted as literal `\b` instead of word boundary
- This caused incorrect regex matching

**Fix:** Changed regex patterns from `\\\\b` to `\\b`:
- `new RegExp("\\\\b(keyword)\\\\b")` → `new RegExp("\\b(keyword)\\b")`
- Applied to keyword, constant, number, and function name patterns

**Tests:** Created comprehensive tests to validate spacing preservation across all languages.
