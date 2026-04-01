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
  /**
   * Determines whether newContent is a unified-diff (contains +/- line markers)
   * rather than a full file replacement.
   */
  private isDiffContent(content: string): boolean {
    const lines = content.split("\n");
    let hasAdded = false;
    let hasRemoved = false;
    let hasContext = false;
    const contextLines: string[] = [];
    const minusContents: string[] = [];

    for (const line of lines) {
      if (line.startsWith("+") && !line.startsWith("+++")) { hasAdded = true; }
      else if (line.startsWith("-") && !line.startsWith("---")) {
        hasRemoved = true;
        minusContents.push(line.slice(2).trim()); // content after "- "
      }
      else if (line.trim().length > 0) {
        hasContext = true;
        contextLines.push(line.trim());
      }
    }

    if (!hasRemoved && !hasAdded) {
      return false;
    }

    // If we have both + and - lines, it's definitely a diff
    if (hasAdded && hasRemoved) {
      return true;
    }

    // Only minus lines (no plus): check if minus content matches any context line.
    // If so, it's a real diff (removing an existing line). Otherwise it's a markdown list.
    if (hasRemoved && !hasAdded && hasContext) {
      const hasMatchingContext = minusContents.some(
        mc => contextLines.some(cl => cl === mc)
      );
      if (hasMatchingContext) {
        return true; // Real diff: "- line" matches a context line
      }
      // No match → likely markdown list items, not a diff
      return false;
    }

    return (hasAdded || hasRemoved) && hasContext;
  }

  /**
   * Applies a diff patch non-destructively to the original file content.
   * Lines prefixed with '-' are removed, '+' are added, unprefixed lines are kept.
   * The original file is treated as the source of truth.
   */
  private applyDiffPatch(original: string, diffContent: string): string {
    const originalLines = original.split("\n");
    const diffLines = diffContent.split("\n");
    const result: string[] = [];

    // Build lookup: extract context and removal lines from the diff to find the
    // region in the original file that corresponds to this patch.
    const patchContext: string[] = [];
    const patchOps: Array<{ op: "keep" | "add" | "remove"; text: string }> = [];

    // Build a set of original lines for quick lookup
    const originalLineSet = new Set(originalLines.map(l => l.trim()));

    for (const dLine of diffLines) {
      if (dLine.startsWith("+") && !dLine.startsWith("+++")) {
        // Strip "+ " (with space) or "+" (without space)
        const addText = dLine.startsWith("+ ") ? dLine.slice(2) : dLine.slice(1);
        patchOps.push({ op: "add", text: addText });
      } else if (dLine.startsWith("-") && !dLine.startsWith("---")) {
        // Strip "- " (with space) or "-" (without space)
        const rmText = dLine.startsWith("- ") ? dLine.slice(2) : dLine.slice(1);
        patchOps.push({ op: "remove", text: rmText });
        patchContext.push(rmText);
      } else {
        // Context line — check if it exists in the original file
        const text = dLine.startsWith(" ") ? dLine.slice(1) : dLine;
        if (text.trim().length > 0 && !originalLineSet.has(text.trim())) {
          // Line doesn't exist in original → LLM forgot the "+" prefix → treat as addition
          patchOps.push({ op: "add", text });
        } else {
          patchOps.push({ op: "keep", text });
          patchContext.push(text);
        }
      }
    }

    // Find where the context block starts in the original file
    let matchStart = -1;
    if (patchContext.length > 0) {
      const firstCtx = patchContext[0].trim();
      for (let i = 0; i <= originalLines.length - patchContext.length; i++) {
        if (originalLines[i].trim() === firstCtx) {
          let allMatch = true;
          let origIdx = i;
          for (let c = 0; c < patchContext.length; c++) {
            if (origIdx >= originalLines.length || originalLines[origIdx].trim() !== patchContext[c].trim()) {
              allMatch = false;
              break;
            }
            origIdx++;
          }
          if (allMatch) {
            matchStart = i;
            break;
          }
        }
      }
    }

    if (matchStart === -1) {
      // Fallback: could not locate the patch region.
      // Apply line-by-line: keep all original lines except those marked for removal.
      const removeSet = new Set<string>();
      const addAfter: Map<string, string[]> = new Map();
      let lastContext = "";

      for (const op of patchOps) {
        if (op.op === "remove") {
          removeSet.add(op.text.trim());
        } else if (op.op === "keep") {
          lastContext = op.text.trim();
        } else if (op.op === "add") {
          const adds = addAfter.get(lastContext) || [];
          adds.push(op.text);
          addAfter.set(lastContext, adds);
        }
      }

      for (const origLine of originalLines) {
        if (removeSet.has(origLine.trim())) {
          removeSet.delete(origLine.trim()); // Only remove first occurrence
          continue;
        }
        result.push(origLine);
        const adds = addAfter.get(origLine.trim());
        if (adds && adds.length > 0) {
          result.push(...adds);
          addAfter.delete(origLine.trim());
        }
      }

      // Append any remaining adds (e.g., additions at the start)
      for (const adds of addAfter.values()) {
        result.push(...adds);
      }

      return result.join("\n");
    }

    // Apply patch at the matched region
    // Copy lines before the match
    for (let i = 0; i < matchStart; i++) {
      result.push(originalLines[i]);
    }

    // Apply diff ops
    let origIdx = matchStart;
    for (const op of patchOps) {
      if (op.op === "keep") {
        result.push(originalLines[origIdx]);
        origIdx++;
      } else if (op.op === "remove") {
        origIdx++; // Skip this line from original
      } else if (op.op === "add") {
        result.push(op.text);
      }
    }

    // Copy remaining lines after the patched region
    for (let i = origIdx; i < originalLines.length; i++) {
      result.push(originalLines[i]);
    }

    return result.join("\n");
  }

  async applyFileEdits(edits: AgentEdit[]): Promise<void> {
    if (!edits || edits.length === 0) return;

    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) {
      throw new Error("Kein Workspace geöffnet. Dateiänderungen nicht möglich.");
    }

    const root = workspace.uri.fsPath;

    // Deduplicate: if same file has identical content edits, keep only one.
    // If same file has DIFFERENT edits, apply them sequentially (all kept).
    const seen = new Set<string>();
    const deduped: AgentEdit[] = [];
    for (const edit of edits) {
      const key = `${edit.filePath}::${edit.newContent}`;
      if (seen.has(key)) {
        console.log('[FileEditEngine] Skipping duplicate edit for:', edit.filePath);
        continue;
      }
      seen.add(key);
      deduped.push(edit);
    }

    for (const edit of deduped) {
      const relative = edit.filePath.replace(/^[/\\]+/, "");
      const fullPath = path.join(root, relative);

      console.log('[FileEditEngine] Processing edit for:', fullPath);

      // Check if this is a DELETE operation
      if (edit.newContent.trim() === 'DELETE' || edit.newContent.trim() === '<<DELETE>>') {
        console.log('[FileEditEngine] Deleting:', fullPath);

        const docUri = vscode.Uri.file(fullPath);

        try {
          const stats = await fs.promises.stat(fullPath);

          if (stats.isDirectory()) {
            console.log('[FileEditEngine] Deleting directory:', fullPath);
            const wsEdit = new vscode.WorkspaceEdit();
            wsEdit.deleteFile(docUri, { recursive: true, ignoreIfNotExists: true });
            await vscode.workspace.applyEdit(wsEdit);
            console.log('[FileEditEngine] Directory deleted:', fullPath);
          } else {
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

      // Resolve final content: apply as diff patch if content is diff-formatted
      // and the file already exists; otherwise use as full replacement.
      let finalContent = edit.newContent;

      // Check if content has ONLY "+" lines (new file creation by LLM)
      const contentLines = edit.newContent.split("\n");
      const nonEmptyContent = contentLines.filter(l => l.trim().length > 0);
      const allPlusLines = nonEmptyContent.length > 0 && nonEmptyContent.every(
        l => l.startsWith("+") && !l.startsWith("+++")
      );

      if (allPlusLines) {
        // Pure addition block: strip "+" markers for file creation
        finalContent = contentLines.map(l => {
          if (l.startsWith("+ ")) { return l.slice(2); }
          if (l.startsWith("+")) { return l.slice(1); }
          return l;
        }).join("\n");
        console.log('[FileEditEngine] Stripped + markers for new file:', fullPath);
      } else if (this.isDiffContent(edit.newContent)) {
        let existingContent: string | null = null;
        try {
          if (openDoc) {
            existingContent = openDoc.getText();
          } else {
            existingContent = await fs.promises.readFile(fullPath, "utf8");
          }
        } catch {
          // File does not exist yet — treat diff as full content (strip markers)
          existingContent = null;
        }

        if (existingContent !== null) {
          console.log('[FileEditEngine] Applying diff patch to:', fullPath);
          finalContent = this.applyDiffPatch(existingContent, edit.newContent);
        } else {
          // New file: extract only added lines as initial content
          const addedLines = edit.newContent.split("\n")
            .filter(l => l.startsWith("+") && !l.startsWith("+++"))
            .map(l => l.startsWith("+ ") ? l.slice(2) : l.slice(1));
          finalContent = addedLines.join("\n");
        }
      }

      if (openDoc) {
        console.log('[FileEditEngine] File is open, updating in editor:', fullPath);
        const wsEdit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
          openDoc.positionAt(0),
          openDoc.positionAt(openDoc.getText().length)
        );
        wsEdit.replace(docUri, fullRange, finalContent);
        const success = await vscode.workspace.applyEdit(wsEdit);

        if (success) {
          await openDoc.save();
          console.log('[FileEditEngine] File updated and saved:', fullPath);
        } else {
          console.error('[FileEditEngine] Failed to apply edit to open document:', fullPath);
        }
      } else {
        console.log('[FileEditEngine] File is not open, writing to disk:', fullPath);
        await fs.promises.writeFile(fullPath, finalContent, "utf8");
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
