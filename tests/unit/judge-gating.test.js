/**
 * Unit tests for judge.ts and judge-gate conditions in aiClient.ts.
 *
 * Since judge.ts makes HTTP calls (undici request) and aiClient.ts uses vscode,
 * we test the pure logic layers directly:
 *   1. Judge JSON parsing & verdict construction
 *   2. Fail-open behaviour on various error scenarios
 *   3. Condition checks (shouldRunJudge) mirrored from aiClient.ts
 *   4. Integration: mock judgeEdits function ↔ retry logic
 *
 * Run: node tests/unit/judge-gating.test.js
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

// ─── Inline judge logic (mirrors src/ai/judge.ts) ────────────────────────────

function buildJudgeVerdict(content) {
  const jsonMatch = content.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) {
    return { approved: true, issues: [], confidence: 0.5, rawResponse: content };
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return { approved: true, issues: [], confidence: 0.5, rawResponse: content };
  }
  return {
    approved: parsed.approved === true,
    issues: Array.isArray(parsed.issues) ? parsed.issues.filter(i => typeof i === "string") : [],
    confidence: typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0.7,
    rawResponse: content,
  };
}

function formatEditsForJudge(edits, maxTotalChars = 2000) {
  const parts = [];
  let totalChars = 0;
  for (const edit of edits) {
    if (totalChars >= maxTotalChars) {
      parts.push(`... (more files not shown)`);
      break;
    }
    if (edit.newContent === "DELETE") {
      const entry = `FILE: ${edit.filePath}\nACTION: DELETE`;
      parts.push(entry);
      totalChars += entry.length;
      continue;
    }
    const preview = edit.newContent.slice(0, 600);
    const truncated = edit.newContent.length > 600 ? "\n...[truncated]" : "";
    const entry = `FILE: ${edit.filePath}\n${preview}${truncated}`;
    parts.push(entry);
    totalChars += entry.length;
  }
  return parts.join("\n\n").trim();
}

// ─── Inline shouldRunJudge check (mirrors aiClient.ts judge gate conditions) ──

function shouldRunJudge({ judgeEnabled, classified, edits, stream, provider, multiAgentForOllama }) {
  return (
    judgeEnabled &&
    classified.needsJudge &&
    edits.length > 0 &&
    !stream &&
    !(provider === "ollama" && !multiAgentForOllama)
  );
}

// ─────────────────────────────────────────────────────────────────────────────

console.log("\n=== 1. Judge verdict construction ===");

// Well-formed approved verdict
const verdictApproved = buildJudgeVerdict('{"approved": true, "issues": [], "confidence": 0.95}');
assert(verdictApproved.approved === true, "approved=true verdict parsed correctly");
assert(verdictApproved.issues.length === 0, "empty issues array preserved");
assert(verdictApproved.confidence === 0.95, "confidence 0.95 preserved");

// Well-formed rejected verdict with issues
const verdictRejected = buildJudgeVerdict(
  '{"approved": false, "issues": ["Missing import", "Hardcoded API key"], "confidence": 0.88}'
);
assert(verdictRejected.approved === false, "approved=false parsed correctly");
assert(verdictRejected.issues.length === 2, "2 issues parsed");
assert(verdictRejected.issues[0] === "Missing import", "first issue text preserved");
assert(verdictRejected.confidence === 0.88, "confidence 0.88 preserved");

// LLM wraps JSON in markdown — still extracted
const verdictMarkdown = buildJudgeVerdict(
  "Ich habe die Edits geprüft und mein Urteil lautet:\n\n" +
  '{"approved": false, "issues": ["Broken arrow function syntax"], "confidence": 0.82}\n\n' +
  "Die Edits haben ein syntaktisches Problem."
);
assert(verdictMarkdown.approved === false, "JSON extracted from markdown prose");
assert(verdictMarkdown.issues[0] === "Broken arrow function syntax", "issue text correct");

console.log("\n=== 2. Fail-open scenarios ===");

// No JSON in response → fail-open approved
const noJson = buildJudgeVerdict("Ich kann die Aufgabe nicht prüfen.");
assert(noJson.approved === true, "no JSON → fail-open approved=true");
assert(noJson.confidence === 0.5, "no JSON → confidence 0.5");

// Empty response → fail-open
const empty = buildJudgeVerdict("");
assert(empty.approved === true, "empty response → fail-open");

// Malformed JSON → fail-open
const malformed = buildJudgeVerdict("{approved: true, issues: []}");
assert(malformed.approved === true, "malformed JSON → fail-open (approved=true)");

// approved field missing → fail-open (approved !== true)
const missingApproved = buildJudgeVerdict('{"issues": [], "confidence": 0.9}');
assert(missingApproved.approved === false, "missing approved → false (not explicitly true)");

// issues not an array → safe empty array
const badIssues = buildJudgeVerdict('{"approved": false, "issues": "some text", "confidence": 0.7}');
assert(Array.isArray(badIssues.issues), "non-array issues → empty array");
assert(badIssues.issues.length === 0, "non-array issues → empty (no strings filtered in)");

// confidence out of range → clamped
const highConfidence = buildJudgeVerdict('{"approved": true, "issues": [], "confidence": 1.5}');
assert(highConfidence.confidence <= 1.0, "confidence >1 → clamped to 1");
const negativeConfidence = buildJudgeVerdict('{"approved": true, "issues": [], "confidence": -0.3}');
assert(negativeConfidence.confidence >= 0, "confidence <0 → clamped to 0");

console.log("\n=== 3. shouldRunJudge gate conditions ===");

const complexClassified = { needsJudge: true };
const simpleClassified = { needsJudge: false };
const someEdits = [{ filePath: "main.py", newContent: "print('hello')" }];
const noEdits = [];

// Normal complex task with edits → should run
assert(
  shouldRunJudge({ judgeEnabled: true, classified: complexClassified, edits: someEdits,
    stream: false, provider: "gemini", multiAgentForOllama: false }) === true,
  "complex task + edits + gemini → should run judge"
);

// Judge disabled via setting → skip
assert(
  shouldRunJudge({ judgeEnabled: false, classified: complexClassified, edits: someEdits,
    stream: false, provider: "gemini", multiAgentForOllama: false }) === false,
  "judgeEnabled=false → judge skipped"
);

// Simple task → skip (needsJudge=false)
assert(
  shouldRunJudge({ judgeEnabled: true, classified: simpleClassified, edits: someEdits,
    stream: false, provider: "gemini", multiAgentForOllama: false }) === false,
  "simple task → judge skipped (needsJudge=false)"
);

// No edits produced → skip
assert(
  shouldRunJudge({ judgeEnabled: true, classified: complexClassified, edits: noEdits,
    stream: false, provider: "gemini", multiAgentForOllama: false }) === false,
  "no edits → judge skipped"
);

// Streaming mode → skip (judge needs sync response)
assert(
  shouldRunJudge({ judgeEnabled: true, classified: complexClassified, edits: someEdits,
    stream: true, provider: "openai", multiAgentForOllama: false }) === false,
  "streaming mode → judge skipped"
);

// Ollama + multiAgentForOllama=false → skip
assert(
  shouldRunJudge({ judgeEnabled: true, classified: complexClassified, edits: someEdits,
    stream: false, provider: "ollama", multiAgentForOllama: false }) === false,
  "ollama + multiAgentForOllama=false → judge skipped"
);

// Ollama + multiAgentForOllama=true → run
assert(
  shouldRunJudge({ judgeEnabled: true, classified: complexClassified, edits: someEdits,
    stream: false, provider: "ollama", multiAgentForOllama: true }) === true,
  "ollama + multiAgentForOllama=true → judge runs"
);

// Claude → always runs (cloud provider)
assert(
  shouldRunJudge({ judgeEnabled: true, classified: complexClassified, edits: someEdits,
    stream: false, provider: "claude", multiAgentForOllama: false }) === true,
  "claude provider → judge runs"
);

console.log("\n=== 4. Retry trigger logic ===");

// Retry should trigger when: !approved AND confidence >= threshold AND issues.length > 0
function shouldTriggerRetry(verdict, judgeMinConfidence) {
  return !verdict.approved && verdict.confidence >= judgeMinConfidence && verdict.issues.length > 0;
}

const rejectedHighConf = { approved: false, issues: ["Bad import"], confidence: 0.85 };
assert(shouldTriggerRetry(rejectedHighConf, 0.7) === true,
  "rejected + confidence 0.85 >= 0.7 → retry triggered");

const rejectedLowConf = { approved: false, issues: ["Uncertain issue"], confidence: 0.4 };
assert(shouldTriggerRetry(rejectedLowConf, 0.7) === false,
  "rejected + confidence 0.4 < 0.7 → no retry (low confidence verdict)");

const approvedHigh = { approved: true, issues: [], confidence: 0.95 };
assert(shouldTriggerRetry(approvedHigh, 0.7) === false,
  "approved → no retry");

const rejectedNoIssues = { approved: false, issues: [], confidence: 0.9 };
assert(shouldTriggerRetry(rejectedNoIssues, 0.7) === false,
  "rejected + no issues → no retry (nothing to constrain the LLM with)");

// Boundary: confidence exactly at threshold
const exactThreshold = { approved: false, issues: ["Issue"], confidence: 0.7 };
assert(shouldTriggerRetry(exactThreshold, 0.7) === true,
  "confidence exactly at threshold → retry triggered (>=)");

console.log("\n=== 5. Edit formatting for judge ===");

const editsForJudge = [
  { filePath: "src/main.py", newContent: "import os\n\ndef main():\n    pass" },
  { filePath: "requirements.txt", newContent: "DELETE" },
];
const formatted = formatEditsForJudge(editsForJudge);
assert(formatted.includes("src/main.py"), "formatted includes file path");
assert(formatted.includes("import os"), "formatted includes file content");
assert(formatted.includes("DELETE"), "DELETE action shown");
assert(formatted.includes("FILE: requirements.txt"), "DELETE file has FILE: prefix");

// Long content is truncated
const longContent = "x".repeat(1000);
const longEdits = [{ filePath: "big.py", newContent: longContent }];
const longFormatted = formatEditsForJudge(longEdits);
assert(longFormatted.includes("[truncated]"), "content > 600 chars → truncated with [truncated]");

// Max total chars respected
const manyEdits = Array.from({ length: 10 }, (_, i) => ({
  filePath: `file${i}.py`,
  newContent: "x".repeat(300),
}));
const manyFormatted = formatEditsForJudge(manyEdits, 1000);
assert(manyFormatted.includes("more files not shown"), "max chars → truncation message");

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED`);
  process.exit(1);
} else {
  console.log("All judge-gating tests passed ✅");
}
