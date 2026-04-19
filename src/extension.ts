/**
 * VertexAgent – VS Code Extension Entry Point
 *
 * Registers the VertexAgent chat panel and initialises the agent stack.
 * Phase 3: optionally initialises the SemanticIndex when
 * vertexAgent.semanticContextEnabled is true.
 *
 * Copyright (c) VertexLabs – Zafer Kılıçaslan
 */

import * as vscode from "vscode";
import { AiClient } from "./ai/aiClient";
import { MemoryEngine } from "./agent/memoryEngine";
import { ContextBuilder } from "./agent/contextBuilder";
import { ErrorAnalyzer } from "./agent/errorAnalyzer";
import { FileEditEngine } from "./fs/fileEditEngine";
import { LoopEngine } from "./agent/loopEngine";
import { ChatPanel } from "./ui/chatPanel";
import { SemanticIndex } from "./agent/semanticIndex";

export function activate(context: vscode.ExtensionContext): void {
  const ai = new AiClient();
  const memory = new MemoryEngine();
  const contextBuilder = new ContextBuilder();
  const errorAnalyzer = new ErrorAnalyzer();
  const fileEdits = new FileEditEngine();

  // Keep stack initialized for future loop-driven flows.
  new LoopEngine(ai, memory, contextBuilder, errorAnalyzer, fileEdits);

  // ── Phase 3: Semantic Context Index (opt-in) ─────────────────────────────
  // Build the BM25 index in the background when the setting is enabled.
  // The index listener keeps it fresh on every file save.
  const config = vscode.workspace.getConfiguration("vertexAgent");
  if (config.get<boolean>("semanticContextEnabled", false)) {
    const semanticIndex = new SemanticIndex();
    contextBuilder.setSemanticIndex(semanticIndex);

    // Background indexing — don't block activation
    semanticIndex.indexWorkspace().catch(e => {
      console.warn("[VertexAgent] SemanticIndex initial build failed:", e?.message);
    });

    // Keep index fresh on file saves
    const changeListener = semanticIndex.registerChangeListener();
    context.subscriptions.push(changeListener);
  }

  const openChat = vscode.commands.registerCommand("vertexAgent.openChat", async () => {
    await ChatPanel.createOrShow(context);
  });

  const openSettings = vscode.commands.registerCommand(
    "vertexAgent.openSettings",
    async () => {
      await ChatPanel.openSettingsInChat(context);
    }
  );

  context.subscriptions.push(openChat, openSettings);
}

export function deactivate(): void {}
