/**
 * LLM-as-a-Judge — Phase 1 Quality Gate
 *
 * Sends proposed edits to a second LLM call for independent review before they
 * are written to disk. Operates at temperature 0.0 with a small output budget.
 *
 * Design principles:
 * - FAIL-OPEN: any error (network, parse, timeout) returns approved=true so the
 *   main flow is never blocked by an unreliable judge.
 * - PROVIDER-AGNOSTIC: reuses ProviderAdapter — the judge can run on any provider
 *   including a different one than the main coder (mixed-provider strategy).
 * - NO STREAMING: judge always uses synchronous response for predictable JSON output.
 *
 * Copyright (c) VertexLabs – Zafer Kılıçaslan
 */

import { request } from "undici";
import { AgentEdit } from "./aiClient";
import { ProviderAdapter, ProviderConfig } from "./providerAdapter";

export interface JudgeVerdict {
  approved: boolean;
  issues: string[];
  confidence: number; // 0.0–1.0
  rawResponse?: string;
}

/**
 * Compact system prompt (~160 tokens).
 * Instructs the judge to return ONLY valid JSON — no markdown, no prose.
 */
const JUDGE_SYSTEM_PROMPT =
  `You are a strict code reviewer. Review the given code edits for correctness.

Respond ONLY with valid JSON — no markdown, no prose before or after:
{"approved": true, "issues": [], "confidence": 0.9}

Fields:
- approved (boolean): true if the edits are correct, false if there are problems
- issues (string[]): brief description of each problem (empty when approved=true)
- confidence (number 0.0-1.0): how confident you are in your verdict`;

/**
 * Formats edits for the judge prompt, truncating to avoid excessive token usage.
 * Each file gets at most 600 chars of its content previewed.
 */
function formatEditsForJudge(edits: AgentEdit[], maxTotalChars = 2000): string {
  const parts: string[] = [];
  let totalChars = 0;

  for (const edit of edits) {
    if (totalChars >= maxTotalChars) {
      parts.push(`... (${edits.length - parts.length} more file(s) not shown)`);
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

/**
 * Calls the judge LLM and returns a structured verdict.
 *
 * @param edits          The proposed file edits to review
 * @param originalPrompt The user's original task description
 * @param providerConfig Main provider config (used as fallback judge provider)
 * @param options        Optional override: use a different provider as judge
 */
export async function judgeEdits(
  edits: AgentEdit[],
  originalPrompt: string,
  providerConfig: ProviderConfig,
  options?: { judgeProvider?: ProviderConfig }
): Promise<JudgeVerdict> {
  const config = options?.judgeProvider ?? providerConfig;

  const editsFormatted = formatEditsForJudge(edits);
  const judgePrompt =
    `User task: ${originalPrompt.slice(0, 300)}\n\n` +
    `Proposed file changes:\n${editsFormatted}\n\n` +
    `Check:\n` +
    `1. Do the edits fully solve the task?\n` +
    `2. Syntax correctness (no "+" markers or line numbers inside file content)?\n` +
    `3. Missing imports, undefined references, typos?\n` +
    `4. Security issues (hardcoded secrets, eval(), unsafe yaml.load())?`;

  const req = ProviderAdapter.buildRequest(config, judgePrompt, JUDGE_SYSTEM_PROMPT, {
    temperature: 0.0,
    maxOutputTokens: 400,
    stream: false,
  });

  try {
    const res = await request(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(req.body),
    });

    if (res.statusCode < 200 || res.statusCode >= 300) {
      const errText = await res.body.text().catch(() => "(unreadable)");
      console.warn(`[judge] HTTP ${res.statusCode} — fail-open. Body: ${errText.slice(0, 200)}`);
      return { approved: true, issues: [], confidence: 0.5 };
    }

    const json = (await res.body.json()) as any;
    const { content } = ProviderAdapter.parseResponse(config, json);

    // Extract the first JSON object from the response (LLM may add prose despite instructions)
    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      console.warn("[judge] No JSON found in response — fail-open. Preview:", content.slice(0, 300));
      return { approved: true, issues: [], confidence: 0.5, rawResponse: content };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.warn("[judge] JSON parse error — fail-open:", parseErr);
      return { approved: true, issues: [], confidence: 0.5, rawResponse: content };
    }

    const verdict: JudgeVerdict = {
      approved: parsed.approved === true,
      issues: Array.isArray(parsed.issues) ? parsed.issues.filter((i: any) => typeof i === "string") : [],
      confidence: typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0.7,
      rawResponse: content,
    };

    console.log(
      `[judge] Verdict: approved=${verdict.approved}, confidence=${verdict.confidence.toFixed(2)}, ` +
      `issues=${verdict.issues.length}`
    );
    return verdict;

  } catch (err) {
    console.warn("[judge] Unexpected error — fail-open:", err);
    return { approved: true, issues: [], confidence: 0.5 };
  }
}
