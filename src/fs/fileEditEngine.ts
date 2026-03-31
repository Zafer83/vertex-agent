/**
 * VertexAgent – FileEditEngine
 * Wendet vom Agenten vorgeschlagene Edits atomar auf Dateien im Workspace an.
 * Copyright (c) VertexLabs – Zafer Kılıçaslan
 * www.vertexlabs.de
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { AgentEdit } from "../ai/aiClient";

export class FileEditEngine {
  async applyFileEdits(edits: AgentEdit[]): Promise<void> {
    if (!edits || edits.length === 0) return;

    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) {
      throw new Error("Kein Workspace geöffnet. Dateiänderungen nicht möglich.");
    }

    const root = workspace.uri.fsPath;

    for (const edit of edits) {
      const relative = edit.filePath.replace(/^[/\\]+/, "");
      const fullPath = path.join(root, relative);

      console.log('[FileEditEngine] Processing edit for:', fullPath);

      // Check if this is a DELETE operation
      if (edit.newContent.trim() === 'DELETE' || edit.newContent.trim() === '<<DELETE>>') {
        console.log('[FileEditEngine] Deleting:', fullPath);
        
        const docUri = vscode.Uri.file(fullPath);
        
        // Check if path exists and if it's a file or directory
        try {
          const stats = await fs.promises.stat(fullPath);
          
          if (stats.isDirectory()) {
            // Delete directory recursively
            console.log('[FileEditEngine] Deleting directory:', fullPath);
            const wsEdit = new vscode.WorkspaceEdit();
            wsEdit.deleteFile(docUri, { recursive: true, ignoreIfNotExists: true });
            await vscode.workspace.applyEdit(wsEdit);
            console.log('[FileEditEngine] Directory deleted:', fullPath);
          } else {
            // Delete file
            console.log('[FileEditEngine] Deleting file:', fullPath);
            const openDoc = vscode.workspace.textDocuments.find(
              (d) => d.uri.fsPath === fullPath
            );

            if (openDoc) {
              const wsEdit = new vscode.WorkspaceEdit();
              wsEdit.deleteFile(docUri, { ignoreIfNotExists: true });
              await vscode.workspace.applyEdit(wsEdit);
            } else {
              await fs.promises.unlink(fullPath);
            }
            console.log('[FileEditEngine] File deleted:', fullPath);
          }
        } catch (err) {
          console.error('[FileEditEngine] Failed to delete:', fullPath, err);
        }
        continue;
      }

      // Ensure directory exists
      await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });

      const docUri = vscode.Uri.file(fullPath);
      const openDoc = vscode.workspace.textDocuments.find(
        (d) => d.uri.fsPath === fullPath
      );

      if (openDoc) {
        // File is open in editor - use WorkspaceEdit
        console.log('[FileEditEngine] File is open, updating in editor:', fullPath);
        const wsEdit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
          openDoc.positionAt(0),
          openDoc.positionAt(openDoc.getText().length)
        );
        wsEdit.replace(docUri, fullRange, edit.newContent);
        const success = await vscode.workspace.applyEdit(wsEdit);
        
        if (success) {
          // Save the document
          await openDoc.save();
          console.log('[FileEditEngine] File updated and saved:', fullPath);
        } else {
          console.error('[FileEditEngine] Failed to apply edit to open document:', fullPath);
        }
      } else {
        // File is not open - write directly to disk
        console.log('[FileEditEngine] File is not open, writing to disk:', fullPath);
        await fs.promises.writeFile(fullPath, edit.newContent, "utf8");
        console.log('[FileEditEngine] File written to disk:', fullPath);
      }
    }
  }
}

export async function applyFileEdits(edits: AgentEdit[]): Promise<void> {
  const engine = new FileEditEngine();
  await engine.applyFileEdits(edits);
}

function toSafeRelativePath(input: string): string | undefined {
  const cleaned = input.trim().replace(/^['"]|['"]$/g, "").replace(/^[/\\]+/, "");
  if (!cleaned) return undefined;

  const normalized = path.normalize(cleaned);
  if (path.isAbsolute(normalized)) return undefined;
  if (normalized.startsWith("..")) return undefined;
  if (normalized.includes(`..${path.sep}`)) return undefined;
  return normalized;
}

function extractBashContent(text: string): string {
  const raw = String(text || "");
  const blocks = Array.from(raw.matchAll(/```(?:execute-bash|bash|sh|zsh)?\s*([\s\S]*?)```/gi))
    .map((match) => (match[1] || "").trim())
    .filter((block) => block.length > 0);
  if (blocks.length > 0) return blocks.join("\n");
  return raw;
}

function normalizeBashScript(rawScript: string): string {
  // Normalize separators so chained single-line commands like
  // "mkdir -p docs touch docs/TODO.md" become line-separated commands.
  let normalized = String(rawScript || "");
  normalized = normalized.replace(/&&/g, "\n").replace(/;/g, "\n");
  normalized = normalized.replace(/([^\n;&|])\s+(mkdir|touch|rm)\b/g, "$1\n$2");
  return normalized;
}

export async function applySafeBashFsCommandsFromText(text: string): Promise<{ dirs: number; files: number }> {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) {
    throw new Error("Kein Workspace geöffnet. Dateiänderungen nicht möglich.");
  }

  const root = workspace.uri.fsPath;
  const bash = normalizeBashScript(extractBashContent(text));
  let dirs = 0;
  let files = 0;

  const mkdirRegex = /mkdir(?:\s+-p)?\s+([^\n;&|]+)/g;
  let mkdirMatch: RegExpExecArray | null;
  while ((mkdirMatch = mkdirRegex.exec(bash)) !== null) {
    const args = mkdirMatch[1]
      .split(/\s+/)
      .map((arg) => arg.trim())
      .filter((arg) => arg.length > 0 && !arg.startsWith("-"));

    for (const arg of args) {
      const rel = toSafeRelativePath(arg);
      if (!rel) continue;
      await fs.promises.mkdir(path.join(root, rel), { recursive: true });
      dirs++;
    }
  }

  const touchRegex = /touch\s+([^\n;&|]+)/g;
  let touchMatch: RegExpExecArray | null;
  while ((touchMatch = touchRegex.exec(bash)) !== null) {
    const args = touchMatch[1]
      .split(/\s+/)
      .map((arg) => arg.trim())
      .filter((arg) => arg.length > 0 && !arg.startsWith("-"));

    for (const arg of args) {
      const rel = toSafeRelativePath(arg);
      if (!rel) continue;
      const fullPath = path.join(root, rel);
      await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });

      try {
        const now = new Date();
        await fs.promises.utimes(fullPath, now, now);
      } catch {
        await fs.promises.writeFile(fullPath, "", "utf8");
      }
      files++;
    }
  }

  return { dirs, files };
}
