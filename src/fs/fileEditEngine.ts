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

      await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.promises.writeFile(fullPath, edit.newContent, "utf8");

      const docUri = vscode.Uri.file(fullPath);
      const openDoc = vscode.workspace.textDocuments.find(
        (d) => d.uri.fsPath === fullPath
      );
      if (openDoc) {
        const wsEdit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
          openDoc.positionAt(0),
          openDoc.positionAt(openDoc.getText().length)
        );
        wsEdit.replace(docUri, fullRange, edit.newContent);
        await vscode.workspace.applyEdit(wsEdit);
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
  const fenced = raw.match(/```(?:bash|sh|zsh)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1];
  return raw;
}

export async function applySafeBashFsCommandsFromText(text: string): Promise<{ dirs: number; files: number }> {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) {
    throw new Error("Kein Workspace geöffnet. Dateiänderungen nicht möglich.");
  }

  const root = workspace.uri.fsPath;
  const bash = extractBashContent(text);
  let dirs = 0;
  let files = 0;

  const mkdirRegex = /mkdir(?:\s+-p)?\s+([^\s;&|]+)/g;
  let mkdirMatch: RegExpExecArray | null;
  while ((mkdirMatch = mkdirRegex.exec(bash)) !== null) {
    const rel = toSafeRelativePath(mkdirMatch[1]);
    if (!rel) continue;
    await fs.promises.mkdir(path.join(root, rel), { recursive: true });
    dirs++;
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
