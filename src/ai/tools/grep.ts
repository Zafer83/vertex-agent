/**
 * VertexAgent Tool — grep
 * Search for a text/regex pattern across workspace files.
 * Falls back to a pure-Node implementation when VS Code API is unavailable.
 */

import * as fs from "fs";
import * as path from "path";
import { AgentTool } from "./types";

// ─── Pure-Node file walker (fallback for testing) ────────────────────────────

function walkSourceFiles(dir: string, results: string[], max: number): void {
  if (results.length >= max) return;
  const SOURCE_EXTS = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".kt", ".cs",
    ".rb", ".php", ".swift", ".md", ".json", ".yaml", ".yml",
  ]);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (results.length >= max) break;
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSourceFiles(fullPath, results, max);
    } else if (SOURCE_EXTS.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }
}

function grepFiles(
  workspacePath: string,
  pattern: string,
  maxMatches: number
): string[] {
  const allFiles: string[] = [];
  walkSourceFiles(workspacePath, allFiles, 200);

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, "i");
  } catch {
    regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }

  const results: string[] = [];
  for (const file of allFiles) {
    if (results.length >= maxMatches) break;
    try {
      const text = fs.readFileSync(file, "utf-8");
      const lines = text.split("\n");
      const rel = path.relative(workspacePath, file).replace(/\\/g, "/");
      for (let i = 0; i < lines.length && results.length < maxMatches; i++) {
        if (regex.test(lines[i])) {
          results.push(`${rel}:${i + 1}: ${lines[i].trim()}`);
        }
      }
    } catch { /* skip unreadable */ }
  }
  return results;
}

// ─── Tool definition ─────────────────────────────────────────────────────────

export const grepTool: AgentTool = {
  name: "grep",
  description:
    "Search for a text or regex pattern across workspace source files. " +
    "Returns matching lines with file path and line number.",
  inputSchema: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Text string or JavaScript regex pattern to search for.",
      },
      fileGlob: {
        type: "string",
        description:
          "Glob pattern to filter files (e.g. '**/*.ts'). " +
          "Defaults to all common source file extensions.",
      },
      maxMatches: {
        type: "number",
        description: "Maximum matching lines to return (default: 30).",
      },
    },
    required: ["pattern"],
  },

  async execute(input, ctx) {
    const pattern = String(input.pattern ?? "");
    const fileGlob = input.fileGlob
      ? String(input.fileGlob)
      : "**/*.{ts,tsx,js,jsx,py,go,rs,java,kt,cs,md}";
    const maxMatches = Math.min(Number(input.maxMatches ?? 30), 100);

    let results: string[] = [];

    try {
      const vscode = require("vscode") as typeof import("vscode");
      const files = await vscode.workspace.findFiles(
        fileGlob,
        "**/node_modules/**",
        200
      );

      let regex: RegExp;
      try {
        regex = new RegExp(pattern, "i");
      } catch {
        regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      }

      for (const file of files) {
        if (results.length >= maxMatches) break;
        try {
          const doc = await vscode.workspace.openTextDocument(file);
          const lines = doc.getText().split("\n");
          const rel = vscode.workspace.asRelativePath(file);
          for (let i = 0; i < lines.length && results.length < maxMatches; i++) {
            if (regex.test(lines[i])) {
              results.push(`${rel}:${i + 1}: ${lines[i].trim()}`);
            }
          }
        } catch { /* skip */ }
      }
    } catch {
      // No VS Code — pure-Node fallback
      results = grepFiles(ctx.workspacePath, pattern, maxMatches);
    }

    if (results.length === 0) return `No matches found for "${pattern}".`;
    return results.join("\n");
  },
};
