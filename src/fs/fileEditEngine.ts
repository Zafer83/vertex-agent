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
