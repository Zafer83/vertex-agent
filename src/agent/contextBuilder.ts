/**
 * VertexAgent – ContextBuilder
 * Sammelt Projektkontext (Code-Snippets) für den Agenten.
 * Copyright (c) VertexLabs – Zafer Kılıçaslan
 * www.vertexlabs.de
 */

import * as vscode from "vscode";

export class ContextBuilder {
  constructor(
    private maxFiles: number = 40,
    private maxCharsPerFile: number = 2000
  ) {}

  public async collect(): Promise<string> {
    const files = await vscode.workspace.findFiles(
      "**/*.{ts,tsx,js,jsx,py,go,rs,cs,java,kt,swift}",
      "**/node_modules/**",
      this.maxFiles
    );

    const snippets: string[] = [];

    for (const file of files) {
      const doc = await vscode.workspace.openTextDocument(file);
      const text = doc.getText().slice(0, this.maxCharsPerFile);
      snippets.push(`// FILE: ${file.fsPath}\n${text}`);
    }

    return snippets.join("\n\n");
  }
}
