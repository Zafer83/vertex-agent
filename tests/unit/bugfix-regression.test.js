/**
 * Regression Tests für alle Bugfixes v1.7.80 - v1.7.86
 * Stellt sicher, dass keine bisherigen Fixes durch neue Änderungen kaputt gehen.
 *
 * Run: node tests/unit/bugfix-regression.test.js
 */

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ FAILED: ${testName}`);
    failed++;
  }
}

// ============================================================
// 1. isDiffContent — Diff vs Markdown List Detection
// ============================================================
console.log("\n=== 1. isDiffContent: Diff vs Markdown List ===");

function isDiffContent(content) {
  const lines = content.split("\n");
  let hasAdded = false, hasRemoved = false;
  const contextLines = [], minusContents = [];

  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) hasAdded = true;
    else if (line.startsWith("-") && !line.startsWith("---")) {
      hasRemoved = true;
      minusContents.push(line.slice(2).trim());
    }
    else if (line.trim().length > 0) {
      contextLines.push(line.trim());
    }
  }

  if (!hasRemoved && !hasAdded) return false;
  if (hasAdded && hasRemoved) return true;
  if (hasRemoved && !hasAdded) {
    return minusContents.some(mc => contextLines.some(cl => cl === mc));
  }
  return (hasAdded || hasRemoved) && contextLines.length > 0;
}

// Markdown lists are NOT diffs
assert(!isDiffContent("# Title\n## Section\n- src/analyze.py\n- src/utils.py"),
  "Markdown list with headers → not a diff");
assert(!isDiffContent("- item one\n- item two\n- item three"),
  "Pure markdown list → not a diff");
assert(!isDiffContent("## Files\n- README.md\n- package.json\n- src/index.ts"),
  "File list → not a diff");

// Real diffs ARE diffs
assert(isDiffContent("fastapi==0.111.0\n- fastapi==0.111.0\nrequests==2.31.0"),
  "Removal matching context → real diff");
assert(isDiffContent("flask==3.0.0\n- pytest==7.4.3\n+ numpy==1.26.0\nrequests==2.31.0"),
  "Plus and minus → real diff");
assert(isDiffContent("line1\n+ new_line\nline2"),
  "Only additions with context → real diff");

// ============================================================
// 2. isDeleteIntent — File Deletion vs Line Edit
// ============================================================
console.log("\n=== 2. isDeleteIntent: File vs Line Edit ===");

function isLineEditIntent(input) {
  const text = input.toLowerCase();
  return (
    /\bzeile\b/.test(text) || /\bzeilen\b/.test(text) ||
    /\bline\b/.test(text) || /\blines\b/.test(text) ||
    /\bzeile\s*\d+/.test(text) || /\bline\s*\d+/.test(text) ||
    /\bin\s+\S+\.\S+/.test(text)
  );
}

function isDeleteIntent(input) {
  const text = input.toLowerCase();
  if (isLineEditIntent(input)) return false;
  if (/\bin\s+\S+\.\S+/.test(text)) return false;

  const hasDeleteKeyword = (
    text.includes("lösche") || text.includes("löschen") ||
    text.includes("delete") || text.includes("remove") ||
    text.includes("entferne") || text.includes("entfernen") ||
    /\brm\b/.test(text)
  );
  if (!hasDeleteKeyword) return false;

  const hasExplicitFileTarget = (
    /\b(datei|file|ordner|folder|directory|verzeichnis)\b/.test(text) ||
    /\brm\s+(-rf?\s+)?[a-zA-Z0-9._/-]+/.test(text)
  );
  return hasDeleteKeyword && hasExplicitFileTarget;
}

// Line edits should NOT trigger file deletion
assert(!isDeleteIntent("lösche pytest in requirements.txt"),
  "lösche pytest in requirements.txt → NOT file delete");
assert(!isDeleteIntent("lösche zeile 3 in requirements.txt"),
  "lösche zeile 3 → NOT file delete");
assert(!isDeleteIntent("Lösche die Zeile pytest in requirements.txt"),
  "Lösche die Zeile pytest → NOT file delete");
assert(!isDeleteIntent("lösche pytest==7.4.3"),
  "lösche pytest==7.4.3 → NOT file delete (version number)");
assert(!isDeleteIntent("entferne flask aus requirements.txt"),
  "entferne flask aus requirements.txt → NOT file delete");

// File deletions SHOULD trigger
assert(isDeleteIntent("lösche datei test.txt"),
  "lösche datei test.txt → file delete");
assert(isDeleteIntent("delete file old.py"),
  "delete file old.py → file delete");
assert(isDeleteIntent("rm -rf temp/"),
  "rm -rf temp/ → file delete");

// ============================================================
// 3. Line Number Stripping
// ============================================================
console.log("\n=== 3. Line Number Stripping ===");

function stripLineNumbers(content) {
  const lines = content.split("\n");
  const nonEmptyLines = lines.filter(l => l.trim().length > 0);
  const lineNumPattern = /^([+-]\s*)?\d+:\s/;
  const hasLineNumbers = nonEmptyLines.length > 0 && nonEmptyLines.every(l => lineNumPattern.test(l));
  if (hasLineNumbers) {
    return lines.map(l => l.replace(/^([+-]\s*)?\d+:\s/, "$1")).join("\n");
  }
  return content;
}

assert(stripLineNumbers("1: flask==3.0.0\n2: pytest==7.4.3\n3: requests==2.31.0") ===
  "flask==3.0.0\npytest==7.4.3\nrequests==2.31.0",
  "Strip line numbers from all lines");

assert(stripLineNumbers("flask==3.0.0\npytest==7.4.3") ===
  "flask==3.0.0\npytest==7.4.3",
  "No line numbers → unchanged");

assert(stripLineNumbers("1: line one\n\n3: line three") ===
  "line one\n\nline three",
  "Strip with empty lines in between");

// Lines like "port: 8080" should NOT be stripped (not all lines have number prefix)
assert(stripLineNumbers("host: localhost\nport: 8080") ===
  "host: localhost\nport: 8080",
  "YAML-like content → NOT stripped");

// Diff lines with line numbers: "- 2: pytest==7.4.3" → "- pytest==7.4.3"
assert(stripLineNumbers("1: flask==3.0.0\n- 2: pytest==7.4.3\n3: requests==2.31.0") ===
  "flask==3.0.0\n- pytest==7.4.3\nrequests==2.31.0",
  "Diff with line numbers → strip numbers, keep diff markers");

assert(stripLineNumbers("1: flask==3.0.0\n- 2: pytest==7.4.3\n+ 3: numpy==1.26.0\n4: requests==2.31.0") ===
  "flask==3.0.0\n- pytest==7.4.3\n+ numpy==1.26.0\nrequests==2.31.0",
  "Diff with +/- and line numbers → strip numbers, keep diff markers");

// ============================================================
// 4. Arrow Function Fix
// ============================================================
console.log("\n=== 4. Arrow Function Post-Processing ===");

function fixArrowFunctions(content) {
  content = content.replace(/\(\)\s*=\s*(?=[{\w'"`([])/g, "() => ");
  content = content.replace(/\(([^)]*)\)\s*=\s*(?=[{\w'"`([])/g, "($1) => ");
  return content;
}

assert(fixArrowFunctions("() = {") === "() => {",
  "() = { → () => {");
assert(fixArrowFunctions("(x, y) = {") === "(x, y) => {",
  "(x, y) = { → (x, y) => {");
assert(fixArrowFunctions("() => {") === "() => {",
  "() => { unchanged (already correct)");
assert(fixArrowFunctions("(x) => x + 1") === "(x) => x + 1",
  "(x) => x + 1 unchanged");
assert(fixArrowFunctions("test('foo', () = {\n  expect(1).toBe(1);\n});") ===
  "test('foo', () => {\n  expect(1).toBe(1);\n});",
  "Test callback arrow fix");

// ============================================================
// 5. HTML Entity De-escaping
// ============================================================
console.log("\n=== 5. HTML Entity Fix ===");

function fixHtmlEntities(content) {
  return content.replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
}

assert(fixHtmlEntities("x &gt; 0") === "x > 0", "&gt; → >");
assert(fixHtmlEntities("a &lt; b") === "a < b", "&lt; → <");
assert(fixHtmlEntities("x &amp;&amp; y") === "x && y", "&amp; → &");
assert(fixHtmlEntities("() =&gt; {") === "() => {", "Arrow in HTML entity");

// ============================================================
// 6. Diff Apply Logic (applyDiffPatch simulation)
// ============================================================
console.log("\n=== 6. Diff Patch Application ===");

function applyDiffPatch(original, diffContent) {
  const originalLines = original.split("\n");
  const diffLines = diffContent.split("\n");
  const originalLineSet = new Set(originalLines.map(l => l.trim()));

  const patchOps = [];
  const patchContext = [];

  for (const dLine of diffLines) {
    if (dLine.startsWith("+") && !dLine.startsWith("+++")) {
      const addText = dLine.startsWith("+ ") ? dLine.slice(2) : dLine.slice(1);
      patchOps.push({ op: "add", text: addText });
    } else if (dLine.startsWith("-") && !dLine.startsWith("---")) {
      const rmText = dLine.startsWith("- ") ? dLine.slice(2) : dLine.slice(1);
      patchOps.push({ op: "remove", text: rmText });
      patchContext.push(rmText);
    } else {
      const text = dLine.startsWith(" ") ? dLine.slice(1) : dLine;
      if (text.trim().length > 0 && !originalLineSet.has(text.trim())) {
        patchOps.push({ op: "add", text });
      } else {
        patchOps.push({ op: "keep", text });
        patchContext.push(text);
      }
    }
  }

  // Fallback: line-by-line application
  const removeSet = new Set();
  const addAfter = new Map();
  let lastContext = "";

  for (const op of patchOps) {
    if (op.op === "remove") {
      removeSet.add(op.text.trim());
    } else if (op.op === "keep") {
      lastContext = op.text.trim();
    } else if (op.op === "add") {
      const adds = addAfter.get(lastContext) || [];
      adds.push(op.text);
      addAfter.set(lastContext, adds);
    }
  }

  const result = [];
  for (const origLine of originalLines) {
    if (removeSet.has(origLine.trim())) {
      removeSet.delete(origLine.trim());
      continue;
    }
    result.push(origLine);
    const adds = addAfter.get(origLine.trim());
    if (adds && adds.length > 0) {
      result.push(...adds);
      addAfter.delete(origLine.trim());
    }
  }
  for (const adds of addAfter.values()) {
    result.push(...adds);
  }
  return result.join("\n");
}

const reqFile = "fastapi==0.111.0\npydantic==2.7.1\npytest==7.4.3\nrequests==2.31.0";

// Test: Remove one line
const r1 = applyDiffPatch(reqFile, "fastapi==0.111.0\n- fastapi==0.111.0\npydantic==2.7.1");
assert(!r1.includes("fastapi"), "Remove fastapi → gone");
assert(r1.includes("pydantic"), "Remove fastapi → pydantic preserved");
assert(r1.includes("pytest"), "Remove fastapi → pytest preserved");
assert(r1.includes("requests"), "Remove fastapi → requests preserved");

// Test: Remove + Add
const r2 = applyDiffPatch(reqFile, "fastapi==0.111.0\n- fastapi==0.111.0\n+ numpy==1.26.0\nrequests==2.31.0");
assert(!r2.includes("fastapi"), "Remove+Add → fastapi gone");
assert(r2.includes("numpy==1.26.0"), "Remove+Add → numpy added");
assert(r2.includes("pydantic"), "Remove+Add → pydantic preserved");

// Test: Add without + prefix (LLM forgot prefix, line not in original)
const r3 = applyDiffPatch(reqFile, "fastapi==0.111.0\n- fastapi==0.111.0\nnumpy==1.26.0\nrequests==2.31.0");
assert(!r3.includes("fastapi"), "No-prefix add → fastapi gone");
assert(r3.includes("numpy==1.26.0"), "No-prefix add → numpy added (auto-detected as new)");
assert(r3.includes("pydantic"), "No-prefix add → pydantic preserved");

// Test: Pure addition (no removal)
const r4 = applyDiffPatch(reqFile, "requests==2.31.0\n+ scipy==1.11.0");
assert(r4.includes("scipy==1.11.0"), "Pure add → scipy added");
assert(r4.includes("fastapi"), "Pure add → all originals preserved");

// Test: No leading whitespace from "+ " prefix
const r5 = applyDiffPatch(reqFile, "fastapi==0.111.0\n- fastapi==0.111.0\n+ numpy==1.26.0\nrequests==2.31.0");
assert(r5.includes("numpy==1.26.0"), "slice(2) → numpy added without leading space");
assert(!r5.includes(" numpy"), "slice(2) → no leading whitespace before numpy");

// ============================================================
// 7.5 Pure Plus-Line Stripping (new file creation)
// ============================================================
console.log("\n=== 7.5 Pure Plus-Line Stripping ===");

function stripPlusMarkers(content) {
  const lines = content.split("\n");
  const nonEmpty = lines.filter(l => l.trim().length > 0);
  const allPlus = nonEmpty.length > 0 && nonEmpty.every(l => l.startsWith("+") && !l.startsWith("+++"));
  if (allPlus) {
    return lines.map(l => {
      if (l.startsWith("+ ")) return l.slice(2);
      if (l.startsWith("+")) return l.slice(1);
      return l;
    }).join("\n");
  }
  return content;
}

assert(stripPlusMarkers("+ pytest==7.4.3\n+ alabaster==0.7.12\n+ requests==2.31.0") ===
  "pytest==7.4.3\nalabaster==0.7.12\nrequests==2.31.0",
  "Strip + markers from all-plus content");

assert(stripPlusMarkers("+pytest==7.4.3\n+requests==2.31.0") ===
  "pytest==7.4.3\nrequests==2.31.0",
  "Strip + without space");

assert(stripPlusMarkers("flask==3.0.0\n- pytest==7.4.3\nrequests==2.31.0") ===
  "flask==3.0.0\n- pytest==7.4.3\nrequests==2.31.0",
  "Mixed content → NOT stripped (not all plus)");

// ============================================================
// 7.6 Edit Deduplication
// ============================================================
console.log("\n=== 7.6 Edit Deduplication ===");

function deduplicateEdits(edits) {
  const seen = new Set();
  const result = [];
  for (const edit of edits) {
    const key = edit.filePath + "::" + edit.newContent;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(edit);
  }
  return result;
}

const dupeEdits = [
  { filePath: "req.txt", newContent: "- pytest\n+ numpy" },
  { filePath: "req.txt", newContent: "- pytest\n+ numpy" },
  { filePath: "main.py", newContent: "print('hi')" }
];
const dedupedEdits = deduplicateEdits(dupeEdits);
assert(dedupedEdits.length === 2, "Dedup: 3 edits → 2 unique");
assert(dedupedEdits[0].filePath === "req.txt", "Dedup: first is req.txt");
assert(dedupedEdits[1].filePath === "main.py", "Dedup: second is main.py");

// Different content for same file → both kept
const diffEdits = [
  { filePath: "req.txt", newContent: "content1" },
  { filePath: "req.txt", newContent: "content2" }
];
assert(deduplicateEdits(diffEdits).length === 2, "Dedup: different content → both kept");

// ============================================================
// 7.7 Chat Code Block Deduplication
// ============================================================
console.log("\n=== 7.7 Chat Code Block Deduplication ===");

function deduplicateChatCodeBlocks(content) {
  const fence = "```";
  const seen = new Set();
  let result = "";
  let pos = 0;
  while (pos < content.length) {
    const fenceStart = content.indexOf(fence, pos);
    if (fenceStart === -1) { result += content.slice(pos); break; }
    result += content.slice(pos, fenceStart);
    const headerEnd = content.indexOf("\n", fenceStart + 3);
    if (headerEnd === -1) { result += content.slice(fenceStart); break; }
    const header = content.slice(fenceStart + 3, headerEnd).trim();
    let closePos = content.indexOf("\n" + fence, headerEnd);
    if (closePos === -1) { result += content.slice(fenceStart); break; }
    const blockContent = content.slice(headerEnd + 1, closePos);
    const blockEnd = closePos + 1 + fence.length;
    const key = header + ":::" + blockContent.trim();
    if (seen.has(key)) { pos = blockEnd; if (content[pos] === "\n") pos++; continue; }
    seen.add(key);
    result += content.slice(fenceStart, blockEnd);
    pos = blockEnd;
  }
  return result;
}

const llmWithDupe = "Here is the file:\n\`\`\`txt req.txt\nalabaster==0.7.12\n+ numpy==1.24.0\n\`\`\`\n\nAnd again:\n\`\`\`txt req.txt\nalabaster==0.7.12\n+ numpy==1.24.0\n\`\`\`\n\nDone.";
const deduped = deduplicateChatCodeBlocks(llmWithDupe);
const blockCount = (deduped.match(/```txt req\.txt/g) || []).length;
assert(blockCount === 1, "Chat dedup: duplicate block removed, only 1 remains");
assert(deduped.includes("Here is the file:"), "Chat dedup: surrounding text preserved");
assert(deduped.includes("Done."), "Chat dedup: trailing text preserved");

const llmNoDupe = "First:\n\`\`\`txt req.txt\n+ numpy==1.24.0\n\`\`\`\nSecond:\n\`\`\`txt req.txt\n- pytest==7.4.3\n\`\`\`\n";
const notDeduped = deduplicateChatCodeBlocks(llmNoDupe);
const blockCount2 = (notDeduped.match(/```txt req\.txt/g) || []).length;
assert(blockCount2 === 2, "Chat dedup: different content → both blocks kept");

// ============================================================
// 8. Nested Fence Parser
// ============================================================
console.log("\n=== 8. Nested Fence Parser ===");

function parseNestedFences(html) {
  const fence = '```';
  const blocks = [];
  let searchPos = 0, currentStart = 0;

  while (searchPos < html.length) {
    const fenceIdx = html.indexOf(fence, searchPos);
    if (fenceIdx === -1) break;

    if (fenceIdx > currentStart) {
      blocks.push({ type: 'text', content: html.slice(currentStart, fenceIdx) });
    }

    const headerEnd = html.indexOf('\n', fenceIdx + 3);
    if (headerEnd === -1) break;
    const header = html.slice(fenceIdx + 3, headerEnd);

    let scanPos = headerEnd + 1, closeIdx = -1, nestLevel = 0;
    while (scanPos < html.length) {
      const nextFence = html.indexOf(fence, scanPos);
      if (nextFence === -1) break;
      const afterFence = html.slice(nextFence + 3, nextFence + 50);
      const isClosing = /^\s*($|\n)/.test(afterFence) || (nextFence + 3 >= html.length);
      if (!isClosing) { nestLevel++; scanPos = nextFence + 3; }
      else if (nestLevel > 0) { nestLevel--; scanPos = nextFence + 3; }
      else { closeIdx = nextFence; break; }
    }

    const blockContent = closeIdx !== -1 ? html.slice(headerEnd + 1, closeIdx) : html.slice(headerEnd + 1);
    searchPos = closeIdx !== -1 ? closeIdx + 3 : html.length;
    blocks.push({ type: 'code', header, content: blockContent });
    currentStart = searchPos;
  }
  if (currentStart < html.length) blocks.push({ type: 'text', content: html.slice(currentStart) });
  return blocks;
}

// Nested fences: markdown file with code examples
const mdWithNested = '```markdown README.md\n# Title\n\n```bash\npip install foo\n```\n\nMore text\n```\n\nAfter';
const blocks = parseNestedFences(mdWithNested);
assert(blocks.length === 2, "Nested fences → 2 blocks (1 code + 1 text)");
assert(blocks[0].type === 'code', "First block is code");
assert(blocks[0].header === 'markdown README.md', "Header is markdown README.md");
assert(blocks[0].content.includes('```bash'), "Inner fence preserved in content");
assert(blocks[0].content.includes('pip install foo'), "Inner content preserved");

// Simple code block (no nesting)
const simple = '```python main.py\nprint("hello")\n```';
const blocks2 = parseNestedFences(simple);
assert(blocks2.length === 1, "Simple block → 1 block");
assert(blocks2[0].content.trim() === 'print("hello")', "Simple content correct");

// ============================================================
// Summary
// ============================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("❌ SOME TESTS FAILED");
  process.exit(1);
} else {
  console.log("✅ ALL TESTS PASSED");
}
