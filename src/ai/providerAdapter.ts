/**
 * VertexAgent – Provider Adapter
 * Converts between different LLM API wire formats.
 * Includes tool-use (function calling) support for OpenAI, Claude, Gemini, and Ollama.
 *
 * Copyright (c) VertexLabs – Zafer Kılıçaslan
 */

import type { AgentTool, ToolCallRequest, ToolCallResult, ToolMessage } from "./tools/types";

export interface ProviderConfig {
  provider: string;
  serverUrl: string;
  serverPort: number;
  apiKey?: string;
  useAccessToken?: boolean;
  accessToken?: string;
}

export interface ProviderRequest {
  url: string;
  headers: Record<string, string>;
  body: any;
}

export interface ProviderRequestOptions {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  stream?: boolean;
  /** Enable prompt caching for supported providers (Claude ephemeral cache). */
  promptCaching?: boolean;
}

export class ProviderAdapter {
  static buildRequest(
    config: ProviderConfig,
    prompt: string,
    systemPrompt: string,
    options?: ProviderRequestOptions
  ): ProviderRequest {
    switch (config.provider) {
      case 'gemini':
        return this.buildGeminiRequest(config, prompt, systemPrompt, options);
      case 'claude':
        return this.buildClaudeRequest(config, prompt, systemPrompt, options);
      case 'ollama':
        return this.buildOllamaRequest(config, prompt, systemPrompt, options);
      default:
        return this.buildOpenAIRequest(config, prompt, systemPrompt, options);
    }
  }

  private static buildOpenAIRequest(
    config: ProviderConfig,
    prompt: string,
    systemPrompt: string,
    options?: ProviderRequestOptions
  ): ProviderRequest {
    const url = `${config.serverUrl.replace(/\/$/, "")}:${config.serverPort}/v1/chat/completions`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (config.apiKey) {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
    } else if (config.useAccessToken && config.accessToken) {
      headers["Authorization"] = `Bearer ${config.accessToken}`;
    }

    const body: any = {
      model: options?.model || "vertex-agent",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      stream: options?.stream ?? false,
      temperature: options?.temperature ?? 0.3,
      stream_options: options?.stream ? { include_usage: true } : undefined,
    };

    if (options?.maxOutputTokens) {
      body.max_tokens = options.maxOutputTokens;
    }

    return { url, headers, body };
  }

