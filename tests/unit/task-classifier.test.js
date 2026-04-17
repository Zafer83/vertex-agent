/**
 * Unit tests for src/ai/taskClassifier.ts
 * Tests the regex-based zero-token task complexity classifier.
 *
 * Scoring recap (from taskClassifier.ts):
 *   files >= 2  → +2
 *   files >= 3  → +1 extra (total +3 for 3+ files)
 *   complex keyword match → +2
 *   prompt > 400 chars  → +1
 *   multiline (>=3 lines) → +1
 *   conjunctions (>=2)  → +1
 *   threshold >= 3 → complex
 *
 * Run: node tests/unit/task-classifier.test.js
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

// ─── Inline the classifier (mirrors src/ai/taskClassifier.ts) ────────────────

const COMPLEX_KEYWORDS = [
  "refactor", "refactore", "refactoring", "umbauen", "umbau",
  "migrate", "migriere", "migration",
  "architektur", "architecture",
  "überarbeite", "ueberarbeite", "überarbeitung",
  "restructure", "umstrukturier",
  "security", "sicherheit", "audit", "pentest",
  "owasp", "cve", "vulnerability", "vulnerab",
  "optimize", "optimiere", "optimization", "performance",
  "komplett", "gesamt", "vollständig", "vollstaendig",
  "end-to-end", "e2e",
  "dependency injection", "solid", "clean architecture",
  "design pattern", "entwurfsmuster",
];

const TRIVIAL_KEYWORDS = [
  "typo", "tippfehler", "rechtschreib",
  "rename", "umbenenn",
  "formatier", "format",
];

function classifyTask(prompt, foundFiles, commandOnly, deleteIntent) {
  const normalizedPrompt = prompt.trim();
  const lowerPrompt = normalizedPrompt.toLowerCase();
  const signals = [];

  if (commandOnly) {
    return { complexity: "trivial", score: 0, signals: ["command_only"],
      needsJudge: false, needsOrchestrator: false, reason: "Command-only intent" };
  }
  if (deleteIntent) {
    return { complexity: "trivial", score: 0, signals: ["delete_intent"],
      needsJudge: false, needsOrchestrator: false, reason: "Delete intent" };
  }
  if (normalizedPrompt.length === 0) {
    return { complexity: "simple", score: 0, signals: ["empty_prompt"],
      needsJudge: false, needsOrchestrator: false, reason: "Empty prompt" };
  }

  const trivialKeywordHit = TRIVIAL_KEYWORDS.find(k => lowerPrompt.includes(k));
  if (trivialKeywordHit && foundFiles.length <= 1 && normalizedPrompt.length < 200) {
    return { complexity: "trivial", score: 0, signals: [`trivial_keyword:${trivialKeywordHit}`],
      needsJudge: false, needsOrchestrator: false, reason: `Trivial keyword "${trivialKeywordHit}"` };
  }

  let score = 0;
  if (foundFiles.length >= 2) { score += 2; signals.push(`files_2plus:${foundFiles.length}`); }
  if (foundFiles.length >= 3) { score += 1; signals.push(`files_3plus:${foundFiles.length}`); }

  const complexKeywordHit = COMPLEX_KEYWORDS.find(k => lowerPrompt.includes(k));
  if (complexKeywordHit) { score += 2; signals.push(`complex_keyword:${complexKeywordHit}`); }

  if (normalizedPrompt.length > 400) { score += 1; signals.push("long_prompt"); }

  if (normalizedPrompt.includes("\n")) {
    const lines = normalizedPrompt.split("\n").filter(l => l.trim().length > 0);
    if (lines.length >= 3) { score += 1; signals.push(`multiline:${lines.length}`); }
  }

  const conjunctionMatches = lowerPrompt.match(/\b(dann|then|danach|anschließend|anschliessend|außerdem|ausserdem|und\s+auch|und\s+dann)\b/g);
  if (conjunctionMatches && conjunctionMatches.length >= 2) {
    score += 1; signals.push(`conjunctions:${conjunctionMatches.length}`);
  }

  let complexity, reason;
  if (score >= 3) {
    complexity = "complex";
    reason = `Score ${score} >= 3`;
  } else if (normalizedPrompt.length < 60 && score === 0) {
    complexity = "simple";
    reason = "Short prompt, no signals";
  } else {
    complexity = "simple";
    reason = `Score ${score} < 3`;
  }

  return {
    complexity, score, signals,
    needsJudge: complexity === "complex",
    needsOrchestrator: complexity === "complex" && score >= 4,
    reason,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

console.log("\n=== 1. Trivial tasks — deterministic paths ===");

const trivialDelete = classifyTask("lösche datei old.py", [], false, true);
assert(trivialDelete.complexity === "trivial", "deleteIntent → trivial");
assert(trivialDelete.needsJudge === false, "deleteIntent → needsJudge=false");
assert(trivialDelete.score === 0, "deleteIntent → score=0");

const trivialCommand = classifyTask("mkdir src/components", [], true, false);
assert(trivialCommand.complexity === "trivial", "commandOnly → trivial");
assert(trivialCommand.needsJudge === false, "commandOnly → needsJudge=false");

console.log("\n=== 2. Trivial keyword short-circuits ===");

const trivialTypo = classifyTask("fixe den typo in main.py", ["main.py"], false, false);
assert(trivialTypo.complexity === "trivial", "typo keyword + 1 file + short → trivial");
assert(trivialTypo.needsJudge === false, "typo → needsJudge=false");

const trivialRename = classifyTask("rename file.py to utils.py", ["file.py"], false, false);
assert(trivialRename.complexity === "trivial", "rename keyword → trivial");

const trivialFormat = classifyTask("formatiere main.ts", ["main.ts"], false, false);
assert(trivialFormat.complexity === "trivial", "formatiere keyword → trivial");

// Trivial keyword with 2 files → trivial short-circuit skipped (foundFiles.length > 1)
// score = 2 (2 files) → simple
const trivialMultiFile = classifyTask("fixe typo in main.py und utils.py", ["main.py", "utils.py"], false, false);
assert(trivialMultiFile.complexity !== "trivial", "trivial keyword + 2 files → trivial short-circuit bypassed");
assert(trivialMultiFile.complexity === "simple", "trivial keyword + 2 files → simple (score=2)");

console.log("\n=== 3. Simple tasks ===");

const simpleSingle = classifyTask("erstelle eine python funktion die add(a,b) berechnet", [], false, false);
assert(simpleSingle.complexity === "simple", "short single-file task → simple");
assert(simpleSingle.needsJudge === false, "simple → needsJudge=false");
assert(simpleSingle.needsOrchestrator === false, "simple → needsOrchestrator=false");

const simpleShort = classifyTask("fixe den bug in main.py", ["main.py"], false, false);
assert(simpleShort.complexity === "simple", "1-file bug fix → simple");

// Keyword alone (no files, no length, no multiline) = score 2 → simple
const keywordAlone = classifyTask("refactore die funktion", [], false, false);
assert(keywordAlone.score === 2, "refactor keyword alone → score=2");
assert(keywordAlone.complexity === "simple", "keyword score=2 < 3 → simple (not complex)");

// Security keyword alone → score=2 → simple
const securityAlone = classifyTask("security check in utils.py", ["utils.py"], false, false);
assert(securityAlone.score === 2, "security keyword + 1 file → score=2");
assert(securityAlone.complexity === "simple", "security keyword alone → simple (score<3)");

const simpleEmpty = classifyTask("", [], false, false);
assert(simpleEmpty.complexity === "simple", "empty prompt → simple (not trivial)");
assert(simpleEmpty.needsJudge === false, "empty → needsJudge=false");

// 2 files with no keyword → score=2 → simple
const twoFilesNoKeyword = classifyTask("add logging to main.py and utils.py", ["main.py", "utils.py"], false, false);
assert(twoFilesNoKeyword.score === 2, "2 files no keyword → score=2");
assert(twoFilesNoKeyword.complexity === "simple", "2 files, no keyword, score=2 → simple");

console.log("\n=== 4. Complex tasks — combined signals ===");

// keyword (2) + 2 files (2) = 4 → complex
const complexKwAnd2Files = classifyTask(
  "refactore main.py und utils.py",
  ["main.py", "utils.py"],
  false, false
);
assert(complexKwAnd2Files.score >= 4, "refactor + 2 files → score >=4");
assert(complexKwAnd2Files.complexity === "complex", "refactor + 2 files → complex");
assert(complexKwAnd2Files.needsJudge === true, "complex → needsJudge=true");
assert(complexKwAnd2Files.needsOrchestrator === true, "score 4 → needsOrchestrator=true");

// keyword (2) + long prompt (1) = 3 → complex
const longPrompt =
  "Please refactor the entire authentication module so that it follows clean code principles. " +
  "All functions should have proper type annotations and docstrings. Error handling must be specific " +
  "with no bare except clauses. The logging must use structured JSON format. Dependencies should be " +
  "injected via constructor parameters rather than imported globally. The new code must pass all " +
  "existing tests without modification. Please provide the complete implementation.";
assert(longPrompt.length > 400, "long prompt test setup: prompt is >400 chars");
const complexKwLong = classifyTask(longPrompt, [], false, false);
assert(complexKwLong.score >= 3, "refactor keyword + long prompt → score >=3");
assert(complexKwLong.complexity === "complex", "keyword + long prompt → complex");
assert(complexKwLong.needsJudge === true, "complex → needsJudge=true");

// keyword (2) + multiline (1) = 3 → complex
const complexKwMultiline = classifyTask(
  "security audit für folgende Dateien:\n- src/auth.ts\n- src/api.ts\n- src/utils.ts\nbitte gründlich prüfen",
  [], false, false
);
assert(complexKwMultiline.score >= 3, "security + multiline → score >=3");
assert(complexKwMultiline.complexity === "complex", "security keyword + multiline → complex");

// 3 files alone (3) → complex
const threeFiles = classifyTask(
  "aktualisiere main.py, utils.py und tests.py",
  ["main.py", "utils.py", "tests.py"],
  false, false
);
assert(threeFiles.score >= 3, "3 files → score=3");
assert(threeFiles.complexity === "complex", "3 files → complex");
assert(threeFiles.needsJudge === true, "3 files → needsJudge=true");

// German keywords
const complexMigriere = classifyTask("migriere main.py und app.ts", ["main.py", "app.ts"], false, false);
assert(complexMigriere.complexity === "complex", "migriere + 2 files → complex");

const complexArchitektur = classifyTask(
  "verbessere die architektur von src/",
  ["src/auth.ts", "src/api.ts"],
  false, false
);
assert(complexArchitektur.complexity === "complex", "architektur + 2 files → complex");

// optimize + 2 files → complex
const complexOptimize = classifyTask(
  "optimize the data processing in main.py and utils.py",
  ["main.py", "utils.py"],
  false, false
);
assert(complexOptimize.complexity === "complex", "optimize + 2 files → complex");

console.log("\n=== 5. Orchestrator threshold (score >= 4) ===");

const orchestratorTask = classifyTask(
  "refactore src/auth/, src/api/, und src/models/ auf clean architecture mit dependency injection",
  ["src/auth/index.ts", "src/api/client.ts", "src/models/user.ts"],
  false, false
);
assert(orchestratorTask.score >= 4, "refactor + 3 files → score >=4");
assert(orchestratorTask.needsOrchestrator === true, "score >=4 → needsOrchestrator=true");

const noOrchestrator = classifyTask("aktualisiere main.py, utils.py und tests.py",
  ["main.py", "utils.py", "tests.py"], false, false);
assert(noOrchestrator.score === 3, "3 files no keyword → score=3");
assert(noOrchestrator.needsOrchestrator === false, "score=3 (< 4) → needsOrchestrator=false");

console.log("\n=== 6. Long prompt and multiline signals ===");

const multilineTask = classifyTask(
  "Erstelle folgende Struktur:\n- src/main.py\n- src/utils.py\n- tests/test_main.py\n- README.md",
  [], false, false
);
assert(multilineTask.signals.some(s => s.startsWith("multiline")), "4-line prompt → multiline signal");

const conjunctionTask = classifyTask(
  "erstelle die datei dann kompiliere sie und dann führe die Tests aus und dann push",
  [], false, false
);
assert(conjunctionTask.signals.some(s => s.startsWith("conjunctions")), "dann/und dann → conjunction signal");

console.log("\n=== 7. Edge cases ===");

const whitespaceOnly = classifyTask("   ", [], false, false);
assert(whitespaceOnly.complexity === "simple", "whitespace-only → simple");

const versionNumber = classifyTask("7.4.3 problem in requirements.txt", ["requirements.txt"], false, false);
assert(versionNumber.complexity === "simple", "version number in prompt → simple (not complex keyword)");

const onlyFilenames = classifyTask("main.py utils.py", ["main.py", "utils.py"], false, false);
assert(onlyFilenames.score === 2, "2 foundFiles, no keyword → score=2");
assert(onlyFilenames.complexity === "simple", "2 files, no keyword → simple");

// e2e keyword alone → score=2 → simple
const e2eAlone = classifyTask("schreibe e2e tests für die login-pipeline", [], false, false);
assert(e2eAlone.score === 2, "e2e keyword alone → score=2");
assert(e2eAlone.complexity === "simple", "e2e keyword alone → simple (score<3)");

// e2e keyword + 2 files → complex
const e2eWithFiles = classifyTask(
  "schreibe end-to-end tests für main.py und api.py",
  ["main.py", "api.py"],
  false, false
);
assert(e2eWithFiles.complexity === "complex", "e2e + 2 files → complex");

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED`);
  process.exit(1);
} else {
  console.log("All task-classifier tests passed ✅");
}
