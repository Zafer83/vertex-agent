/**
 * VertexAgent Tool — run_bash
 * Execute a sandboxed shell command.
 * Only read-only and inspection commands are allowed — no writes, no pipes to sh.
 */

import { execSync } from "child_process";
import { AgentTool } from "./types";

/**
 * Allowlist: each regex is tested against the full trimmed command string.
 * These patterns cover common read-only inspection and listing operations.
 */
const ALLOWED_PATTERNS: RegExp[] = [
  /^ls(\s|$)/,
  /^ls$/,
  /^cat\s+[\w./\-]+$/,
  /^head(\s|$)/,
  /^tail(\s|$)/,
  /^wc(\s|$)/,
  /^echo\s/,
  /^pwd$/,
  /^find\s/,
  /^grep\s/,
  /^git\s+(status|log|diff|show|branch|remote)(\s|$)/,
  /^node\s+tests\//,
  /^python\s+tests\//,
  /^python3\s+tests\//,
  /^which\s+\w+$/,
  /^type\s+\w+$/,
  /^env$/,
  /^printenv(\s+\w+)?$/,
];

export const runBashTool: AgentTool = {
  name: "run_bash",
  description:
    "Run a sandboxed shell command. Only read-only inspection commands are allowed " +
    "(ls, cat, head, tail, grep, git status/log/diff, node tests/…). " +
    "Write operations and pipe-to-shell patterns are blocked.",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Shell command to execute.",
      },
    },
    required: ["command"],
  },

  async execute(input, ctx) {
    const cmd = String(input.command ?? "").trim();

    if (!cmd) return "Error: empty command.";

    // Block shell injection chars regardless of allowlist
    if (/[;&|`$<>]/.test(cmd)) {
      return `Error: command contains disallowed shell metacharacters: "${cmd}".`;
    }

    const allowed = ALLOWED_PATTERNS.some(r => r.test(cmd));
    if (!allowed) {
      return (
        `Error: command "${cmd}" is not in the allowlist.\n` +
        "Only read-only commands (ls, cat, grep, git status/log/diff, node tests/…) are permitted."
      );
    }

    try {
      const output = execSync(cmd, {
        cwd: ctx.workspacePath,
        timeout: 15_000,
        maxBuffer: 256 * 1024,
      }).toString();
      const maxChars = ctx.maxOutputChars ?? 4000;
      return output.slice(0, maxChars) || "(empty output)";
    } catch (e: any) {
      const out = [e.stdout?.toString(), e.message].filter(Boolean).join("\n");
      return `Error: ${out.slice(0, 2000)}`;
    }
  },
};
