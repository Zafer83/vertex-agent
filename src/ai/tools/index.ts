/**
 * VertexAgent – Tool Registry
 *
 * Central registry of all available AgentTools.
 * Import getToolSubset() to pass a filtered set to a specific sub-agent role.
 *
 * Copyright (c) VertexLabs – Zafer Kılıçaslan
 */

export type { AgentTool, ToolContext, ToolCallRequest, ToolCallResult, ToolMessage, JsonSchema } from "./types";

import { AgentTool } from "./types";
import { readFileTool } from "./readFile";
import { writeFileTool } from "./writeFile";
import { listFilesTool } from "./listFiles";
import { grepTool } from "./grep";
import { gitDiffTool } from "./gitDiff";
import { runTestsTool } from "./runTests";
import { runBashTool } from "./runBash";

// ─── Full registry ────────────────────────────────────────────────────────────

export const ALL_TOOLS: AgentTool[] = [
  readFileTool,
  writeFileTool,
  listFilesTool,
  grepTool,
  gitDiffTool,
  runTestsTool,
  runBashTool,
];

// ─── Curated subsets per sub-agent role ──────────────────────────────────────

/** Tools available to coding sub-agents. */
export const CODER_TOOLS: AgentTool[] = [
  readFileTool,
  writeFileTool,
  listFilesTool,
  grepTool,
];

/** Tools available to the security auditor. */
export const SECURITY_TOOLS: AgentTool[] = [
  readFileTool,
  listFilesTool,
  grepTool,
  gitDiffTool,
];

/** Tools available to the test writer. */
export const TEST_WRITER_TOOLS: AgentTool[] = [
  readFileTool,
  writeFileTool,
  listFilesTool,
  runTestsTool,
];

/** Tools available to the refactor expert. */
export const REFACTOR_TOOLS: AgentTool[] = [
  readFileTool,
  writeFileTool,
  listFilesTool,
  grepTool,
  gitDiffTool,
];

// ─── Lookup helpers ───────────────────────────────────────────────────────────

/** Look up a tool by name. Returns undefined for unknown names. */
export function getTool(name: string): AgentTool | undefined {
  return ALL_TOOLS.find(t => t.name === name);
}

/** Return the tools in ALL_TOOLS whose names are in the given list. */
export function getToolSubset(names: string[]): AgentTool[] {
  return names
    .map(n => ALL_TOOLS.find(t => t.name === n))
    .filter(Boolean) as AgentTool[];
}
