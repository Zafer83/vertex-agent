/**
 * VertexAgent – ContextBuilder
 *
 * Collects file context for the agent.
 *
 * Two modes (controlled by vertexAgent.semanticContextEnabled):
 *   OFF (default): random sample of up to maxFiles source files (legacy behaviour).
 *   ON:            SemanticIndex BM25 ranking — returns the top-K files most
 *                  relevant to the current query instead of a random selection.
 *
 * Copyright (c) VertexLabs – Zafer Kılıçaslan
 */

import * as vscode from "vscode";
import { SemanticIndex } from "./semanticIndex";

export class ContextBuilder {
  /** SemanticIndex instance — created lazily when semanticContextEnabled=true. */
  private semanticIndex?: SemanticIndex;
  private indexBuilt = false;

  constructor(
    private maxFiles: number = 40,
    private maxCharsPerFile: number = 2000
  ) {}

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Collect workspace context.
   *
   * @param query  Optional free-form query used for BM25 ranking when the
   *               semantic index is enabled. Ignored in random-sample mode.
   */
  public async collect(query?: string): Promise<string> {
    const config = vscode.workspace.getConfiguration("vertexAgent");
    const semanticEnabled = config.get<boolean>("semanticContextEnabled", false);

    if (semanticEnabled && query) {
      return this.collectSemantic(query);
    }
    return this.collectRandom();
  }

  /**
   * Attach a SemanticIndex instance (called from extension.ts during activation).
   * If not set, ContextBuilder creates its own lazily on the first semantic call.
   */
  public setSemanticIndex(index: SemanticIndex): void {
    this.semanticIndex = index;
    this.indexBuilt = false; // will be built on first use
  }

  // ─── Private: random sample (legacy) ──────────────────────────────────────

  private async collectRandom(): Promise<string> {
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

  // ─── Private: BM25 semantic ranking ────────────────────────────────────────

  private async collectSemantic(query: string): Promise<string> {
    // Ensure the index is built
    if (!this.semanticIndex) {
      this.semanticIndex = new SemanticIndex();
    }
    if (!this.indexBuilt || this.semanticIndex.size === 0) {
      await this.semanticIndex.indexWorkspace();
      this.indexBuilt = true;
    }

    const topFiles = this.semanticIndex.findRelevantFiles(query, this.maxFiles);

    const snippets: string[] = [];
    for (const match of topFiles) {
      try {
        // Resolve absolute path from workspace root
        const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
        if (workspaceFolders.length === 0) break;
        const abs = vscode.Uri.joinPath(workspaceFolders[0].uri, match.path);
        const doc = await vscode.workspace.openTextDocument(abs);
        const text = doc.getText().slice(0, this.maxCharsPerFile);
        snippets.push(`// FILE: ${match.path} (relevance: ${match.score.toFixed(2)})\n${text}`);
      } catch { /* skip unreadable */ }
    }

    return snippets.join("\n\n");
  }
}
