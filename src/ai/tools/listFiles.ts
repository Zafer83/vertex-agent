/**
 * VertexAgent Tool — list_files
 * List workspace files matching a glob pattern.
 * Uses VS Code's workspace.findFiles API when available, falls back to a
 * pure-Node glob-lite scanner for testing outside VS Code.
 */

import * as path from "path";
import * as fs from "fs";
import { AgentTool } from "./types";

// ─── Tiny glob-lite for non-VS-Code environments ─────────────────────────────

function matchGlob(pattern: string, filePath: string): boolean {
  // Convert glob to regex: ** = any path segment, * = any non-slash
  const regex = new RegExp(
    "^" +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, "⟦DSTAR⟧")
        .replace(/\*/g, "[^/]*")
        .replace(/⟦DSTAR⟧/g, ".*") +
      "$"
  );
  return regex.test(filePath);
}

function walkDir(dir: string, base: string, results: string[], max: number): void {
  if (results.length >= max) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (results.length >= max) break;
    const rel = path.posix.join(base, entry.name);
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    if (entry.isDirectory()) {
      walkDir(path.join(dir, entry.name), rel, results, max);
    } else {
      results.push(rel);
    }
  }
}

function globFiles(workspacePath: string, pattern: string, maxResults: number): string[] {
  const allFiles: string[] = [];
  walkDir(workspacePath, "", allFiles, 2000);
  return allFiles
    .filter(f => matchGlob(pattern, f))
    .slice(0, maxResults);
}

// ─── Tool definition ─────────────────────────────────────────────────────────

export const listFilesTool: AgentTool = {
  name: "list_files",
  description:
    "List files in the workspace that match a glob pattern. " +
    "Returns relative file paths, one per line.",
  inputSchema: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Glob pattern (e.g. 'src/**/*.ts', '**/*.py', 'tests/**').",
      },
      maxResults: {
        type: "number",
        description: "Maximum files to return (default: 20, max: 100).",
      },
    },
    required: ["pattern"],
  },

  async execute(input, ctx) {
    const pattern = String(input.pattern ?? "**/*");
    const maxResults = Math.min(Number(input.maxResults ?? 20), 100);

    let files: string[] = [];

    // Try VS Code API first (available when running inside the extension host)
    try {
      const vscode = require("vscode") as typeof import("vscode");
      const uris = await vscode.workspace.findFiles(
        pattern,
        "**/node_modules/**",
        maxResults
      );
      files = uris.map(u => vscode.workspace.asRelativePath(u));
    } catch {
      // Not in VS Code — use pure-Node fallback
      files = globFiles(ctx.workspacePath, pattern, maxResults);
    }

    if (files.length === 0) return "No files found matching the pattern.";
    return files.join("\n");
  },
};
