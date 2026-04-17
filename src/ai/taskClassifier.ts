/**
 * Task Classifier — zero-token regex-based heuristic that decides whether
 * a user prompt warrants extra quality gates (judge, orchestrator).
 *
 * Philosophy: never spend LLM tokens on classification. Use pure regex/keyword
 * signals so trivial and simple tasks bypass all overhead while complex tasks
 * opt in to the full quality pipeline.
 */

export type TaskComplexity = "trivial" | "simple" | "complex";

export interface ClassifiedTask {
  complexity: TaskComplexity;
  score: number;
  signals: string[];
  needsJudge: boolean;
  needsOrchestrator: boolean;
  reason: string;
}

/**
 * Keywords that signal a complex task regardless of length or file count.
 * German and English variants covered.
 */
const COMPLEX_KEYWORDS = [
  // Refactoring / architecture
  "refactor", "refactore", "refactoring", "umbauen", "umbau",
  "migrate", "migriere", "migration",
  "architektur", "architecture",
  "überarbeite", "ueberarbeite", "überarbeitung",
  "restructure", "umstrukturier",

  // Security / audit
  "security", "sicherheit", "audit", "pentest",
  "owasp", "cve", "vulnerability", "vulnerab",

  // Optimization
  "optimize", "optimiere", "optimization", "performance",

  // Multi-step / comprehensive
  "komplett", "gesamt", "vollständig", "vollstaendig",
  "end-to-end", "e2e",

  // Design patterns
  "dependency injection", "solid", "clean architecture",
  "design pattern", "entwurfsmuster",
];

/**
 * Keywords that signal a trivial edit even if the prompt is longer.
 */
const TRIVIAL_KEYWORDS = [
  "typo", "tippfehler", "rechtschreib",
  "rename", "umbenenn",
  "formatier", "format",
];

export function classifyTask(
  prompt: string,
  foundFiles: string[],
  commandOnly: boolean,
  deleteIntent: boolean
): ClassifiedTask {
  const normalizedPrompt = prompt.trim();
  const lowerPrompt = normalizedPrompt.toLowerCase();
  const signals: string[] = [];

  // Hard short-circuits for trivial tasks — these bypass the LLM entirely
  // or use the deterministic command path.
  if (commandOnly) {
    return {
      complexity: "trivial",
      score: 0,
      signals: ["command_only"],
      needsJudge: false,
      needsOrchestrator: false,
      reason: "Command-only intent (mkdir/touch/rm) — deterministic path",
    };
  }

  if (deleteIntent) {
    return {
      complexity: "trivial",
      score: 0,
      signals: ["delete_intent"],
      needsJudge: false,
      needsOrchestrator: false,
      reason: "File deletion intent — deterministic path",
    };
  }

  // Empty / whitespace-only prompt — treat as simple (LLM will produce a
  // friendly error rather than being subjected to a judge round).
  if (normalizedPrompt.length === 0) {
    return {
      complexity: "simple",
      score: 0,
      signals: ["empty_prompt"],
      needsJudge: false,
      needsOrchestrator: false,
      reason: "Empty prompt",
    };
  }

  // Trivial keyword short-circuit (typo fixes, renames, formatting).
  const trivialKeywordHit = TRIVIAL_KEYWORDS.find((k) => lowerPrompt.includes(k));
  if (trivialKeywordHit && foundFiles.length <= 1 && normalizedPrompt.length < 200) {
    return {
      complexity: "trivial",
      score: 0,
      signals: [`trivial_keyword:${trivialKeywordHit}`],
      needsJudge: false,
      needsOrchestrator: false,
      reason: `Trivial edit keyword "${trivialKeywordHit}" with single-file scope`,
    };
  }

  // Heuristic scoring — additive; threshold 3 = complex.
  let score = 0;

  if (foundFiles.length >= 2) {
    score += 2;
    signals.push(`files_2plus:${foundFiles.length}`);
  }
  if (foundFiles.length >= 3) {
    score += 1; // 3+ gets extra weight (total +3 for 3+ files)
    signals.push(`files_3plus:${foundFiles.length}`);
  }

  const complexKeywordHit = COMPLEX_KEYWORDS.find((k) => lowerPrompt.includes(k));
  if (complexKeywordHit) {
    score += 2;
    signals.push(`complex_keyword:${complexKeywordHit}`);
  }

  if (normalizedPrompt.length > 400) {
    score += 1;
    signals.push("long_prompt");
  }

  if (normalizedPrompt.includes("\n")) {
    const lines = normalizedPrompt.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length >= 3) {
      score += 1;
      signals.push(`multiline:${lines.length}`);
    }
  }

  // Count distinct "and/then" conjunctions as a sign of multi-step tasks.
  const conjunctionMatches = lowerPrompt.match(/\b(dann|then|danach|anschließend|anschliessend|außerdem|ausserdem|und\s+auch|und\s+dann)\b/g);
  if (conjunctionMatches && conjunctionMatches.length >= 2) {
    score += 1;
    signals.push(`conjunctions:${conjunctionMatches.length}`);
  }

  let complexity: TaskComplexity;
  let reason: string;

  if (score >= 3) {
    complexity = "complex";
    reason = `Score ${score} >= 3 (${signals.join(", ")})`;
  } else if (normalizedPrompt.length < 60 && score === 0) {
    complexity = "simple";
    reason = "Short prompt, no complex signals";
  } else {
    complexity = "simple";
    reason = `Score ${score} < 3 (${signals.length > 0 ? signals.join(", ") : "no signals"})`;
  }

  return {
    complexity,
    score,
    signals,
    needsJudge: complexity === "complex",
    needsOrchestrator: complexity === "complex" && score >= 4,
    reason,
  };
}
