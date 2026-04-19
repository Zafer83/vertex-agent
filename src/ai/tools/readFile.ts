/**
 * VertexAgent Tool — read_file
 * Read a workspace file and return its text content.
 */

import * as fs from "fs";
import * as path from "path";
import { AgentTool } from "./types";

export const readFileTool: AgentTool = {
  name: "read_file",
  description:
    "Read the text content of a file in the workspace. " +
    "Returns the file content, truncated if it exceeds the output limit.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "Relative path from the workspace root (e.g. 'src/main.py' or 'README.md').",
      },
    },
    required: ["path"],
  },

  async execute(input, ctx) {
    const rel = String(input.path ?? "").replace(/^\//, "");
    const abs = path.resolve(ctx.workspacePath, rel);

    // Security: block path traversal
    if (!abs.startsWith(ctx.workspacePath)) {
      return "Error: path traversal is not allowed.";
    }

    try {
      const content = fs.readFileSync(abs, "utf-8");
      const maxChars = ctx.maxOutputChars ?? 8000;
      if (content.length > maxChars) {
        return content.slice(0, maxChars) + "\n... [truncated]";
      }
      return content;
    } catch (e: any) {
      return `Error reading "${rel}": ${e.message}`;
    }
  },
};
