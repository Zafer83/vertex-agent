# VertexAgent Test Suite

Curated test prompts for all agent components.

## 1. LoopEngine Stress Test

### Test 1.1: Multi-Iteration Loop
```
Create a TypeScript function calculateFibonacci in src/test/fibonacci.ts that calculates the Fibonacci sequence. Then add unit tests and optimize performance.
```
**Expected:** 3-4 iterations, automatic test creation, performance optimization

### Test 1.2: Error-Fix Loop
```
Create a Python file src/test/broken.py with a function that intentionally throws a TypeError. The agent should detect and automatically fix the error.
```
**Expected:** 2-3 iterations, automatic error detection, self-healing

### Test 1.3: Refactor Loop
```
Create a complex JavaScript function src/test/messy.js with nested if-else blocks. Then refactor it following clean code principles.
```
**Expected:** 2-3 iterations, code quality improvement, SOLID principles

---

## 2. FileEditEngine Maximum Test

### Test 2.1: Multiple Files
```
Create a complete Express.js REST API with the following files:
- src/api/server.ts (Express server)
- src/api/routes/users.ts (user routes)
- src/api/controllers/userController.ts (controller)
- src/api/models/user.ts (user model)
- src/api/middleware/auth.ts (auth middleware)
```
**Expected:** 5 files at once, correct folder structure, working imports

### Test 2.2: Large File
```
Create a TypeScript file src/test/large.ts with 50+ string utility functions (trim, uppercase, lowercase, reverse, etc.)
```
**Expected:** large file (>500 lines), all functions operational

### Test 2.3: Binary/Special Files
```
Create a JSON config file config/settings.json with nested objects and arrays. Then add a .env.example file.
```
**Expected:** valid JSON syntax, mixed file types

---

## 3. ContextBuilder Logic Test

### Test 3.1: Workspace Analysis
```
Analyze the current project structure and create a README.md documenting all components.
```
**Expected:** correct analysis of src/, out/, package.json

### Test 3.2: Dependency Detection
```
Create a new function that uses axios. The agent should detect whether axios is installed and point it out if missing.
```
**Expected:** dependency check, missing-package hint

### Test 3.3: File Reference
```
Create a new file src/test/importer.ts that imports and uses functions from src/agent/loopEngine.ts.
```
**Expected:** correct import paths, type safety

---

## 4. ErrorAnalyzer Path Test

### Test 4.1: Syntax Error
```
Create a TypeScript file src/test/syntax-error.ts with intentional syntax errors (missing brackets, semicolons).
```
**Expected:** immediate error detection, automatic fix

### Test 4.2: Type Error
```
Create a function that expects a string but receives a number. The agent should detect and fix the type error.
```
**Expected:** TypeScript error detected, type annotations corrected

### Test 4.3: Import Error
```
Create a file that imports a non-existing module. The agent should detect and correct it.
```
**Expected:** import error detected, corrected import path

---

## 5. AI Response Structure Test

### Test 5.1: Code-Block Format
```
Create 3 different files in one request: Python, TypeScript, JSON
```
**Expected:** 3 separate code blocks with correct file paths

### Test 5.2: Implementation Notes
```
Create a complex algorithm function and explain the implementation.
```
**Expected:** code + detailed implementation notes

### Test 5.3: Memory Notes
```
Create a function and store key design decisions for later use.
```
**Expected:** memoryNotes in response, reused later

---

## 6. Workspace Safety Test

### Test 6.1: Relative Paths
```
Create files at different path depths: src/a.ts, src/deep/b.ts, src/very/deep/nested/c.ts
```
**Expected:** relative paths only, no absolute paths

### Test 6.2: Overwrite Protection
```
Try overwriting an existing file (e.g. package.json)
```
**Expected:** warning or rejection, no unintended overwrite

### Test 6.3: Outside Workspace
```
Try creating a file outside the workspace (/tmp/test.txt)
```
**Expected:** rejection, workspace-only writes

---

## 7. Autoloop Function Test

### Test 7.1: Continue Flag
```
Create a function that requires multiple steps. The agent should set "continue": true.
```
**Expected:** multiple iterations, continue flag used correctly

### Test 7.2: Max Iterations
```
Provide a highly complex task that would require more than 10 iterations.
```
**Expected:** stops at maxIterations, error message

### Test 7.3: Early Exit
```
Create a simple function that works immediately.
```
**Expected:** 1 iteration, immediate success

---

## 8. Token Usage Visibility

### Test 8.1: Token Display
```
Ask a simple question and observe token display.
```
**Expected:** token count visible in UI, updates after response

### Test 8.2: Large Response
```
Create a very large file with many functions.
```
**Expected:** high token count, displayed correctly

### Test 8.3: Multiple Requests
```
Send multiple requests in sequence and observe token accumulation.
```
**Expected:** token count per request, not cumulative

---

## 9. Memory & Command-Only Stability

### Test 9.1: Memory File Auto-Creation
```
Start the extension in a fresh workspace without .vertex/memory.json and send one chat request.
```
**Expected:** `.vertex/memory.json` is created automatically

### Test 9.2: Memory Persistence and Reuse
```
Request 1: "Use FastAPI for the backend and remember this decision."
Request 2: "Which backend decision was made before?"
```
**Expected:** memoryNotes are persisted and reused as context

### Test 9.3: Command-Only Filesystem Action
```
Create a folder named docs and a TODO.md file inside it.
```
**Expected:** agent outputs Bash commands and `docs/TODO.md` is created in workspace

### Test 9.4: Workspace Safety in Command-Only Mode
```
Try to create a file outside the workspace via prompt (e.g. ../outside.txt).
```
**Expected:** no writes outside workspace

---

## Expected Results

### LoopEngine
- ✓ Multiple iterations work
- ✓ Errors are detected automatically
- ✓ Fixes are applied automatically
- ✓ Loop stops on success or maxIterations

### FileEditEngine
- ✓ Multiple files in one response
- ✓ Correct folder structure
- ✓ Large files (>500 lines)
- ✓ Different file types

### ContextBuilder
- ✓ Workspace analyzed correctly
- ✓ Dependencies detected
- ✓ File references resolved correctly

### ErrorAnalyzer
- ✓ Syntax errors detected
- ✓ Type errors detected
- ✓ Import errors detected
- ✓ VS Code diagnostics integrated

### AI Response Structure
- ✓ Code blocks formatted correctly
- ✓ File paths present
- ✓ Implementation notes included
- ✓ Memory notes when needed

### Workspace Safety
- ✓ Relative paths only
- ✓ Workspace-only writes
- ✓ No unintended overwrites

### Autoloop
- ✓ Continue flag works
- ✓ Max-iterations limit applies
- ✓ Early exit on success

### Token Usage
- ✓ UI display works
- ✓ Correct values
- ✓ Per-request, not cumulative

### Memory & Command-Only
- ✓ memory.json auto-created
- ✓ memoryNotes persisted and reused
- ✓ `mkdir`/`touch` from Bash code blocks applied
- ✓ No paths outside workspace

---

## Manual Test Procedure

1. Start VS Code extension (`F5`)
2. Open VertexAgent chat (`Cmd+Shift+P` -> "VertexAgent: Open Chat")
3. Run tests one by one
4. Observe:
- Chat responses
- File creation in explorer
- Token display
- Error messages
- Loop iterations

## Success Criteria

- [ ] All 9 categories tested
- [ ] At least 80% of tests successful
- [ ] No critical errors
- [ ] UI works correctly
- [ ] Acceptable performance (<5s per iteration)
- [ ] Memory and command-only tests successful
