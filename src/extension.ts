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
import { SettingsPanel } from "./ui/settingsPanel";

export function activate(context: vscode.ExtensionContext): void {
  const ai = new AiClient();
  const memory = new MemoryEngine();
  const contextBuilder = new ContextBuilder();
  const errorAnalyzer = new ErrorAnalyzer();
  const fileEdits = new FileEditEngine();
  
  const loop = new LoopEngine(
    ai,
    memory,
    contextBuilder,
    errorAnalyzer,
    fileEdits
  );

  const openChat = vscode.commands.registerCommand(
    "vertexAgent.openChat",
    () => {
      ChatPanel.createOrShow(context);
    }
  );

  const openSettings = vscode.commands.registerCommand(
    "vertexAgent.openSettings",
    () => {
      SettingsPanel.createOrShow(context);
    }
  );

  context.subscriptions.push(openChat, openSettings);
}

export function deactivate(): void {}