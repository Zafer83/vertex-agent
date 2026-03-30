/**
 * VertexAgent – ModelFetcher
 * Fetches available models from different providers
 */

import { request } from "undici";
import * as vscode from "vscode";

export interface ModelInfo {
  id: string;
  displayName: string;
}

/**
 * Fetches models from OpenAI-compatible endpoints
 */
export async function fetchAvailableModel(): Promise<string | null> {
  const config = vscode.workspace.getConfiguration("vertexAgent");
  const provider = config.get<string>("provider", "openai");
  const serverUrl = config.get<string>("serverUrl", "http://localhost");
  const serverPort = config.get<number>("serverPort", 8080);
  const apiKey = config.get<string>("apiKey", "");
  const useAccessToken = config.get<boolean>("useAccessToken", false);
  const accessToken = config.get<string>("accessToken", "");

  try {
    // OpenAI-compatible providers
    if (provider === "openai" || provider === "ollama" || provider === "custom") {
      const url = `${serverUrl.replace(/\/$/, "")}:${serverPort}/v1/models`;
      
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (useAccessToken && accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
      } else if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const res = await request(url, {
        method: "GET",
        headers,
      });

      if (res.statusCode === 200) {
        const json = (await res.body.json()) as any;
        
        if (json.data && Array.isArray(json.data) && json.data.length > 0) {
          // Get first model and trim it
          const modelId = json.data[0].id;
          return trimModelName(modelId);
        }
      }
    }

    // For Gemini, Claude, etc. - return configured model or provider name
    const configuredModel = config.get<string>("model", "");
    if (configuredModel) {
      return trimModelName(configuredModel);
    }

    return null;
  } catch (error) {
    console.error("[ModelFetcher] Error fetching models:", error);
    return null;
  }
}

/**
 * Trims model name to short form
 * Examples:
 * - "gpt-4-turbo-preview" -> "gpt-4-turbo"
 * - "llama-3.2-8b-instruct-q4_K_M" -> "llama-3.2-8b"
 * - "gemini-1.5-flash-latest" -> "gemini-1.5-flash"
 * - "claude-3-5-sonnet-20241022" -> "claude-3-5-sonnet"
 */
function trimModelName(modelName: string): string {
  // Remove common suffixes
  let trimmed = modelName
    .replace(/-preview$/i, '')
    .replace(/-latest$/i, '')
    .replace(/-\d{8}$/i, '') // Remove date stamps like -20241022
    .replace(/-\d{6}$/i, '')  // Remove date stamps like -202410
    .replace(/-(q\d+_[kKmM](_[mMsSlL])?|gguf|ggml|fp\d+|int\d+)$/i, '') // Remove quantization
    .replace(/-instruct$/i, '')
    .replace(/-chat$/i, '')
    .replace(/-turbo-preview$/i, '-turbo');

  // Limit length - take first 3-4 segments
  const parts = trimmed.split('-');
  if (parts.length > 4) {
    trimmed = parts.slice(0, 4).join('-');
  }

  // Max 30 characters
  if (trimmed.length > 30) {
    trimmed = trimmed.substring(0, 30);
  }

  return trimmed;
}