  private static buildGeminiRequest(
    config: ProviderConfig,
    prompt: string,
    systemPrompt: string,
    options?: ProviderRequestOptions
  ): ProviderRequest {
    const apiKey = config.apiKey || '';
    const modelName = options?.model || 'gemini-2.0-flash-latest';
    const endpoint = options?.stream ? 'streamGenerateContent' : 'generateContent';
    const url = `${config.serverUrl.replace(/\/$/, "")}/v1beta/models/${modelName}:${endpoint}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-goog-api-key": apiKey,
    };

    const body: any = {
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: options?.temperature ?? 0.3,
        maxOutputTokens: options?.maxOutputTokens ?? 8192,
      }
    };

    return { url, headers, body };
  }

  private static buildClaudeRequest(
    config: ProviderConfig,
    prompt: string,
    systemPrompt: string,
    options?: ProviderRequestOptions
  ): ProviderRequest {
    const url = `${config.serverUrl.replace(/\/$/, "")}/v1/messages`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey || '',
      "anthropic-version": "2023-06-01",
    };

    // Enable prompt caching beta header when requested
    if (options?.promptCaching) {
      headers["anthropic-beta"] = "prompt-caching-2024-07-31";
    }

    const body: any = {
      model: options?.model || "claude-3-5-sonnet-20241022",
      max_tokens: options?.maxOutputTokens ?? 8192,
      messages: [
        { role: "user", content: prompt }
      ],
      temperature: options?.temperature ?? 0.3,
      stream: options?.stream ?? false,
    };

    // Prompt caching: split system into cacheable stable part + live dynamic part.
    // The last ~100 chars are assumed to be the dynamic memory context.
    if (options?.promptCaching && systemPrompt.length > 200) {
      // Split at the last occurrence of "\n## KONTEXT" or at 90% of the string
      const splitMarker = "\n## KONTEXT";
      const splitIdx = systemPrompt.lastIndexOf(splitMarker);
      const stableEnd = splitIdx > 0 ? splitIdx : Math.floor(systemPrompt.length * 0.9);

      body.system = [
        {
          type: "text",
          text: systemPrompt.slice(0, stableEnd),
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          text: systemPrompt.slice(stableEnd),
        },
      ];
    } else {
      body.system = systemPrompt;
    }

    return { url, headers, body };
  }

  private static buildOllamaRequest(
    config: ProviderConfig,
    prompt: string,
    systemPrompt: string,
    options?: ProviderRequestOptions
  ): ProviderRequest {
    const url = `${config.serverUrl.replace(/\/$/, "")}:${config.serverPort}/api/chat`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const body: any = {
      model: options?.model || "llama3.2",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      stream: options?.stream ?? false,
      options: {
        temperature: options?.temperature ?? 0.3,
        ...(options?.maxOutputTokens ? { num_predict: options.maxOutputTokens } : {}),
      },
    };

    return { url, headers, body };
  }

  // ─── Response parsers ───────────────────────────────────────────────────────

  static parseResponse(config: ProviderConfig, json: any): { content: string; usage?: any } {
    switch (config.provider) {
      case 'gemini':
        return this.parseGeminiResponse(json);
      case 'claude':
        return this.parseClaudeResponse(json);
      case 'ollama':
        return this.parseOllamaResponse(json);
      default:
        return this.parseOpenAIResponse(json);
    }
  }

  private static parseOpenAIResponse(json: any): { content: string; usage?: any } {
    return {
      content: json?.choices?.[0]?.message?.content ?? "Keine Antwort vom Modell erhalten.",
      usage: json?.usage,
    };
  }

  private static parseGeminiResponse(json: any): { content: string; usage?: any } {
    const content =
      json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "Keine Antwort von Gemini erhalten.";
    const usage = json?.usageMetadata
      ? {
          prompt_tokens: json.usageMetadata.promptTokenCount,
          completion_tokens: json.usageMetadata.candidatesTokenCount,
          total_tokens: json.usageMetadata.totalTokenCount,
        }
      : undefined;

    return { content, usage };
  }

  private static parseClaudeResponse(json: any): { content: string; usage?: any } {
    const content = json?.content?.[0]?.text ?? "Keine Antwort von Claude erhalten.";
    const usage = json?.usage
      ? {
          prompt_tokens: json.usage.input_tokens,
          completion_tokens: json.usage.output_tokens,
          total_tokens: (json.usage.input_tokens ?? 0) + (json.usage.output_tokens ?? 0),
          // Cache hit info (available when prompt caching is enabled)
          cache_read_tokens: json.usage.cache_read_input_tokens,
          cache_creation_tokens: json.usage.cache_creation_input_tokens,
        }
      : undefined;

    return { content, usage };
  }

  private static parseOllamaResponse(json: any): { content: string; usage?: any } {
    return {
      content: json?.message?.content ?? "Keine Antwort von Ollama erhalten.",
      usage: undefined,
    };
  }

  // ─── Tool Use ────────────────────────────────────────────────────────────────
  // Build a multi-turn request that includes tool declarations and history.
  // Each provider has a different wire format; this method handles all of them.

  /**
   * Builds an HTTP request for a multi-turn tool-use conversation.
   *
   * @param config   Provider configuration
   * @param messages Provider-agnostic message history (ToolMessage[])
   * @param system   System prompt
   * @param tools    Available tools
   * @param options  Temperature, maxOutputTokens, etc.
   */
  static buildRequestWithTools(
    config: ProviderConfig,
    messages: ToolMessage[],
    system: string,
    tools: AgentTool[],
    options?: ProviderRequestOptions
  ): ProviderRequest {
    switch (config.provider) {
      case "gemini":
        return this.buildGeminiToolRequest(config, messages, system, tools, options);
      case "claude":
        return this.buildClaudeToolRequest(config, messages, system, tools, options);
      case "ollama":
        return this.buildOllamaToolRequest(config, messages, system, tools, options);
      default:
        return this.buildOpenAIToolRequest(config, messages, system, tools, options);
    }
  }

  // ── OpenAI tool-use request ────────────────────────────────────────────────

  private static buildOpenAIToolRequest(
    config: ProviderConfig,
    messages: ToolMessage[],
    system: string,
    tools: AgentTool[],
    options?: ProviderRequestOptions
  ): ProviderRequest {
    const url = `${config.serverUrl.replace(/\/$/, "")}:${config.serverPort}/v1/chat/completions`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;

    const oaiMessages: any[] = [{ role: "system", content: system }];
    for (const m of messages) {
      if (m.role === "user") {
        oaiMessages.push({ role: "user", content: m.content });
      } else if (m.role === "assistant") {
        const msg: any = { role: "assistant", content: m.content ?? null };
        if (m.toolCalls?.length) {
          msg.tool_calls = m.toolCalls.map(tc => ({
            id: tc.id,
            type: "function",
            function: { name: tc.name, arguments: JSON.stringify(tc.input) },
          }));
        }
        oaiMessages.push(msg);
      } else if (m.role === "tool") {
        oaiMessages.push({
          role: "tool",
          tool_call_id: m.toolCallId,
          content: m.content,
        });
      }
    }

    const body: any = {
      model: options?.model ?? "gpt-4o",
      messages: oaiMessages,
      temperature: options?.temperature ?? 0.3,
      stream: false,
      tools: tools.map(t => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      })),
      tool_choice: "auto",
    };
    if (options?.maxOutputTokens) body.max_tokens = options.maxOutputTokens;

    return { url, headers, body };
  }

  // ── Claude tool-use request ────────────────────────────────────────────────

  private static buildClaudeToolRequest(
    config: ProviderConfig,
    messages: ToolMessage[],
    system: string,
    tools: AgentTool[],
    options?: ProviderRequestOptions
  ): ProviderRequest {
    const url = `${config.serverUrl.replace(/\/$/, "")}/v1/messages`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey ?? "",
      "anthropic-version": "2023-06-01",
    };

    const claudeMessages: any[] = [];
    for (const m of messages) {
      if (m.role === "user") {
        claudeMessages.push({ role: "user", content: m.content });
      } else if (m.role === "assistant") {
        const content: any[] = [];
        if (m.content) content.push({ type: "text", text: m.content });
        if (m.toolCalls?.length) {
          for (const tc of m.toolCalls) {
            content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
          }
        }
        claudeMessages.push({ role: "assistant", content });
      } else if (m.role === "tool") {
        // Claude expects tool results as a "user" turn
        claudeMessages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: m.toolCallId,
              content: m.content,
              is_error: m.isError ?? false,
            },
          ],
        });
      }
    }

    const body: any = {
      model: options?.model ?? "claude-3-5-sonnet-20241022",
      max_tokens: options?.maxOutputTokens ?? 8192,
      system,
      messages: claudeMessages,
      temperature: options?.temperature ?? 0.3,
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      })),
    };

    return { url, headers, body };
  }

  // ── Gemini tool-use request ────────────────────────────────────────────────

  private static buildGeminiToolRequest(
    config: ProviderConfig,
    messages: ToolMessage[],
    system: string,
    tools: AgentTool[],
    options?: ProviderRequestOptions
  ): ProviderRequest {
    const apiKey = config.apiKey ?? "";
    const modelName = options?.model ?? "gemini-2.0-flash-latest";
    const url = `${config.serverUrl.replace(/\/$/, "")}/v1beta/models/${modelName}:generateContent`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-goog-api-key": apiKey,
    };

    const contents: any[] = [];
    for (const m of messages) {
      if (m.role === "user") {
        contents.push({ role: "user", parts: [{ text: m.content }] });
      } else if (m.role === "assistant") {
        const parts: any[] = [];
        if (m.content) parts.push({ text: m.content });
        if (m.toolCalls?.length) {
          for (const tc of m.toolCalls) {
            parts.push({ functionCall: { name: tc.name, args: tc.input } });
          }
        }
        contents.push({ role: "model", parts });
      } else if (m.role === "tool") {
        contents.push({
          role: "function",
          parts: [
            {
              functionResponse: {
                name: m.toolName,
                response: { result: m.content },
              },
            },
          ],
        });
      }
    }

    const body: any = {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      tools: [
        {
          functionDeclarations: tools.map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
          })),
        },
      ],
      generationConfig: {
        temperature: options?.temperature ?? 0.3,
        maxOutputTokens: options?.maxOutputTokens ?? 8192,
      },
    };

    return { url, headers, body };
  }

  // ── Ollama tool-use request (JSON-schema fallback) ─────────────────────────
  // Ollama doesn't support native function calling — we embed the tool schema
  // in the system prompt and parse the model's JSON response.

  private static buildOllamaToolRequest(
    config: ProviderConfig,
    messages: ToolMessage[],
    system: string,
    tools: AgentTool[],
    options?: ProviderRequestOptions
  ): ProviderRequest {
    const url = `${config.serverUrl.replace(/\/$/, "")}:${config.serverPort}/api/chat`;

    const toolSchemaText =
      "Available tools (call with JSON, else respond normally):\n" +
      tools
        .map(
          t =>
            `- ${t.name}: ${t.description}\n` +
            `  Input: ${JSON.stringify(t.inputSchema.properties ?? {})}`
        )
        .join("\n") +
      "\n\nTo call a tool respond ONLY with:\n" +
      '{"tool_call": {"name": "<tool>", "input": {<params>}}}\n' +
      "To give a final answer respond normally (no JSON wrapper).";

    const augmentedSystem = `${system}\n\n${toolSchemaText}`;

    const ollamaMessages: any[] = [{ role: "system", content: augmentedSystem }];
    for (const m of messages) {
      if (m.role === "user") {
        ollamaMessages.push({ role: "user", content: m.content });
      } else if (m.role === "assistant") {
        ollamaMessages.push({ role: "assistant", content: m.content ?? "" });
      } else if (m.role === "tool") {
        ollamaMessages.push({
          role: "user",
          content: `[Tool result for ${m.toolName}]: ${m.content}`,
        });
      }
    }

    return {
      url,
      headers: { "Content-Type": "application/json" },
      body: {
        model: options?.model ?? "llama3.2",
        messages: ollamaMessages,
        stream: false,
        options: {
          temperature: options?.temperature ?? 0.3,
          ...(options?.maxOutputTokens ? { num_predict: options.maxOutputTokens } : {}),
        },
      },
    };
  }

  // ─── Tool-call response parsing ───────────────────────────────────────────

  /**
   * Extracts the assistant's text content and any tool calls from a provider response.
   * Returns `toolCalls: []` if the model chose to respond with text only.
   */
  static parseToolCallResponse(
    config: ProviderConfig,
    json: any
  ): { text?: string; toolCalls: ToolCallRequest[] } {
    switch (config.provider) {
      case "gemini":
        return this.parseGeminiToolResponse(json);
      case "claude":
        return this.parseClaudeToolResponse(json);
      case "ollama":
        return this.parseOllamaToolResponse(json);
      default:
        return this.parseOpenAIToolResponse(json);
    }
  }

  private static parseOpenAIToolResponse(
    json: any
  ): { text?: string; toolCalls: ToolCallRequest[] } {
    const message = json?.choices?.[0]?.message;
    const text: string | undefined = message?.content ?? undefined;
    const rawCalls: any[] = message?.tool_calls ?? [];
    const toolCalls: ToolCallRequest[] = rawCalls.map(tc => ({
      id: tc.id ?? "",
      name: tc.function?.name ?? "",
      input: (() => {
        try { return JSON.parse(tc.function?.arguments ?? "{}"); }
        catch { return {}; }
      })(),
    }));
    return { text: text || undefined, toolCalls };
  }

  private static parseClaudeToolResponse(
    json: any
  ): { text?: string; toolCalls: ToolCallRequest[] } {
    const content: any[] = json?.content ?? [];
    let text: string | undefined;
    const toolCalls: ToolCallRequest[] = [];

    for (const block of content) {
      if (block.type === "text") {
        text = (text ?? "") + block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id ?? "",
          name: block.name ?? "",
          input: block.input ?? {},
        });
      }
    }
    return { text: text || undefined, toolCalls };
  }

  private static parseGeminiToolResponse(
    json: any
  ): { text?: string; toolCalls: ToolCallRequest[] } {
    const parts: any[] = json?.candidates?.[0]?.content?.parts ?? [];
    let text: string | undefined;
    const toolCalls: ToolCallRequest[] = [];

    for (const part of parts) {
      if (part.text) {
        text = (text ?? "") + part.text;
      } else if (part.functionCall) {
        toolCalls.push({
          id: part.functionCall.name ?? "",   // Gemini has no call ID — use name
          name: part.functionCall.name ?? "",
          input: part.functionCall.args ?? {},
        });
      }
    }
    return { text: text || undefined, toolCalls };
  }

  private static parseOllamaToolResponse(
    json: any
  ): { text?: string; toolCalls: ToolCallRequest[] } {
    const content: string = json?.message?.content ?? "";
    // Detect Ollama's JSON tool_call response
    try {
      const parsed = JSON.parse(content.trim());
      if (parsed?.tool_call?.name) {
        return {
          toolCalls: [
            {
              id: parsed.tool_call.name,
              name: parsed.tool_call.name,
              input: parsed.tool_call.input ?? {},
            },
          ],
        };
      }
    } catch { /* not JSON — treat as plain text */ }
    return { text: content || undefined, toolCalls: [] };
  }

  // ─── Streaming parsers (Claude SSE) ─────────────────────────────────────────

  /**
   * Parses a single SSE data line from the Claude streaming API.
   * Returns the text delta or null for non-content events.
   */
  static parseClaudeStreamChunk(data: string): { token?: string; usage?: any; done?: boolean } {
    try {
      const json = JSON.parse(data);
      switch (json.type) {
        case "content_block_delta":
          return { token: json.delta?.text ?? "" };
        case "message_delta":
          return {
            usage: json.usage
              ? {
                  completion_tokens: json.usage.output_tokens,
                }
              : undefined,
          };
        case "message_start":
          return {
            usage: json.message?.usage
              ? {
                  prompt_tokens: json.message.usage.input_tokens,
                  cache_read_tokens: json.message.usage.cache_read_input_tokens,
                  cache_creation_tokens: json.message.usage.cache_creation_input_tokens,
                }
              : undefined,
          };
        case "message_stop":
          return { done: true };
        default:
          return {};
      }
    } catch {
      return {};
    }
  }
}
