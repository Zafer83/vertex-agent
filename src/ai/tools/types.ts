/**
 * VertexAgent – Tool Use Types
 *
 * Shared types for the agentic tool-use system (Phase 3).
 * Providers use different wire formats; these types are the canonical
 * internal representation that ProviderAdapter converts from/to.
 *
 * Copyright (c) VertexLabs – Zafer Kılıçaslan
 */

// ─── JSON Schema subset ───────────────────────────────────────────────────────

export interface JsonSchema {
  type: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
}

// ─── Tool definition ──────────────────────────────────────────────────────────

export interface ToolContext {
  /** Absolute path to the workspace root. */
  workspacePath: string;
  /** Maximum characters returned by a single tool call. */
  maxOutputChars?: number;
}

export interface AgentTool {
  name: string;
  description: string;
  /** JSON Schema for the tool's input parameters. */
  inputSchema: JsonSchema;
  execute(input: Record<string, unknown>, ctx: ToolContext): Promise<string>;
}

// ─── Tool call wire types ─────────────────────────────────────────────────────

export interface ToolCallRequest {
  /** Provider-supplied call ID (empty string for providers without IDs, e.g. Gemini). */
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolCallResult {
  toolCallId: string;
  toolName: string;
  output: string;
  isError: boolean;
}

// ─── Generic multi-turn message format ───────────────────────────────────────
// ProviderAdapter converts between this and each provider's wire format.

export type ToolMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content?: string; toolCalls?: ToolCallRequest[] }
  | { role: "tool"; toolCallId: string; toolName: string; content: string; isError?: boolean };
