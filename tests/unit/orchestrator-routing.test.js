/**
 * Unit tests for src/ai/providerRouter.ts — resolveProviderRouting logic.
 *
 * Tests the pure routing logic without VS Code or real HTTP calls.
 * The VS Code `WorkspaceConfiguration` interface is mocked as a plain object.
 *
 * Run: node tests/unit/orchestrator-routing.test.js
 */

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ FAILED: ${testName}`);
    failed++;
  }
}

// ─── Inline routing logic (mirrors providerRouter.ts) ────────────────────────

const CLOUD_ENDPOINTS = {
  claude:  { url: "https://api.anthropic.com",              port: 443 },
  gemini:  { url: "https://generativelanguage.googleapis.com", port: 443 },
  openai:  { url: "https://api.openai.com",                  port: 443 },
};

function resolveConfig(providerName, defaultConfig, config, overrideApiKeySettingName) {
  if (providerName === "same" || providerName === defaultConfig.provider) {
    return defaultConfig;
  }

  const cloud = CLOUD_ENDPOINTS[providerName];
  const apiKey =
    (overrideApiKeySettingName ? config.get(overrideApiKeySettingName, "") : "") ||
    config.get("apiKey", "");

  return {
    provider: providerName,
    serverUrl: cloud?.url ?? defaultConfig.serverUrl,
    serverPort: cloud?.port ?? defaultConfig.serverPort,
    apiKey,
    useAccessToken: defaultConfig.useAccessToken,
    accessToken: defaultConfig.accessToken,
  };
}

function resolveProviderRouting(config, defaultConfig) {
  const plannerProviderName = config.get("plannerProvider", "same");
  const judgeProviderName   = config.get("judgeProvider",   "same");

  return {
    planner: resolveConfig(plannerProviderName, defaultConfig, config),
    coder:   defaultConfig,
    judge:   resolveConfig(judgeProviderName,   defaultConfig, config, "judgeApiKey"),
  };
}

// ─── Mock VS Code WorkspaceConfiguration ─────────────────────────────────────

function makeConfig(overrides = {}) {
  const defaults = {
    plannerProvider:  "same",
    judgeProvider:    "same",
    judgeApiKey:      "",
    apiKey:           "test-api-key",
  };
  const store = { ...defaults, ...overrides };
  return {
    get(key, fallback) {
      return key in store ? store[key] : fallback;
    },
  };
}

// ─── Default provider configs ─────────────────────────────────────────────────

const geminiDefault = {
  provider: "gemini",
  serverUrl: "https://generativelanguage.googleapis.com",
  serverPort: 443,
  apiKey: "gemini-key",
  useAccessToken: false,
  accessToken: "",
};

const ollamaDefault = {
  provider: "ollama",
  serverUrl: "http://localhost",
  serverPort: 11434,
  apiKey: "",
  useAccessToken: false,
  accessToken: "",
};

const claudeDefault = {
  provider: "claude",
  serverUrl: "https://api.anthropic.com",
  serverPort: 443,
  apiKey: "claude-key",
  useAccessToken: false,
  accessToken: "",
};

// ─────────────────────────────────────────────────────────────────────────────

console.log("\n=== 1. plannerProvider=same — all slots use main provider ===");

const sameSame = resolveProviderRouting(makeConfig(), geminiDefault);
assert(sameSame.coder  === geminiDefault, "coder is identity (same object)");
assert(sameSame.planner === geminiDefault, "planner=same → main provider identity");
assert(sameSame.judge  === geminiDefault, "judge=same → main provider identity");

console.log("\n=== 2. plannerProvider=claude — planner routes to Anthropic ===");

const plannerClaude = resolveProviderRouting(
  makeConfig({ plannerProvider: "claude", apiKey: "shared-key" }),
  geminiDefault
);
assert(plannerClaude.planner.provider    === "claude",                     "planner.provider=claude");
assert(plannerClaude.planner.serverUrl   === "https://api.anthropic.com",  "planner uses Anthropic URL");
assert(plannerClaude.planner.serverPort  === 443,                          "planner uses port 443");
assert(plannerClaude.planner.apiKey      === "shared-key",                 "planner picks up shared apiKey");
assert(plannerClaude.coder               === geminiDefault,                "coder unchanged");

console.log("\n=== 3. judgeProvider=claude with dedicated judgeApiKey ===");

const judgeClaudeKey = resolveProviderRouting(
  makeConfig({ judgeProvider: "claude", judgeApiKey: "judge-specific-key" }),
  geminiDefault
);
assert(judgeClaudeKey.judge.provider   === "claude",                    "judge.provider=claude");
assert(judgeClaudeKey.judge.serverUrl  === "https://api.anthropic.com", "judge uses Anthropic URL");
assert(judgeClaudeKey.judge.apiKey     === "judge-specific-key",        "judge uses judgeApiKey over apiKey");
assert(judgeClaudeKey.coder            === geminiDefault,               "coder still main provider");
assert(judgeClaudeKey.planner          === geminiDefault,               "planner=same → main provider");

console.log("\n=== 4. judgeApiKey empty → falls back to shared apiKey ===");

const judgeNoSpecificKey = resolveProviderRouting(
  makeConfig({ judgeProvider: "claude", judgeApiKey: "", apiKey: "shared-fallback" }),
  geminiDefault
);
assert(judgeNoSpecificKey.judge.apiKey === "shared-fallback", "judge falls back to main apiKey");

console.log("\n=== 5. plannerProvider=gemini when main is Gemini → identity ===");

const geminiSelf = resolveProviderRouting(
  makeConfig({ plannerProvider: "gemini" }),
  geminiDefault
);
assert(geminiSelf.planner === geminiDefault, "plannerProvider=gemini when main=gemini → identity (same object)");

console.log("\n=== 6. plannerProvider=openai → routes to OpenAI endpoint ===");

const plannerOpenAI = resolveProviderRouting(
  makeConfig({ plannerProvider: "openai", apiKey: "oai-key" }),
  geminiDefault
);
assert(plannerOpenAI.planner.provider   === "openai",              "planner.provider=openai");
assert(plannerOpenAI.planner.serverUrl  === "https://api.openai.com", "planner uses OpenAI URL");
assert(plannerOpenAI.planner.serverPort === 443,                   "planner port 443");
assert(plannerOpenAI.planner.apiKey     === "oai-key",             "planner apiKey from config");

console.log("\n=== 7. Ollama main provider + plannerProvider=claude ===");

const ollamaMainClaudePlanner = resolveProviderRouting(
  makeConfig({ plannerProvider: "claude", apiKey: "claude-api-key" }),
  ollamaDefault
);
assert(ollamaMainClaudePlanner.coder    === ollamaDefault,             "coder is ollama (main)");
assert(ollamaMainClaudePlanner.planner.provider  === "claude",         "planner routed to claude");
assert(ollamaMainClaudePlanner.planner.serverUrl === "https://api.anthropic.com", "planner anthropic url");

console.log("\n=== 8. Main provider is Claude + plannerProvider=same ===");

const claudeMain = resolveProviderRouting(makeConfig(), claudeDefault);
assert(claudeMain.planner === claudeDefault, "planner=same when main=claude → identity");
assert(claudeMain.judge   === claudeDefault, "judge=same when main=claude → identity");
assert(claudeMain.coder   === claudeDefault, "coder is claude main");

console.log("\n=== 9. plannerProvider=same matches by value even for unknown provider ===");

const customDefault = {
  provider: "custom",
  serverUrl: "http://myserver.local",
  serverPort: 8080,
  apiKey: "custom-key",
  useAccessToken: false,
  accessToken: "",
};
const customSame = resolveProviderRouting(makeConfig({ plannerProvider: "same" }), customDefault);
assert(customSame.planner === customDefault, "plannerProvider=same with custom provider → identity");

console.log("\n=== 10. Access token preserved in routed config ===");

const mainWithToken = {
  provider: "gemini",
  serverUrl: "https://generativelanguage.googleapis.com",
  serverPort: 443,
  apiKey: "gemini-key",
  useAccessToken: true,
  accessToken: "bearer-xyz",
};
const routedWithToken = resolveProviderRouting(
  makeConfig({ plannerProvider: "claude", apiKey: "c-key" }),
  mainWithToken
);
// accessToken & useAccessToken from default are propagated to the new config
assert(routedWithToken.planner.useAccessToken === true,          "useAccessToken propagated to planner");
assert(routedWithToken.planner.accessToken    === "bearer-xyz",  "accessToken propagated to planner");

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED`);
  process.exit(1);
} else {
  console.log("All orchestrator-routing tests passed ✅");
}
