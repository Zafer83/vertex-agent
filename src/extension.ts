/**
 * VertexAgent – VS Code Extension Entry Point
 * Registriert den VertexAgent-Chat und initialisiert den Agenten-Stack.
 * Copyright (c) VertexLabs – Zafer Kılıçaslan
 * www.vertexlabs.de
 */

import * as vscode from "vscode";
import { AiClient } from "./ai/aiClient";
import { MemoryEngine } from "./agent/memoryEngine";
import { ContextBuilder } from "./agent/contextBuilder";
import { ErrorAnalyzer } from "./agent/errorAnalyzer";
import { FileEditEngine } from "./fs/fileEditEngine";
import { LoopEngine } from "./agent/loopEngine";
import { ChatPanel } from "./ui/chatPanel";

export function activate(context: vscode.ExtensionContext): void {
  const ai = new AiClient();
  const memory = new MemoryEngine();
  const contextBuilder = new ContextBuilder();
  const errorAnalyzer = new ErrorAnalyzer();
  const fileEdits = new FileEditEngine();

  // Keep stack initialized for future loop-driven flows.
  new LoopEngine(ai, memory, contextBuilder, errorAnalyzer, fileEdits);

  const openChat = vscode.commands.registerCommand("vertexAgent.openChat", async () => {
    await ChatPanel.createOrShow(context);
  });

  const openSettings = vscode.commands.registerCommand("vertexAgent.openSettings", async () => {
    await ChatPanel.openSettingsInChat(context);
  });

  context.subscriptions.push(openChat, openSettings);
}

export function deactivate(): void {}
