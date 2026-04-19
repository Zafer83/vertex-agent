/**
 * VertexAgent – SemanticIndex
 *
 * Lightweight workspace file ranker based on BM25 (Okapi BM25).
 * Pure JavaScript — no native modules, no SQLite, no external API calls.
 *
 * Replaces the random 40-file sampling in ContextBuilder with a ranked
 * "top-K most relevant files for this query" approach.
 *
 * Architecture
 * ─────────────
 * - Tokenise each file (alphanumeric words ≥ 2 chars, lowercased, split on camelCase)
 * - Build an inverted index: token → set of document IDs
 * - On query: BM25 score each document against the query tokens, return top-K
 * - Incremental updates: re-index a file on save (onFileChanged)
 *
 * BM25 parameters: k1 = 1.5, b = 0.75 (standard defaults)
 *
 * Copyright (c) VertexLabs – Zafer Kılıçaslan
 */

import * as vscode from "vscode";
import * as path from "path";

// ─── BM25 constants ───────────────────────────────────────────────────────────

const K1 = 1.5;
const B = 0.75;

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocumentEntry {
  /** Absolute path. */
  filePath: string;
  /** Relative path (for display). */
  relativePath: string;
  /** Term frequency map: token → count. */
  tf: Map<string, number>;
  /** Total token count in the document. */
  length: number;
  /** First 300 chars of the file (used as preview in context). */
  preview: string;
}

export interface FileMatch {
  /** Relative path from workspace root. */
  path: string;
  /** BM25 relevance score. */
  score: number;
  /** Short preview of the file content. */
  preview: string;
}

// ─── Tokeniser ────────────────────────────────────────────────────────────────

/**
 * Split text into indexable tokens.
 * - Lowercases everything
 * - Splits camelCase/PascalCase into parts ("getUserById" → ["get","user","by","id"])
 * - Keeps alphanumeric tokens ≥ 2 chars
 * - Ignores common noise words (the, is, at, …)
 */
const STOP_WORDS = new Set([
  "the", "is", "at", "in", "on", "to", "a", "an", "and", "or", "of", "for",
  "it", "be", "as", "by", "we", "if", "so", "up", "do", "go",
]);

export function tokenize(text: string): string[] {
  // Split camelCase/PascalCase
  const withSpaces = text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");

  return withSpaces
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 2 && !STOP_WORDS.has(t));
}

// ─── SemanticIndex ────────────────────────────────────────────────────────────

export class SemanticIndex {
  /** document ID → DocumentEntry */
  private docs: Map<string, DocumentEntry> = new Map();
  /** token → set of document IDs that contain it */
  private invertedIndex: Map<string, Set<string>> = new Map();
  /** Total token count across all documents (for avgDocLength). */
  private totalTokens = 0;

  private vscodeChangeListener?: vscode.Disposable;

  // ─── Public API ────────────────────────────────────────────────────────────

  /** Index all source files in the current VS Code workspace. */
  async indexWorkspace(): Promise<void> {
    const files = await vscode.workspace.findFiles(
      "**/*.{ts,tsx,js,jsx,py,go,rs,java,kt,cs,rb,php,swift,md,json,yaml,yml}",
      "{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/build/**}",
      500
    );

    this.docs.clear();
    this.invertedIndex.clear();
    this.totalTokens = 0;

    for (const uri of files) {
      await this.indexFile(uri);
    }

    console.log(
      `[SemanticIndex] Indexed ${this.docs.size} files (${this.totalTokens} total tokens).`
    );
  }

  /**
   * Find the top-K files most relevant to a natural-language query.
   * @param query  Free-form text (e.g. user's chat message).
   * @param topK   Number of results to return. Default: 10.
   */
  findRelevantFiles(query: string, topK = 10): FileMatch[] {
    if (this.docs.size === 0) return [];

    const queryTokens = [...new Set(tokenize(query))];
    if (queryTokens.length === 0) return [];

    const avgLen = this.totalTokens / this.docs.size;
    const scores = new Map<string, number>();

    for (const qToken of queryTokens) {
      const df = this.invertedIndex.get(qToken)?.size ?? 0;
      if (df === 0) continue;

      // IDF (with smoothing to avoid log(0))
      const idf = Math.log((this.docs.size - df + 0.5) / (df + 0.5) + 1);

      for (const docId of this.invertedIndex.get(qToken)!) {
        const doc = this.docs.get(docId)!;
        const tf = doc.tf.get(qToken) ?? 0;

        // BM25 term score
        const tfNorm = (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (doc.length / avgLen)));
        const termScore = idf * tfNorm;

        scores.set(docId, (scores.get(docId) ?? 0) + termScore);
      }
    }

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([docId, score]) => {
        const doc = this.docs.get(docId)!;
        return { path: doc.relativePath, score, preview: doc.preview };
      });
  }

  /** Re-index a single file after it changes on disk. */
  async onFileChanged(uri: vscode.Uri): Promise<void> {
    // Remove old entry
    const docId = uri.fsPath;
    const old = this.docs.get(docId);
    if (old) {
      this.totalTokens -= old.length;
      for (const [token] of old.tf) {
        const set = this.invertedIndex.get(token);
        if (set) {
          set.delete(docId);
          if (set.size === 0) this.invertedIndex.delete(token);
        }
      }
      this.docs.delete(docId);
    }

    // Re-index
    await this.indexFile(uri);
  }

  /**
   * Register a VS Code file-save listener so the index stays fresh.
   * Call dispose() on the returned Disposable when the extension deactivates.
   */
  registerChangeListener(): vscode.Disposable {
    this.vscodeChangeListener = vscode.workspace.onDidSaveTextDocument(doc => {
      this.onFileChanged(doc.uri).catch(e => {
        console.warn("[SemanticIndex] onFileChanged error:", e?.message);
      });
    });
    return this.vscodeChangeListener;
  }

  /** Number of indexed documents. */
  get size(): number {
    return this.docs.size;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /** Index a single file URI. Silently skips unreadable files. */
  async indexFile(uri: vscode.Uri): Promise<void> {
    let text: string;
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      text = doc.getText();
    } catch {
      return; // Binary or unreadable — skip
    }

    const tokens = tokenize(text);
    if (tokens.length === 0) return;

    const tf = new Map<string, number>();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) ?? 0) + 1);
    }

    const relativePath = vscode.workspace.asRelativePath(uri);
    const docId = uri.fsPath;

    const entry: DocumentEntry = {
      filePath: docId,
      relativePath,
      tf,
      length: tokens.length,
      preview: text.slice(0, 300).replace(/\s+/g, " ").trim(),
    };

    this.docs.set(docId, entry);
    this.totalTokens += tokens.length;

    for (const token of tf.keys()) {
      if (!this.invertedIndex.has(token)) {
        this.invertedIndex.set(token, new Set());
      }
      this.invertedIndex.get(token)!.add(docId);
    }
  }
}
