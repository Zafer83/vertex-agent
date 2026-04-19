/**
 * VertexAgent Tool — git_diff
 * Return the current git diff (unstaged or staged) for the workspace.
 */

import { execSync } from "child_process";
import { AgentTool } from "./types";

export const gitDiffTool: AgentTool = {
  name: "git_diff",
  description:
    "Get the current git diff showing changes in the workspace. " +
    "Returns unstaged changes by default; pass staged=true for staged changes.",
  inputSchema: {
    type: "object",
    properties: {
      file: {
        type: "string",
        description:
          "Optional: relative path of a specific file to diff. Omit for the full diff.",
      },
      staged: {
        type: "boolean",
        description: "If true, return staged (--cached) diff. Default: false.",
      },
    },
    required: [],
  },

  async execute(input, ctx) {
    const staged = input.staged === true ? "--cached" : "";
    const file = input.file ? String(input.file).replace(/[;&|`$]/g, "") : "";

    // Construct command — sanitise file path (no shell metacharacters)
    const args = ["git", "diff", staged, "--", file].filter(Boolean).join(" ");

    try {
      const output = execSync(args, {
        cwd: ctx.workspacePath,
        timeout: 8_000,
        maxBuffer: 512 * 1024,
      })
        .toString()
        .trim();

      const maxChars = ctx.maxOutputChars ?? 8000;
      if (!output) return "No changes.";
      return output.length > maxChars
        ? output.slice(0, maxChars) + "\n... [truncated]"
        : output;
    } catch (e: any) {
      return `Error running git diff: ${e.message}`;
    }
  },
};
