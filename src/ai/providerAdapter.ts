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

    if (config.useAccessToken && config.accessToken) {
      headers["Authorization"] = `Bearer ${config.accessToken}`;
    }

    const body = {
      model: options?.model || "vertex-agent",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      stream: options?.stream ?? false,
      temperature: options?.temperature ?? 0.3,
      stream_options: options?.stream ? { include_usage: true } : undefined,
    };

    return { url, headers, body };
  }

  private static buildGeminiRequest(
    config: ProviderConfig,
    prompt: string,
    systemPrompt: string,
    options?: ProviderRequestOptions
  ): ProviderRequest {
    const apiKey = config.apiKey || '';
    const endpoint = options?.stream ? 'streamGenerateContent' : 'generateContent';
    const url = `${config.serverUrl}/v1beta/models/gemini-flash-latest:${endpoint}`;
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-goog-api-key": apiKey,
    };

    const body = {
      contents: [
        {
          parts: [
            { text: systemPrompt + "\n\n" + prompt }
          ]
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
    const url = `${config.serverUrl}/v1/messages`;
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey || '',
      "anthropic-version": "2023-06-01",
    };

    const body = {
      model: options?.model || "claude-3-5-sonnet-20241022",
      max_tokens: options?.maxOutputTokens ?? 8192,
      system: systemPrompt,
      messages: [
        { role: "user", content: prompt }
      ],
      temperature: options?.temperature ?? 0.3,
      stream: options?.stream ?? false,
    };

    return { url, headers, body };
  }

  private static buildOllamaRequest(
    config: ProviderConfig,
    prompt: string,
    systemPrompt: string,
    options?: ProviderRequestOptions
  ): ProviderRequest {
    const url = `${config.serverUrl}:${config.serverPort}/api/chat`;
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const body = {
      model: options?.model || "llama3.2",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      stream: options?.stream ?? false,
      options: {
        temperature: options?.temperature ?? 0.3,
      },
    };

    return { url, headers, body };
  }

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
    const content = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "Keine Antwort von Gemini erhalten.";
    const usage = json?.usageMetadata ? {
      prompt_tokens: json.usageMetadata.promptTokenCount,
      completion_tokens: json.usageMetadata.candidatesTokenCount,
      total_tokens: json.usageMetadata.totalTokenCount,
    } : undefined;
    
    return { content, usage };
  }

  private static parseClaudeResponse(json: any): { content: string; usage?: any } {
    const content = json?.content?.[0]?.text ?? "Keine Antwort von Claude erhalten.";
    const usage = json?.usage ? {
      prompt_tokens: json.usage.input_tokens,
      completion_tokens: json.usage.output_tokens,
      total_tokens: json.usage.input_tokens + json.usage.output_tokens,
    } : undefined;
    
    return { content, usage };
  }

  private static parseOllamaResponse(json: any): { content: string; usage?: any } {
    return {
      content: json?.message?.content ?? "Keine Antwort von Ollama erhalten.",
      usage: undefined,
    };
  }
}
