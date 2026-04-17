/**
 * VertexAgent – Orchestrator (Phase 2)
 *
 * Implements the Master/Sub-Agent pattern:
 *   1. Planner  — decomposes the task into a JSON plan (temperature 0.0)
 *   2. Coders   — execute steps in parallel (each gets a focused prompt)
 *   3. Auditor  — optional security review (triggered by keywords in the plan)
 *   4. Judge    — reuses Phase 1 quality gate (fail-open, single retry)
 *
 * The Orchestrator is invoked when TaskClassifier returns needsOrchestrator=true
 * (score >= 4) and orchestratorEnabled is set in VS Code settings.
 *
 * Copyright (c) VertexLabs – Zafer Kılıçaslan
 */

import { request } from "undici";
import { AgentEdit, AgentResponse, TokenUsage } from "../ai/aiClient";
import {
  ProviderAdapter,
  ProviderConfig,
} from "../ai/providerAdapter";
import {
  SubAgentRole,
  PLANNER_SYSTEM_PROMPT,
  SECURITY_AUDITOR_SYSTEM_PROMPT,
  TEST_WRITER_SYSTEM_PROMPT,
  buildCoderSystemPrompt,
  buildRefactorExpertSystemPrompt,
} from "../ai/prompts";
import { judgeEdits } from "../ai/judge";
import { ProviderRouting } from "../ai/providerRouter";
import { ClassifiedTask } from "../ai/taskClassifier";

// ─── Plan types ──────────────────────────────────────────────────────────────

export interface PlanStep {
  id: number;
  role: SubAgentRole;
  description: string;
  targetFiles?: string[];
  /** Specific instruction passed to this sub-agent as user prompt. */
  input: string;
}

export interface OrchestrationPlan {
  steps: PlanStep[];
  parallelizable: boolean;
}

export interface OrchestratorOptions {
  maxSubAgents?: number;
  autoWriteTests?: boolean;
  judgeEnabled?: boolean;
  judgeMinConfidence?: number;
  onProgress?: (status: string) => void;
  memoryContext?: string;
}

// ─── Security keyword detector ───────────────────────────────────────────────

const SECURITY_KEYWORDS = [
  "auth", "authentication", "authoriz", "login", "password", "passwd",
  "secret", "token", "api.?key", "credential", "oauth", "jwt",
  "encrypt", "decrypt", "crypto", "hash", "salt",
  "sql", "query", "injection", "sanitiz", "xss", "csrf",
];

function hasSecurityKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return SECURITY_KEYWORDS.some((kw) => new RegExp(kw).test(lower));
}

// ─── Code block extractor (simplified — for orchestrator sub-agent output) ───

const LANG_KEYWORDS = new Set([
  "python", "typescript", "javascript", "java", "go", "rust", "cpp", "c",
  "bash", "sh", "json", "yaml", "yml", "toml", "txt", "sql", "html", "css",
  "jsx", "tsx", "md", "markdown", "plaintext",
]);

