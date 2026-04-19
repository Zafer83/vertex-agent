/**
 * VertexAgent Tool — write_file
 * Write content to a workspace file (creates directories as needed).
 */

import * as fs from "fs";
import * as path from "path";
import { AgentTool } from "./types";

export const writeFileTool: AgentTool = {
  name: "write_file",
  description:
    "Write (or overwrite) a file in the workspace. Creates missing parent directories. " +
    "Use DELETE as content to remove the file.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative path from the workspace root.",
      },
      content: {
        type: "string",
        description:
          "Text content to write. Pass the literal string 'DELETE' to remove the file.",
      },
    },
    required: ["path", "content"],
  },

  async execute(input, ctx) {
    const rel = String(input.path ?? "").replace(/^\//, "");
    const abs = path.resolve(ctx.workspacePath, rel);

    if (!abs.startsWith(ctx.workspacePath)) {
      return "Error: path traversal is not allowed.";
    }

    const content = String(input.content ?? "");

    try {
      if (content.trim().toUpperCase() === "DELETE") {
        if (fs.existsSync(abs)) {
          fs.unlinkSync(abs);
          return `Deleted "${rel}".`;
        }
        return `File "${rel}" does not exist.`;
      }

      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, "utf-8");
      return `Wrote ${content.length} characters to "${rel}".`;
    } catch (e: any) {
      return `Error writing "${rel}": ${e.message}`;
    }
  },
};
