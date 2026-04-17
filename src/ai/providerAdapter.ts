/**
 * VertexAgent – Provider Adapter
 * Konvertiert zwischen verschiedenen LLM API-Formaten
 * Copyright (c) VertexLabs – Zafer Kılıçaslan
 * www.vertexlabs.de
 */

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