export function extractEditsFromContent(content: string): AgentEdit[] {
  const edits: AgentEdit[] = [];
  const fence = "```";
  let pos = 0;

  while (pos < content.length) {
    const open = content.indexOf(fence, pos);
    if (open === -1) break;

    const headerEnd = content.indexOf("\n", open + 3);
    if (headerEnd === -1) break;

    const header = content.slice(open + 3, headerEnd).trim();

    // Find the closing fence
    const close = content.indexOf("\n" + fence, headerEnd);
    if (close === -1) break;

    const codeContent = content.slice(headerEnd + 1, close);
    pos = close + 1 + fence.length;

    // Parse header → determine filePath
    const parts = header.match(/^(\w+)\s+(.+)$/);
    let filePath = header;
    if (parts) {
      const lang = parts[1].toLowerCase();
      const rest = parts[2].trim();
      if (LANG_KEYWORDS.has(lang) && rest) {
        filePath = rest;
      }
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

// ─── Dedup edits ─────────────────────────────────────────────────────────────
// Last-write-wins per filePath (later sub-agents override earlier ones).

function deduplicateEdits(edits: AgentEdit[]): AgentEdit[] {
  const map = new Map<string, AgentEdit>();
  for (const edit of edits) {
    map.set(edit.filePath, edit);
  }
  return Array.from(map.values());
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function callLLM(
  providerConfig: ProviderConfig,
  userPrompt: string,
  systemPrompt: string,
  options?: { temperature?: number; maxOutputTokens?: number }
): Promise<{ content: string; usage?: TokenUsage }> {
  const req = ProviderAdapter.buildRequest(providerConfig, userPrompt, systemPrompt, {
    temperature: options?.temperature ?? 0.2,
    maxOutputTokens: options?.maxOutputTokens ?? 8192,
    stream: false,
  });

  const res = await request(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify(req.body),
  });

  if (res.statusCode < 200 || res.statusCode >= 300) {
    const errText = await res.body.text().catch(() => "(unreadable)");
    throw new Error(`Orchestrator: LLM returned HTTP ${res.statusCode}: ${errText.slice(0, 300)}`);
  }

  const json = (await res.body.json()) as any;
  const { content, usage } = ProviderAdapter.parseResponse(providerConfig, json);
  return { content, usage };
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export class Orchestrator {
  constructor(private routing: ProviderRouting) {}

  // ── 1. Plan ────────────────────────────────────────────────────────────────

  private async planTask(
    userPrompt: string,
    foundFiles: string[]
  ): Promise<OrchestrationPlan> {
    const fileList = foundFiles.length > 0
      ? `\n\nReferenced files: ${foundFiles.join(", ")}`
      : "";

    const plannerInput = `Task: ${userPrompt.slice(0, 600)}${fileList}`;

    let content = "";
    try {
      const result = await callLLM(
        this.routing.planner,
        plannerInput,
        PLANNER_SYSTEM_PROMPT,
        { temperature: 0.0, maxOutputTokens: 800 }
      );
      content = result.content;
    } catch (err) {
      console.warn("[Orchestrator] Planner call failed — using fallback single-step plan:", err);
      return this.fallbackPlan(userPrompt, foundFiles);
    }

    // Extract JSON from planner response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[Orchestrator] Planner returned no JSON — fallback plan");
      return this.fallbackPlan(userPrompt, foundFiles);
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const steps: PlanStep[] = (Array.isArray(parsed.steps) ? parsed.steps : []).map(
        (s: any, i: number) => ({
          id: typeof s.id === "number" ? s.id : i + 1,
          role: this.sanitizeRole(s.role),
          description: typeof s.description === "string" ? s.description : "code task",
          targetFiles: Array.isArray(s.targetFiles) ? s.targetFiles : [],
          input: typeof s.input === "string" ? s.input : userPrompt,
        })
      );

      if (steps.length === 0) {
        console.warn("[Orchestrator] Planner returned empty steps — fallback");
        return this.fallbackPlan(userPrompt, foundFiles);
      }

      const plan: OrchestrationPlan = {
        steps,
        parallelizable: parsed.parallelizable !== false,
      };

      console.log(
        `[Orchestrator] Plan: ${steps.length} step(s), parallelizable=${plan.parallelizable}`
      );
      steps.forEach((s) =>
        console.log(`  Step ${s.id} [${s.role}]: ${s.description}`)
      );

      return plan;
    } catch (parseErr) {
      console.warn("[Orchestrator] Plan JSON parse error — fallback:", parseErr);
      return this.fallbackPlan(userPrompt, foundFiles);
    }
  }

  private sanitizeRole(role: string): SubAgentRole {
    const valid: SubAgentRole[] = [
      "coder", "refactor_expert", "security_auditor", "test_writer", "planner",
    ];
    return valid.includes(role as SubAgentRole) ? (role as SubAgentRole) : "coder";
  }

  /** Fallback: single coder step with the original prompt. */
  private fallbackPlan(userPrompt: string, foundFiles: string[]): OrchestrationPlan {
    return {
      steps: [
        {
          id: 1,
          role: "coder",
          description: "Implement the requested changes",
          targetFiles: foundFiles,
          input: userPrompt,
        },
      ],
      parallelizable: false,
    };
  }

  // ── 2. Execute a single step ───────────────────────────────────────────────

  private async runStep(
    step: PlanStep,
    enrichedPrompt: string,
    memoryContext: string
  ): Promise<{ edits: AgentEdit[]; message: string; usage?: TokenUsage }> {
    const systemPrompt = this.getSystemPromptForRole(step.role, memoryContext);
    // Use the step's specific input + enriched context (file content)
    const userInput = `${step.input}\n\n${enrichedPrompt !== step.input ? enrichedPrompt : ""}`.trim();
    const config = step.role === "refactor_expert" ? this.routing.coder : this.routing.coder;

    try {
      const { content, usage } = await callLLM(config, userInput, systemPrompt, {
        temperature: step.role === "security_auditor" ? 0.0 : 0.2,
      });

      const edits = extractEditsFromContent(content);
      console.log(
        `[Orchestrator] Step ${step.id} [${step.role}]: ${edits.length} edit(s)`
      );
      return { edits, message: content, usage };
    } catch (err) {
      console.error(`[Orchestrator] Step ${step.id} [${step.role}] failed:`, err);
      return { edits: [], message: "" };
    }
  }

  private getSystemPromptForRole(role: SubAgentRole, memoryContext: string): string {
    switch (role) {
      case "security_auditor":
        return SECURITY_AUDITOR_SYSTEM_PROMPT;
      case "test_writer":
        return TEST_WRITER_SYSTEM_PROMPT;
      case "refactor_expert":
        return buildRefactorExpertSystemPrompt(memoryContext);
      default:
        return buildCoderSystemPrompt(memoryContext);
    }
  }

  // ── 3. Main entry point ───────────────────────────────────────────────────

  async planAndExecute(
    userPrompt: string,
    enrichedPrompt: string,
    foundFiles: string[],
    classified: ClassifiedTask,
    options?: OrchestratorOptions
  ): Promise<AgentResponse> {
    const {
      maxSubAgents = 3,
      autoWriteTests = true,
      judgeEnabled = true,
      judgeMinConfidence = 0.7,
      onProgress,
      memoryContext = "none",
    } = options ?? {};

    const totalUsage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const addUsage = (u?: TokenUsage) => {
      if (!u) return;
      totalUsage.prompt_tokens = (totalUsage.prompt_tokens ?? 0) + (u.prompt_tokens ?? 0);
      totalUsage.completion_tokens = (totalUsage.completion_tokens ?? 0) + (u.completion_tokens ?? 0);
      totalUsage.total_tokens = (totalUsage.total_tokens ?? 0) + (u.total_tokens ?? 0);
    };

    // ── Plan ────────────────────────────────────────────────────────────────
    onProgress?.("🗺 Planning task...");
    const plan = await this.planTask(userPrompt, foundFiles);

    // Separate steps by role category
    const codeSteps = plan.steps
      .filter((s) => s.role === "coder" || s.role === "refactor_expert")
      .slice(0, maxSubAgents);
    const auditSteps = plan.steps.filter((s) => s.role === "security_auditor");
    const testSteps = plan.steps.filter((s) => s.role === "test_writer");

    // Also add an implicit security step if keywords detected and not already planned
    const implicitSecurity =
      auditSteps.length === 0 && hasSecurityKeywords(userPrompt)
        ? [
            {
              id: 99,
              role: "security_auditor" as SubAgentRole,
              description: "Security audit (auto-triggered by keywords)",
              targetFiles: foundFiles,
              input: `Security audit for the following files: ${foundFiles.join(", ")}\n\n${userPrompt}`,
            },
          ]
        : [];

    const allEdits: AgentEdit[] = [];
    const allMessages: string[] = [];

    // ── Code steps ──────────────────────────────────────────────────────────
    if (codeSteps.length > 0) {
      if (plan.parallelizable && codeSteps.length > 1) {
        onProgress?.(`⚡ Coding ${codeSteps.length} file(s) in parallel...`);
        const results = await Promise.all(
          codeSteps.map((step) => this.runStep(step, enrichedPrompt, memoryContext))
        );
        for (const r of results) {
          allEdits.push(...r.edits);
          if (r.message) allMessages.push(r.message);
          addUsage(r.usage);
        }
      } else {
        for (let i = 0; i < codeSteps.length; i++) {
          const step = codeSteps[i];
          onProgress?.(`✏️  ${step.description} (${i + 1}/${codeSteps.length})`);
          const r = await this.runStep(step, enrichedPrompt, memoryContext);
          allEdits.push(...r.edits);
          if (r.message) allMessages.push(r.message);
          addUsage(r.usage);
        }
      }
    }

    // ── Security audit ──────────────────────────────────────────────────────
    const securityToRun = [...auditSteps, ...implicitSecurity];
    for (const step of securityToRun) {
      onProgress?.("🔒 Security audit...");
      const r = await this.runStep(step, enrichedPrompt, memoryContext);
      allEdits.push(...r.edits);
      if (r.message) allMessages.push(r.message);
      addUsage(r.usage);
    }

    // ── Test writer ─────────────────────────────────────────────────────────
    if (autoWriteTests && testSteps.length > 0) {
      for (const step of testSteps) {
        onProgress?.("🧪 Writing tests...");
        const r = await this.runStep(step, enrichedPrompt, memoryContext);
        allEdits.push(...r.edits);
        if (r.message) allMessages.push(r.message);
        addUsage(r.usage);
      }
    }

    // ── Merge & dedup ────────────────────────────────────────────────────────
    const mergedEdits = deduplicateEdits(allEdits);
    console.log(
      `[Orchestrator] Merged: ${mergedEdits.length} unique edit(s) from ${allEdits.length} total`
    );

    // ── Judge ────────────────────────────────────────────────────────────────
    if (judgeEnabled && mergedEdits.length > 0 && classified.needsJudge) {
      onProgress?.("🔍 Reviewing edits...");
      const verdict = await judgeEdits(mergedEdits, userPrompt, this.routing.coder, {
        judgeProvider: this.routing.judge,
      });
      addUsage({ prompt_tokens: 300, completion_tokens: 100, total_tokens: 400 }); // approximate

      if (!verdict.approved && verdict.confidence >= judgeMinConfidence && verdict.issues.length > 0) {
        console.log("[Orchestrator] Judge rejected — retry with issue constraints");
        onProgress?.("⚠️  Issues found — retrying with fixes...");

        const retryInput =
          `${enrichedPrompt}\n\n` +
          `The previous implementation had the following issues:\n` +
          `${verdict.issues.map((i) => `- ${i}`).join("\n")}\n\n` +
          `Provide ONLY the corrected diffs addressing each issue.`;

        try {
          const retryResult = await callLLM(
            this.routing.coder,
            retryInput,
            buildCoderSystemPrompt(memoryContext),
            { temperature: 0.1 }
          );
          addUsage(retryResult.usage);
          const retryEdits = extractEditsFromContent(retryResult.content);
          if (retryEdits.length > 0) {
            // Merge retry edits on top (override original per-file)
            for (const re of retryEdits) {
              const idx = mergedEdits.findIndex((e) => e.filePath === re.filePath);
              if (idx >= 0) {
                mergedEdits[idx] = re;
              } else {
                mergedEdits.push(re);
              }
            }
            allMessages.push(retryResult.content);
          }
        } catch (retryErr) {
          console.warn("[Orchestrator] Retry failed — returning original edits:", retryErr);
        }
      } else {
        console.log(`[Orchestrator] Judge approved (confidence=${verdict.confidence.toFixed(2)})`);
      }
    }

    const combinedMessage = allMessages
      .filter((m) => m.trim().length > 0)
      .join("\n\n---\n\n");

    return {
      message: combinedMessage || "Task completed by orchestrator.",
      edits: mergedEdits.length > 0 ? mergedEdits : undefined,
      usage: totalUsage,
    };
  }
}
