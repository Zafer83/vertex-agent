/**
 * VertexAgent Tool — run_tests
 * Execute the project's test suite and return the output.
 * Only safe test runner commands are permitted.
 */

import { execSync } from "child_process";
import { AgentTool } from "./types";

/** Commands that are allowed to execute. Checked as prefix. */
const SAFE_TEST_PREFIXES = [
  "npm test",
  "npm run test",
  "yarn test",
  "pnpm test",
  "pytest",
  "python -m pytest",
  "python3 -m pytest",
  "jest",
  "vitest",
  "cargo test",
  "go test",
  "node tests/",
  "npx jest",
  "npx vitest",
];

export const runTestsTool: AgentTool = {
  name: "run_tests",
  description:
    "Run the project's test suite and return the output. " +
    "Only whitelisted test runner commands (npm test, pytest, jest, etc.) are permitted.",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description:
          "Test command to run. Defaults to 'npm test'. " +
          `Allowed prefixes: ${SAFE_TEST_PREFIXES.join(", ")}.`,
      },
    },
    required: [],
  },

  async execute(input, ctx) {
    let cmd = input.command ? String(input.command).trim() : "npm test";

    const allowed = SAFE_TEST_PREFIXES.some(prefix => cmd.startsWith(prefix));
    if (!allowed) {
      return (
        `Error: command "${cmd}" is not in the allowlist.\n` +
        `Allowed prefixes: ${SAFE_TEST_PREFIXES.join(", ")}`
      );
    }

    try {
      const output = execSync(cmd, {
        cwd: ctx.workspacePath,
        timeout: 120_000,
        maxBuffer: 512 * 1024,
      }).toString();
      return output.slice(0, 6000) || "(empty output)";
    } catch (e: any) {
      // execSync throws on non-zero exit — capture stdout/stderr for the test failure details
      const out = [e.stdout?.toString(), e.stderr?.toString(), e.message]
        .filter(Boolean)
        .join("\n");
      return `Tests failed:\n${out.slice(0, 6000)}`;
    }
  },
};
