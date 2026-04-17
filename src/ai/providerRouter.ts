/**
 * VertexAgent – Provider Router
 *
 * Resolves which ProviderConfig to use for each sub-agent role.
 * Enables the mixed-provider strategy: heavy-reasoning providers (Claude Sonnet)
 * for the Planner and Judge, cheaper/faster providers for parallel Coders.
 *
 * Copyright (c) VertexLabs – Zafer Kılıçaslan
 */

import * as vscode from "vscode";
import { ProviderConfig } from "./providerAdapter";

export interface ProviderRouting {
  /** Provider for the Planner sub-agent (decomposes the task). */
  planner: ProviderConfig;
  /** Provider for Coder sub-agents (writes code). Always the main provider. */
  coder: ProviderConfig;
  /** Provider for the Judge quality gate. */
  judge: ProviderConfig;
}

/** Known cloud provider endpoints (port 443, HTTPS). */
const CLOUD_ENDPOINTS: Record<string, { url: string; port: number }> = {
  claude: { url: "https://api.anthropic.com", port: 443 },
  gemini: { url: "https://generativelanguage.googleapis.com", port: 443 },
  openai: { url: "https://api.openai.com", port: 443 },
};

/**
 * Resolves a named provider setting (e.g. "claude", "same") into a concrete
 * ProviderConfig using the VS Code workspace configuration for API keys.
 */
function resolveConfig(
  providerName: string,
  defaultConfig: ProviderConfig,
  config: vscode.WorkspaceConfiguration,
  overrideApiKeySettingName?: string
): ProviderConfig {
  if (providerName === "same" || providerName === defaultConfig.provider) {
    return defaultConfig;
  }

  const cloud = CLOUD_ENDPOINTS[providerName];
  const apiKey =
    (overrideApiKeySettingName ? config.get<string>(overrideApiKeySettingName, "") : "") ||
    config.get<string>("apiKey", "");

  return {
    provider: providerName,
    serverUrl: cloud?.url ?? defaultConfig.serverUrl,
    serverPort: cloud?.port ?? defaultConfig.serverPort,
    apiKey,
    useAccessToken: defaultConfig.useAccessToken,
    accessToken: defaultConfig.accessToken,
  };
}

/**
 * Resolves the full provider routing from VS Code settings and the active provider.
 *
 * @param config         VS Code workspace configuration for "vertexAgent"
 * @param defaultConfig  The main provider config (from current vertexAgent settings)
 */
export function resolveProviderRouting(
  config: vscode.WorkspaceConfiguration,
  defaultConfig: ProviderConfig
): ProviderRouting {
  const plannerProviderName = config.get<string>("plannerProvider", "same");
  const judgeProviderName = config.get<string>("judgeProvider", "same");

  return {
    planner: resolveConfig(plannerProviderName, defaultConfig, config),
    coder: defaultConfig,
    judge: resolveConfig(judgeProviderName, defaultConfig, config, "judgeApiKey"),
  };
}
