/**
 * VertexAgent – ToolRunner
 *
 * Runs the agentic tool-use loop for a single sub-agent step:
 *   1. Send prompt + tools to LLM
 *   2. Execute any tool calls in the response
 *   3. Append results and repeat until the LLM responds with plain text
 *   4. Return the final text
 *
 * Compatible with OpenAI, Claude, Gemini, and Ollama (JSON-schema fallback).
 *
 * Copyright (c) VertexLabs – Zafer Kılıçaslan
 */

import { request } from "undici";
import { ProviderConfig, ProviderAdapter } from "../ai/providerAdapter";
import { AgentTool, ToolCallRequest, ToolMessage, ToolContext } from "../ai/tools/types";
import { getTool } from "../ai/tools/index";

export interface ToolRunnerOptions {
  /** System prompt for this sub-agent role. */
  systemPrompt: string;
  /** Tools available to this sub-agent. */
  tools: AgentTool[];
  /** Workspace context for tool execution. */
  ctx: ToolContext;
  /** Maximum LLM→tool→LLM iterations before giving up. Default: 8. */
  maxIterations?: number;
  temperature?: number;
  maxOutputTokens?: number;
  model?: string;
}

export class ToolRunner {
  constructor(private providerConfig: ProviderConfig) {}

  /**
   * Run the agentic loop.
   * @param userMessage Initial user/task message.
   * @param options     System prompt, tools, workspace context.
   * @returns           The LLM's final plain-text response.
   */
  async run(userMessage: string, options: ToolRunnerOptions): Promise<string> {
    const {
      systemPrompt,
      tools,
      ctx,
      maxIterations = 8,
      temperature,
      maxOutputTokens,
      model,
    } = options;

    // Conversation history in canonical ToolMessage format
    const messages: ToolMessage[] = [{ role: "user", content: userMessage }];
    let finalText = "";

    for (let iter = 0; iter < maxIterations; iter++) {
      // Build the provider-specific request
      const req = ProviderAdapter.buildRequestWithTools(
        this.providerConfig,
        messages,
        systemPrompt,
        tools,
        { temperature, maxOutputTokens, model }
      );

      let json: any;
      try {
        const { body } = await request(req.url, {
          method: "POST",
          headers: req.headers as Record<string, string>,
          body: JSON.stringify(req.body),
        });
        json = await body.json();
      } catch (e: any) {
        console.error(`[ToolRunner] HTTP error on iteration ${iter}: ${e.message}`);
        break;
      }

      // Parse assistant response
      const { text, toolCalls } = ProviderAdapter.parseToolCallResponse(
        this.providerConfig,
        json
      );

      if (text) finalText = text;

      // No more tool calls → done
      if (!toolCalls || toolCalls.length === 0) break;

      // Record the assistant's turn (text + tool calls)
      messages.push({
        role: "assistant",
        content: text,
        toolCalls,
      });

      // Execute each tool call and record results
      for (const tc of toolCalls) {
        const output = await this.executeTool(tc, tools, ctx);
        messages.push({
          role: "tool",
          toolCallId: tc.id,
          toolName: tc.name,
          content: output.content,
          isError: output.isError,
        });
      }
    }

    return finalText;
  }

  // ─── Tool execution ────────────────────────────────────────────────────────

  private async executeTool(
    tc: ToolCallRequest,
    tools: AgentTool[],
    ctx: ToolContext
  ): Promise<{ content: string; isError: boolean }> {
    // Prefer tools from the local subset, fall back to global registry
    const tool = tools.find(t => t.name === tc.name) ?? getTool(tc.name);

    if (!tool) {
      return {
        content: `Error: unknown tool "${tc.name}". Available: ${tools.map(t => t.name).join(", ")}`,
        isError: true,
      };
    }

    try {
      const content = await tool.execute(tc.input, ctx);
      console.log(`[ToolRunner] ${tc.name}(${JSON.stringify(tc.input).slice(0, 80)}) → ${content.length} chars`);
      return { content, isError: false };
    } catch (e: any) {
      return {
        content: `Error executing ${tc.name}: ${e.message}`,
        isError: true,
      };
    }
  }
}
