/**
 * Unit tests for src/agent/orchestrator.ts — Planner JSON parsing and fallback logic.
 *
 * Tests the pure logic layers (JSON extraction, plan validation, role sanitization)
 * without making any real HTTP calls.
 *
 * Run: node tests/unit/orchestrator-planning.test.js
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

// ─── Inline plan parsing logic (mirrors orchestrator.ts) ─────────────────────

const VALID_ROLES = ["planner", "coder", "refactor_expert", "security_auditor", "test_writer"];

function sanitizeRole(role) {
  return VALID_ROLES.includes(role) ? role : "coder";
}

function parsePlanFromContent(content, userPrompt, foundFiles) {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return fallbackPlan(userPrompt, foundFiles);

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return fallbackPlan(userPrompt, foundFiles);
  }

  const steps = (Array.isArray(parsed.steps) ? parsed.steps : []).map((s, i) => ({
    id: typeof s.id === "number" ? s.id : i + 1,
    role: sanitizeRole(s.role),
    description: typeof s.description === "string" ? s.description : "code task",
    targetFiles: Array.isArray(s.targetFiles) ? s.targetFiles : [],
    input: typeof s.input === "string" ? s.input : userPrompt,
  }));

  if (steps.length === 0) return fallbackPlan(userPrompt, foundFiles);

  return {
    steps,
    parallelizable: parsed.parallelizable !== false,
  };
}

function fallbackPlan(userPrompt, foundFiles) {
  return {
    steps: [{ id: 1, role: "coder", description: "Implement the requested changes",
      targetFiles: foundFiles, input: userPrompt }],
    parallelizable: false,
  };
}

// ─── Code block extraction (mirrors orchestrator.ts) ─────────────────────────

const LANG_KEYWORDS = new Set([
  "python", "typescript", "javascript", "java", "go", "rust", "cpp", "c",
  "bash", "sh", "json", "yaml", "yml", "toml", "txt", "sql", "html", "css",
  "jsx", "tsx", "md", "markdown", "plaintext",
]);

function extractEditsFromContent(content) {
  const edits = [];
  const fence = "```";
  let pos = 0;

  while (pos < content.length) {
    const open = content.indexOf(fence, pos);
    if (open === -1) break;

    const headerEnd = content.indexOf("\n", open + 3);
    if (headerEnd === -1) break;

    const header = content.slice(open + 3, headerEnd).trim();
    const close = content.indexOf("\n" + fence, headerEnd);
    if (close === -1) break;

    const codeContent = content.slice(headerEnd + 1, close);
    pos = close + 1 + fence.length;

    const parts = header.match(/^(\w+)\s+(.+)$/);
    let filePath = header;
    if (parts) {
      const lang = parts[1].toLowerCase();
      const rest = parts[2].trim();
      if (LANG_KEYWORDS.has(lang) && rest) filePath = rest;
    }

    if (!filePath || LANG_KEYWORDS.has(filePath.toLowerCase())) continue;
    if (!filePath.includes("/") && !/\.\w{1,10}$/.test(filePath)) continue;
    if (filePath.startsWith("/") || filePath.includes("..")) continue;

    const trimmed = codeContent.trim().toUpperCase();
    if (trimmed === "DELETE" || trimmed === "DELETE FILE") {
      edits.push({ filePath, newContent: "DELETE" });
    } else {
      edits.push({ filePath, newContent: codeContent });
    }
  }

  return edits;
}

// ─── Edit deduplication ───────────────────────────────────────────────────────

function deduplicateEdits(edits) {
  const map = new Map();
  for (const edit of edits) map.set(edit.filePath, edit);
  return Array.from(map.values());
}

// ─────────────────────────────────────────────────────────────────────────────

console.log("\n=== 1. Well-formed planner JSON ===");

const wellFormedPlan = parsePlanFromContent(`
{
  "steps": [
    {
      "id": 1,
      "role": "coder",
      "description": "Refactor auth module",
      "targetFiles": ["src/auth/index.ts"],
      "input": "Refactor src/auth/index.ts to use dependency injection"
    },
    {
      "id": 2,
      "role": "security_auditor",
      "description": "Security check",
      "targetFiles": ["src/auth/index.ts"],
      "input": "Check for hardcoded secrets in src/auth/index.ts"
    }
  ],
  "parallelizable": true
}
`, "refactor auth", ["src/auth/index.ts"]);

assert(wellFormedPlan.steps.length === 2, "2 steps parsed");
assert(wellFormedPlan.parallelizable === true, "parallelizable=true");
assert(wellFormedPlan.steps[0].role === "coder", "first step is coder");
assert(wellFormedPlan.steps[1].role === "security_auditor", "second step is security_auditor");
assert(wellFormedPlan.steps[0].targetFiles[0] === "src/auth/index.ts", "targetFiles preserved");
assert(wellFormedPlan.steps[0].input.includes("dependency injection"), "input preserved");

console.log("\n=== 2. Planner JSON wrapped in prose ===");

const wrappedPlan = parsePlanFromContent(
  "I've analyzed the task. Here's my plan:\n\n" +
  '{"steps":[{"id":1,"role":"refactor_expert","description":"Extract service","targetFiles":["src/service.ts"],"input":"Extract data access to repository pattern"}],"parallelizable":false}\n\n' +
  "This should be done sequentially.",
  "refactor service", ["src/service.ts"]
);
assert(wrappedPlan.steps.length === 1, "JSON extracted from prose");
assert(wrappedPlan.steps[0].role === "refactor_expert", "role correct from prose");
assert(wrappedPlan.parallelizable === false, "parallelizable=false from prose");

console.log("\n=== 3. Fallback scenarios ===");

// No JSON in planner response
const noJsonPlan = parsePlanFromContent("I cannot decompose this task.", "add logging", []);
assert(noJsonPlan.steps.length === 1, "no JSON → fallback: 1 step");
assert(noJsonPlan.steps[0].role === "coder", "no JSON → fallback role=coder");
assert(noJsonPlan.parallelizable === false, "no JSON → fallback parallelizable=false");

// Empty steps array
const emptyStepsPlan = parsePlanFromContent('{"steps":[],"parallelizable":true}', "add logging", []);
assert(emptyStepsPlan.steps.length === 1, "empty steps → fallback: 1 step");
assert(emptyStepsPlan.steps[0].input === "add logging", "fallback uses userPrompt as input");

// Malformed JSON
const malformedPlan = parsePlanFromContent("{steps: invalid json}", "add logging", ["main.py"]);
assert(malformedPlan.steps.length === 1, "malformed JSON → fallback");
assert(malformedPlan.steps[0].targetFiles[0] === "main.py", "fallback uses foundFiles");

// Missing fields use defaults
const missingFieldsPlan = parsePlanFromContent(
  '{"steps":[{"role":"coder"}],"parallelizable":true}',
  "add logging", []
);
assert(missingFieldsPlan.steps[0].id === 1, "missing id → defaults to 1");
assert(missingFieldsPlan.steps[0].description === "code task", "missing description → default");

console.log("\n=== 4. Role sanitization ===");

assert(sanitizeRole("coder") === "coder", "coder valid");
assert(sanitizeRole("security_auditor") === "security_auditor", "security_auditor valid");
assert(sanitizeRole("test_writer") === "test_writer", "test_writer valid");
assert(sanitizeRole("refactor_expert") === "refactor_expert", "refactor_expert valid");
assert(sanitizeRole("unknown_role") === "coder", "unknown role → coder");
assert(sanitizeRole("") === "coder", "empty role → coder");
assert(sanitizeRole("CODER") === "coder", "wrong case → fallback to coder (not in VALID_ROLES as-is)");

console.log("\n=== 5. Step count capped by maxSubAgents ===");

const manyStepsPlan = parsePlanFromContent(`{
  "steps": [
    {"id":1,"role":"coder","description":"step1","input":"do step 1","targetFiles":["a.py"]},
    {"id":2,"role":"coder","description":"step2","input":"do step 2","targetFiles":["b.py"]},
    {"id":3,"role":"coder","description":"step3","input":"do step 3","targetFiles":["c.py"]},
    {"id":4,"role":"coder","description":"step4","input":"do step 4","targetFiles":["d.py"]},
    {"id":5,"role":"coder","description":"step5","input":"do step 5","targetFiles":["e.py"]}
  ],
  "parallelizable": true
}`, "big task", ["a.py","b.py","c.py","d.py","e.py"]);

const maxSubAgents = 3;
const capped = manyStepsPlan.steps.slice(0, maxSubAgents);
assert(capped.length === 3, "slice to maxSubAgents=3 → 3 steps");
assert(capped[2].id === 3, "correct steps kept after cap");

console.log("\n=== 6. Code block extraction ===");

const llmOutput = `
Ich habe die Dateien aktualisiert.

\`\`\`python src/auth.py
import os

def get_api_key():
    return os.environ["API_KEY"]
\`\`\`

\`\`\`typescript src/client.ts
const client = new HttpClient();
export default client;
\`\`\`
`;

const edits = extractEditsFromContent(llmOutput);
assert(edits.length === 2, "2 code blocks extracted");
assert(edits[0].filePath === "src/auth.py", "first file path correct");
assert(edits[1].filePath === "src/client.ts", "second file path correct");
assert(edits[0].newContent.includes("import os"), "content preserved");
assert(edits[1].newContent.includes("HttpClient"), "TS content preserved");

// Path traversal blocked
const traversalOutput = `\`\`\`python ../../../etc/passwd\nhacked\n\`\`\``;
const traversalEdits = extractEditsFromContent(traversalOutput);
assert(traversalEdits.length === 0, "path traversal blocked");

// Language-only block (no filepath) — not extracted
const langOnlyOutput = `\`\`\`python\nprint("hello")\n\`\`\``;
const langOnlyEdits = extractEditsFromContent(langOnlyOutput);
assert(langOnlyEdits.length === 0, "language-only block (no filepath) → not extracted");

// DELETE action
const deleteOutput = `\`\`\`bash old_tests/test_legacy.py\nDELETE\n\`\`\``;
const deleteEdits = extractEditsFromContent(deleteOutput);
assert(deleteEdits.length === 1, "DELETE action extracted");
assert(deleteEdits[0].newContent === "DELETE", "DELETE content preserved");

console.log("\n=== 7. Edit deduplication (last-write-wins) ===");

const multiEdits = [
  { filePath: "src/auth.py", newContent: "version 1" },
  { filePath: "src/utils.py", newContent: "util code" },
  { filePath: "src/auth.py", newContent: "version 2 (corrected)" },
];
const deduped = deduplicateEdits(multiEdits);
assert(deduped.length === 2, "3 edits → 2 unique files");
assert(deduped.find(e => e.filePath === "src/auth.py")?.newContent === "version 2 (corrected)",
  "last-write-wins: corrected version kept");
assert(deduped.find(e => e.filePath === "src/utils.py") !== undefined, "non-duplicate preserved");

console.log("\n=== 8. Security keyword detection ===");

function hasSecurityKeywords(text) {
  const KEYWORDS = ["auth", "authentication", "authoriz", "login", "password", "passwd",
    "secret", "token", "api.?key", "credential", "oauth", "jwt",
    "encrypt", "decrypt", "crypto", "hash", "salt",
    "sql", "query", "injection", "sanitiz", "xss", "csrf"];
  const lower = text.toLowerCase();
  return KEYWORDS.some(kw => new RegExp(kw).test(lower));
}

assert(hasSecurityKeywords("add authentication to the API"), "authentication → security trigger");
assert(hasSecurityKeywords("check for SQL injection in user input"), "SQL injection → trigger");
assert(hasSecurityKeywords("generate a JWT token"), "JWT token → trigger");
assert(hasSecurityKeywords("encrypt the password before storing"), "encrypt/password → trigger");
assert(!hasSecurityKeywords("refactor the data processing pipeline"), "no keywords → no trigger");
assert(!hasSecurityKeywords("add logging to main.py"), "logging → no trigger");

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED`);
  process.exit(1);
} else {
  console.log("All orchestrator-planning tests passed ✅");
}
