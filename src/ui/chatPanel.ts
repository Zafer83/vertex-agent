/**
 * VertexAgent – ChatPanel
 * Webview-UI für den VertexAgent mit Modi Chat/Fix/Refactor und minimalistischem Branding.
 * Copyright (c) VertexLabs – Zafer Kılıçaslan
 * www.vertexlabs.de
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { sendChatRequest } from "../ai/aiClient";
import { applyFileEdits, applySafeBashFsCommandsFromText } from "../fs/fileEditEngine";
import { fetchAvailableModel } from "../ai/modelFetcher";

interface ChatAttachment {
  filePath: string;
  content: string;
  truncated?: boolean;
}

export class ChatPanel {
  private static currentPanel: ChatPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionContext: vscode.ExtensionContext;

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this.panel = panel;
    this.extensionContext = context;

    this.panel.webview.html = this.getHtmlForWebview(this.panel.webview, context);

    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("vertexAgent.provider") || e.affectsConfiguration("vertexAgent.model")) {
        this.sendProviderInfo();
      }
    });

    this.panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case "chat":
          {
            const text: string = message.text ?? "";
            const attachments: ChatAttachment[] = Array.isArray(message.attachments) ? message.attachments : [];
            
            if (!text.trim() && (!attachments || attachments.length === 0)) {
              console.log('[ChatPanel] Empty message, ignoring');
              this.panel.webview.postMessage({ type: "removeStatus" });
              this.panel.webview.postMessage({
                type: "error",
                text: "Bitte gib eine Nachricht ein.",
              });
              return;
            }

            try {
              console.log('[ChatPanel] Starting chat request:', text);
              this.panel.webview.postMessage({ type: "status", text: "Sammle Kontext..." });

              const prompt = this.buildPromptWithAttachments(text, attachments);
              console.log('[ChatPanel] Sending request to AI...');
              const response = await sendChatRequest(prompt);
              console.log('[ChatPanel] Received response:', response);

              this.panel.webview.postMessage({ type: "status", text: "Verarbeite Antwort..." });

              this.panel.webview.postMessage({
                type: "response",
                text: response.message,
              });

              if (response.usage) {
                this.panel.webview.postMessage({
                  type: "tokenUsage",
                  usage: response.usage,
                });
              }

              if (response.edits && Array.isArray(response.edits)) {
                console.log('[ChatPanel] Applying edits:', response.edits.length);
                this.panel.webview.postMessage({ type: "status", text: `Schreibe ${response.edits.length} Datei(en)...` });
                await applyFileEdits(response.edits);
                this.panel.webview.postMessage({ type: "removeStatus" });
              }

              if ((!response.edits || response.edits.length === 0) && response.message) {
                console.log('[ChatPanel] Checking for bash commands...');
                const bashResult = await applySafeBashFsCommandsFromText(response.message);
                console.log('[ChatPanel] Bash result:', bashResult);
                if (bashResult.dirs > 0 || bashResult.files > 0) {
                  this.panel.webview.postMessage({ type: "removeStatus" });
                  this.panel.webview.postMessage({
                    type: "response",
                    text: `Ausgeführt: ${bashResult.dirs} Ordner, ${bashResult.files} Datei(en) aus Bash-Befehlen erstellt.`,
                  });
                }
              }

              if (response.memoryNotes && Array.isArray(response.memoryNotes) && response.memoryNotes.length > 0) {
                console.log('[ChatPanel] Saving memoryNotes:', response.memoryNotes);
                const { MemoryEngine } = await import("../agent/memoryEngine");
                const memory = new MemoryEngine();
                memory.append(response.memoryNotes);
              }

              console.log('[ChatPanel] Chat request completed successfully');
              
              // Ensure status is removed and button is re-enabled
              this.panel.webview.postMessage({ type: "removeStatus" });
              this.panel.webview.postMessage({ type: "enableSendButton" });
            } catch (err: any) {
              console.error('[ChatPanel] Error during chat request:', err);
              this.panel.webview.postMessage({ type: "removeStatus" });
              this.panel.webview.postMessage({
                type: "error",
                text: `Fehler: ${err?.message ?? String(err)}`,
              });
            }
          }
          break;
        case "pickAttachments":
          {
            const selected = await this.pickAttachments();
            this.panel.webview.postMessage({
              type: "attachmentsSelected",
              attachments: selected,
            });
          }
          break;
        case "openFile":
          {
            const filePath = message.filePath;
            if (filePath) {
              const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              if (workspaceRoot) {
                const fullPath = vscode.Uri.file(`${workspaceRoot}/${filePath}`);
                vscode.window.showTextDocument(fullPath);
              }
            }
          }
          break;
        case "openSettings":
          await this.sendSettingsToWebview();
          break;
        case "saveSettings":
          try {
            await this.saveSettingsFromWebview(message);
            this.panel.webview.postMessage({ type: "settingsSaved" });
            await this.sendProviderInfo();
          } catch (err: any) {
            this.panel.webview.postMessage({
              type: "error",
              text: `Einstellungen konnten nicht gespeichert werden: ${err?.message ?? String(err)}`,
            });
          }
          break;
        case "getProviderInfo":
          this.sendProviderInfo();
          break;
      }
    });
  }

  private async sendProviderInfo() {
    const config = vscode.workspace.getConfiguration("vertexAgent");
    const provider = config.get<string>("provider", "openai");
    
    // Fetch actual model from provider
    const model = await fetchAvailableModel();
    
    this.panel.webview.postMessage({
      type: "providerInfo",
      provider: provider,
      model: model || ""
    });
  }

  private async sendSettingsToWebview() {
    const config = vscode.workspace.getConfiguration("vertexAgent");
    this.panel.webview.postMessage({
      type: "settingsData",
      settings: {
        provider: config.get<string>("provider", "openai"),
        serverUrl: config.get<string>("serverUrl", "http://localhost"),
        serverPort: config.get<number>("serverPort", 8080),
        apiKey: config.get<string>("apiKey", ""),
        useAccessToken: config.get<boolean>("useAccessToken", false),
        accessToken: config.get<string>("accessToken", ""),
      },
    });
  }

  private async saveSettingsFromWebview(message: any) {
    const config = vscode.workspace.getConfiguration("vertexAgent");
    const target = vscode.workspace.workspaceFolders?.length
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;

    await config.update("provider", message.provider, target);
    await config.update("serverUrl", message.serverUrl, target);
    await config.update("serverPort", parseInt(message.serverPort, 10), target);
    await config.update("apiKey", message.apiKey, target);
    await config.update("useAccessToken", !!message.useAccessToken, target);
    await config.update("accessToken", message.accessToken, target);
  }

  private buildPromptWithAttachments(text: string, attachments: ChatAttachment[]): string {
    if (!attachments || attachments.length === 0) return text;

    const lines: string[] = [
      text,
      "",
      "### ATTACHED FILES (CONTEXT)",
      "Use these files as additional context for your answer.",
    ];

    for (const attachment of attachments) {
      lines.push("");
      lines.push(`--- FILE: ${attachment.filePath}${attachment.truncated ? " (truncated)" : ""} ---`);
      lines.push("```");
      lines.push(attachment.content);
      lines.push("```");
    }

    return lines.join("\n");
  }

  private async pickAttachments(): Promise<ChatAttachment[]> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      openLabel: "Anhängen",
      defaultUri: workspaceRoot ? vscode.Uri.file(workspaceRoot) : undefined,
    });

    if (!uris || uris.length === 0) return [];

    const maxFiles = 5;
    const maxCharsPerFile = 12000;
    const picked = uris.slice(0, maxFiles);
    const attachments: ChatAttachment[] = [];

    for (const uri of picked) {
      try {
        const fullPath = uri.fsPath;
        const raw = fs.readFileSync(fullPath, "utf8");
        const truncated = raw.length > maxCharsPerFile;
        const content = truncated ? raw.slice(0, maxCharsPerFile) : raw;
        const relPath = workspaceRoot ? path.relative(workspaceRoot, fullPath) : path.basename(fullPath);

        attachments.push({
          filePath: relPath || path.basename(fullPath),
          content,
          truncated,
        });
      } catch (err) {
        console.warn("[VertexAgent] Failed to read attachment:", uri.fsPath, err);
      }
    }

    return attachments;
  }

  public static async createOrShow(context: vscode.ExtensionContext) {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (ChatPanel.currentPanel) {
      ChatPanel.currentPanel.panel.reveal(column);
      await ChatPanel.tryDockToRight();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "vertexAgentChat",
      "VertexAgent",
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    ChatPanel.currentPanel = new ChatPanel(panel, context);
    await ChatPanel.tryDockToRight();

    panel.onDidDispose(() => {
      ChatPanel.currentPanel = undefined;
    });
  }

  public static async openSettingsInChat(context: vscode.ExtensionContext) {
    await ChatPanel.createOrShow(context);
    if (ChatPanel.currentPanel) {
      await ChatPanel.currentPanel.sendSettingsToWebview();
    }
  }

  private static async tryDockToRight(): Promise<void> {
    // Best-effort: move chat webview into the right secondary sidebar/editor area.
    // Different VS Code versions may expose different command ids.
    const candidates = [
      "workbench.action.moveEditorToSecondarySideBar",
      "workbench.action.moveEditorToSecondSideBar",
    ];

    for (const cmd of candidates) {
      try {
        await vscode.commands.executeCommand(cmd);
        return;
      } catch {
        // Try next command id.
      }
    }
  }

  private getHtmlForWebview(webview: vscode.Webview, context: vscode.ExtensionContext): string {
    const iconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, "media", "icon.svg")
    );

    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src 'unsafe-inline' ${
      webview.cspSource
    }; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VertexAgent</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #050509;
      --border-subtle: #262636;
      --accent: #f43a35;
      --text: #f5f5f7;
      --text-muted: #808090;
      --input-bg: #0d0d12;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-bottom: 1px solid var(--border-subtle);
    }
    .logo { width: 22px; height: 22px; }
    .title-block { display: flex; flex-direction: column; }
    .title { font-size: 13px; font-weight: 600; letter-spacing: 0.02em; }
    .subtitle { font-size: 10px; color: var(--text-muted); }

    .container {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 12px;
      gap: 12px;
      overflow: hidden;
    }
    .messages {
      flex: 1;
      overflow-y: auto;
      font-size: 13px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .message { line-height: 1.5; }
    .message.user {
      padding: 8px 12px;
      background: rgba(255,255,255,0.04);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      align-self: flex-end;
      max-width: 90%;
    }
    .message.agent { border-left: 2px solid var(--accent); padding-left: 12px; }
    .message.agent h3 { font-size: 13px; font-weight: 600; margin: 8px 0 4px 0; }
    .message.agent ul, .message.agent ol { margin: 6px 0; padding-left: 20px; }
    .message.agent li { margin: 2px 0; }
    .message.agent code.inline-code { 
      background: rgba(255,255,255,0.1); 
      padding: 2px 6px; 
      border-radius: 4px; 
      font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace; 
      font-size: 11px;
      color: #e8912d;
    }
    .message.agent strong { font-weight: 600; }
    .message.agent em { font-style: italic; }
    .message.agent p { margin: 6px 0; }
    
    /* Code Block Container */
    .message.agent .code-block {
      margin: 10px 0;
      border-radius: 6px;
      overflow: hidden;
      background: #1a1a1a;
      border: 1px solid var(--border-subtle);
    }
    .message.agent .code-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 12px;
      background: rgba(255,255,255,0.03);
      border-bottom: 1px solid var(--border-subtle);
      font-size: 11px;
    }
    .message.agent .code-lang {
      color: var(--text-muted);
      font-family: 'SF Mono', Monaco, monospace;
      text-transform: uppercase;
      font-weight: 500;
    }
    .message.agent .code-file {
      color: var(--text);
      font-family: 'SF Mono', Monaco, monospace;
      font-weight: 400;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .message.agent .code-stats {
      display: flex;
      gap: 6px;
      font-size: 10px;
      font-weight: 500;
    }
    .message.agent .code-stats .added {
      color: #3fb950;
    }
    .message.agent .code-stats .removed {
      color: #f85149;
    }
    .message.agent .code-content {
      font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
      font-size: 12px;
      line-height: 1.6;
      background: #1a1a1a;
    }
    .message.agent .code-line {
      padding: 2px 12px;
      white-space: pre;
      overflow-x: auto;
    }
    .message.agent .code-line.diff-added {
      background: rgba(63, 185, 80, 0.15);
      color: #3fb950;
    }
    .message.agent .code-line.diff-removed {
      background: rgba(248, 81, 73, 0.15);
      color: #f85149;
    }
    .message.agent .code-line.collapsed-line {
      display: none;
    }
    .message.agent .code-block.expanded .collapsed-line {
      display: block;
    }
    .message.agent .collapse-toggle {
      padding: 8px 12px;
      text-align: center;
      color: var(--accent);
      cursor: pointer;
      font-size: 11px;
      border-top: 1px solid var(--border-subtle);
      background: rgba(255,255,255,0.02);
    }
    .message.agent .collapse-toggle:hover {
      background: rgba(255,255,255,0.05);
    }
    .message.agent .code-block.expanded .collapse-toggle {
      display: none;
    }
    .message.system { font-size: 11px; color: var(--text-muted); text-align: center; background: transparent; border: none; padding: 0; }
    
    /* Command Block (Bash/Terminal) */
    .message.agent .command-block {
      margin: 10px 0;
      border-radius: 6px;
      overflow: hidden;
      background: #0d0d12;
      border: 1px solid #2a2a3a;
    }
    .message.agent .command-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background: rgba(255,255,255,0.02);
      border-bottom: 1px solid #2a2a3a;
      font-size: 11px;
    }
    .message.agent .command-icon {
      color: #3fb950;
      font-weight: 600;
    }
    .message.agent .command-label {
      color: var(--text-muted);
      font-family: 'SF Mono', Monaco, monospace;
      text-transform: uppercase;
      font-weight: 500;
    }
    .message.agent .command-content {
      padding: 12px;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
      font-size: 12px;
      line-height: 1.6;
      color: #3fb950;
      background: #0d0d12;
    }
    .message.status {
      font-size: 11px;
      color: var(--text-muted);
      font-style: italic;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 0;
    }
    .status-spinner {
      width: 10px;
      height: 10px;
      border: 2px solid var(--border-subtle);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    /* Minimalist Input Container */
    .input-container {
      display: flex;
      flex-direction: column;
      background: var(--input-bg);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      margin-top: 4px;
      transition: border-color 0.2s;
    }
    .input-container:focus-within { border-color: #444; }
    .input-wrapper { padding: 10px 12px 2px 12px; }
    .input {
      width: 100%;
      background: transparent;
      border: none;
      color: var(--text);
      font-size: 13px;
      resize: none;
      outline: none;
      line-height: 1.5;
      min-height: 24px;
      padding: 0;
    }
    input[type="text"],
    input[type="number"],
    input[type="password"],
    select {
      width: 100%;
      padding: 8px 10px;
      background: #12121a;
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      color: var(--text);
      font-size: 12px;
      outline: none;
    }
    input:focus, select:focus {
      border-color: #444;
    }
    .input-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 8px 8px 8px;
    }
    .attachments {
      display: none;
      flex-wrap: wrap;
      gap: 6px;
      padding: 6px 8px 0 8px;
    }
    .attachments.visible { display: flex; }
    .attachment-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--text-muted);
      background: rgba(255,255,255,0.05);
      border: 1px solid var(--border-subtle);
      border-radius: 999px;
      padding: 3px 8px;
      max-width: 100%;
    }
    .attachment-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 220px;
    }
    .attachment-remove {
      border: none;
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      padding: 0;
      font-size: 12px;
      line-height: 1;
    }
    .attachment-remove:hover { color: var(--text); }
    .input-actions { display: flex; gap: 4px; }
    .action-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 6px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      display: flex;
      align-items: center;
    }
    .action-btn:hover { background: rgba(255,255,255,0.06); color: var(--text); }
    
    .send-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: all 0.2s;
    }
    .send-btn:hover:not(:disabled) { background: rgba(255,255,255,0.1); color: var(--text); }
    .send-btn:disabled { opacity: 0.2; }

    .token-info { font-size: 10px; color: var(--text-muted); margin-left: auto; }
    
    /* Footer with Provider Info */
    .footer {
      padding: 6px 14px;
      border-top: 1px solid var(--border-subtle);
      font-size: 9px;
      color: var(--text-muted);
      text-align: center;
      opacity: 0.6;
    }
    .settings-overlay {
      position: absolute;
      inset: 0;
      background: rgba(5,5,9,0.94);
      z-index: 20;
      display: none;
      flex-direction: column;
      padding: 14px;
      overflow-y: auto;
    }
    .settings-overlay.visible { display: flex; }
    .settings-title {
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 10px;
    }
    .settings-group {
      margin-bottom: 12px;
    }
    .settings-label {
      display: block;
      font-size: 12px;
      color: var(--text);
      margin-bottom: 5px;
    }
    .settings-help {
      font-size: 10px;
      color: var(--text-muted);
      margin-top: 4px;
    }
    .settings-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 6px;
    }
    .settings-row label {
      font-size: 12px;
      color: var(--text-muted);
    }
    .settings-actions {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }
    .settings-btn {
      border: 1px solid var(--border-subtle);
      background: #161622;
      color: var(--text);
      border-radius: 6px;
      padding: 7px 10px;
      cursor: pointer;
      font-size: 12px;
    }
    .settings-btn.primary {
      border-color: #a13b38;
      background: #872d2a;
      color: #fff;
    }
    .settings-btn:hover { opacity: 0.95; }
    
    /* Code Blocks with Diff */
    .code-block { 
      margin: 10px 0; 
      border: 1px solid var(--border-subtle); 
      border-radius: 6px; 
      background: #0d0d12; 
      overflow: hidden; 
    }
    .code-header { 
      display: flex; 
      justify-content: space-between; 
      align-items: center;
      padding: 6px 10px; 
      background: rgba(255,255,255,0.03); 
      border-bottom: 1px solid var(--border-subtle);
      font-family: monospace; 
      font-size: 11px; 
      cursor: pointer;
    }
    .code-header:hover { background: rgba(255,255,255,0.05); }
    .code-filename { color: var(--text); font-weight: 500; }
    .code-stats { 
      display: flex; 
      gap: 8px; 
      font-size: 10px;
    }
    .code-stats .added { color: #3fb950; }
    .code-stats .removed { color: #f85149; }
    .code-content { 
      display: block;
      padding: 0;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
      font-size: 12px; 
      overflow-x: auto; 
      line-height: 1.5;
      max-height: 400px;
      overflow-y: auto;
    }
    .code-line {
      display: flex;
      padding: 0 10px;
      min-height: 20px;
    }
    .code-line.added {
      background: rgba(63, 185, 80, 0.15);
      border-left: 3px solid #3fb950;
    }
    .code-line.removed {
      background: rgba(248, 81, 73, 0.15);
      border-left: 3px solid #f85149;
    }
    .code-line.context {
      background: transparent;
    }
    .line-marker {
      display: inline-block;
      width: 20px;
      color: var(--text-muted);
      user-select: none;
      flex-shrink: 0;
    }
    .code-line.added .line-marker { color: #3fb950; }
    .code-line.removed .line-marker { color: #f85149; }
    .line-content {
      flex: 1;
      white-space: pre;
      color: var(--text);
    }
  </style>
</head>
<body>
  <div id="settingsOverlay" class="settings-overlay">
    <div class="settings-title">VertexAgent Einstellungen</div>
    <form id="settingsForm">
      <div class="settings-group">
        <label class="settings-label" for="settingsProvider">Provider</label>
        <select id="settingsProvider" required>
          <option value="openai">OpenAI-kompatibel (llama.cpp, Ollama, LiteLLM)</option>
          <option value="gemini">Google Gemini</option>
          <option value="claude">Anthropic Claude</option>
          <option value="ollama">Ollama (lokal)</option>
          <option value="custom">Custom API</option>
        </select>
      </div>
      <div class="settings-group">
        <label class="settings-label" for="settingsServerUrl">Server URL</label>
        <input id="settingsServerUrl" type="text" required />
      </div>
      <div class="settings-group">
        <label class="settings-label" for="settingsServerPort">Server Port</label>
        <input id="settingsServerPort" type="number" required />
      </div>
      <div class="settings-group" id="settingsApiKeyGroup">
        <label class="settings-label" for="settingsApiKey">API Key</label>
        <input id="settingsApiKey" type="password" />
      </div>
      <div class="settings-group" id="settingsAccessTokenGroup">
        <label class="settings-label" for="settingsAccessToken">Access Token</label>
        <input id="settingsAccessToken" type="password" />
        <div class="settings-row">
          <input id="settingsUseAccessToken" type="checkbox" />
          <label for="settingsUseAccessToken">Access Token verwenden</label>
        </div>
      </div>
      <div class="settings-actions">
        <button type="submit" class="settings-btn primary">Speichern</button>
        <button type="button" class="settings-btn" id="settingsCancel">Abbrechen</button>
      </div>
    </form>
  </div>
  <header class="header">
    <img src="${iconUri}" class="logo" />
    <div class="title-block">
      <div class="title">VertexAgent</div>
      <div class="subtitle">Autonomer Code-Agent</div>
    </div>
    <div id="tokenInfo" class="token-info">Used Tokens: –</div>
  </header>
  <div class="container">
    <div id="messages" class="messages">
      <div class="message system">VertexAgent bereit. Wie kann ich helfen?</div>
    </div>
    
    <div class="input-container">
      <div id="attachments" class="attachments"></div>
      <div class="input-wrapper">
        <textarea id="input" class="input" rows="1" placeholder="Frage den Agenten..."></textarea>
      </div>
      <div class="input-footer">
        <div class="input-actions">
          <button type="button" class="action-btn" id="attachFile" title="Datei anhängen">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          </button>
          <button type="button" class="action-btn" id="openSettings" title="Einstellungen">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
        <button type="button" id="send" class="send-btn">
          <span style="font-size: 18px;">↑</span>
        </button>
      </div>
    </div>
  </div>
  
  <footer class="footer" id="providerInfo">
    Provider: – | UI: hotfix-2026-03-30-3
  </footer>

  <script nonce="${nonce}">
    (function () {
      let vscode = null;
      try {
        if (typeof acquireVsCodeApi === "function") {
          vscode = acquireVsCodeApi();
        }
      } catch (err) {
        console.warn("[VertexAgent] acquireVsCodeApi failed", err);
      }

      const messagesEl = document.getElementById("messages");
      const inputEl = document.getElementById("input");
      const sendBtn = document.getElementById("send");
      const attachBtn = document.getElementById("attachFile");
      const settingsBtn = document.getElementById("openSettings");
      const attachmentsEl = document.getElementById("attachments");
      const tokenInfoEl = document.getElementById("tokenInfo");
      const providerInfoEl = document.getElementById("providerInfo");
      const settingsOverlayEl = document.getElementById("settingsOverlay");
      const settingsFormEl = document.getElementById("settingsForm");
      const settingsCancelEl = document.getElementById("settingsCancel");
      const settingsProviderEl = document.getElementById("settingsProvider");
      const settingsServerUrlEl = document.getElementById("settingsServerUrl");
      const settingsServerPortEl = document.getElementById("settingsServerPort");
      const settingsApiKeyEl = document.getElementById("settingsApiKey");
      const settingsApiKeyGroupEl = document.getElementById("settingsApiKeyGroup");
      const settingsAccessTokenEl = document.getElementById("settingsAccessToken");
      const settingsAccessTokenGroupEl = document.getElementById("settingsAccessTokenGroup");
      const settingsUseAccessTokenEl = document.getElementById("settingsUseAccessToken");

      if (!messagesEl || !inputEl || !sendBtn) {
        return;
      }

      let currentStatusMessage = null;
      let attachments = [];

      function postToExtension(message) {
        if (!vscode) return;
        vscode.postMessage(message);
      }

      function removeStatus() {
        if (currentStatusMessage) {
          currentStatusMessage.remove();
          currentStatusMessage = null;
        }
      }

      function showStatus(text) {
        removeStatus();
        const div = document.createElement("div");
        div.className = "message status";

        const spinner = document.createElement("div");
        spinner.className = "status-spinner";
        const textSpan = document.createElement("span");
        textSpan.textContent = text;

        div.appendChild(spinner);
        div.appendChild(textSpan);
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        currentStatusMessage = div;
      }

      function simpleMarkdownToHtml(text) {
        var html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        // Code blocks - manual parsing to avoid regex escaping issues
        var parts = html.split('\`\`\`');
        var result = '';
        for (var i = 0; i < parts.length; i++) {
          if (i % 2 === 0) {
            // Not in code block
            result += parts[i];
          } else {
            // Inside code block
            var lines = parts[i].split('\\n');
            var firstLine = lines[0] || '';
            var codeContent = lines.slice(1).join('\\n');
            
            var langMatch = firstLine.match(/^(\\w+)\\s*(.*)$/);
            var language = langMatch ? langMatch[1] : 'code';
            var filepath = langMatch && langMatch[2] ? langMatch[2].trim() : '';
            
            // Check if this is a bash/sh command block
            var isBashCommand = language.toLowerCase() === 'bash' || language.toLowerCase() === 'sh';
            var trimmedContent = codeContent.trim();
            var isDeleteCommand = trimmedContent.toUpperCase() === 'DELETE' || 
                                 trimmedContent.toUpperCase() === '<<DELETE>>' ||
                                 trimmedContent.startsWith('rm ') ||
                                 trimmedContent.startsWith('rm -rf ');
            
            if (isBashCommand) {
              // Render as command block
              var commandContent = codeContent;
              if (isDeleteCommand && filepath) {
                // For DELETE operations, show rm -rf command (works for files and directories)
                commandContent = 'rm -rf ' + filepath;
              }
              result += '<div class="command-block">' +
                '<div class="command-header">' +
                '<span class="command-icon">$</span>' +
                '<span class="command-label">Command</span>' +
                '</div>' +
                '<div class="command-content">' + commandContent + '</div>' +
                '</div>';
              // Don't continue - fall through to normal processing for DELETE operations
            } else {
            
            // Parse diff stats and render code with diff highlighting
            var codeLines = codeContent.split('\\n');
            var added = 0;
            var removed = 0;
            var isDiff = false;
            
            for (var j = 0; j < codeLines.length; j++) {
              var line = codeLines[j];
              if (line.startsWith('+') && !line.startsWith('+++')) {
                added++;
                isDiff = true;
              }
              if (line.startsWith('-') && !line.startsWith('---')) {
                removed++;
                isDiff = true;
              }
            }
            
            // Wenn kein Diff-Format, zeige Gesamtzeilenzahl als "added"
            if (!isDiff) {
              var totalCodeLines = codeLines.length;
              if (totalCodeLines > 0) {
                added = totalCodeLines;
                isDiff = true;
              }
            }
            
            var diffStats = '';
            if (isDiff && (added > 0 || removed > 0)) {
              diffStats = '<span class="code-stats">' +
                '<span class="added">+' + added + '</span> ' +
                (removed > 0 ? '<span class="removed">-' + removed + '</span>' : '') +
                '</span>';
            }
            
            var header = filepath 
              ? '<div class="code-header" onclick="toggleCodeBlock(this)"><span class="code-lang">' + language.toUpperCase() + '</span><span class="code-file">' + filepath + diffStats + '</span></div>'
              : '<div class="code-header" onclick="toggleCodeBlock(this)"><span class="code-lang">' + language.toUpperCase() + '</span>' + diffStats + '</div>';
            
            // Render code with diff highlighting
            var renderedCode = '';
            var totalLines = codeLines.length;
            var shouldCollapse = totalLines > 4;
            
            for (var j = 0; j < codeLines.length; j++) {
              var line = codeLines[j];
              var lineClass = '';
              
              if (line.startsWith('+') && !line.startsWith('+++')) {
                lineClass = 'diff-added';
              } else if (line.startsWith('-') && !line.startsWith('---')) {
                lineClass = 'diff-removed';
              }
              
              var isCollapsed = shouldCollapse && j >= 4;
              var collapseClass = isCollapsed ? ' collapsed-line' : '';
              
              renderedCode += '<div class="code-line' + collapseClass + (lineClass ? ' ' + lineClass : '') + '">' + line + '</div>';
            }
            
            result += '<div class="code-block">' + header + '<div class="code-content">' + renderedCode + '</div></div>';
            }
          }
        }
        html = result;
        
        // Inline code
        html = html.replace(/\`([^\`]+)\`/g, '<code class="inline-code">$1</code>');
        
        // Bold
        html = html.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
        
        // Italic
        html = html.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');
        
        // Headers
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        
        // Lists
        html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*?<\\/li>\\n?)+/g, '<ul>$&</ul>');
        
        // Paragraphs
        var paragraphs = html.split('\\n\\n');
        html = paragraphs.map(function(p) {
          if (p.match(/^<(ul|pre|h3|div)/)) return p;
          if (p.trim()) return '<p>' + p + '</p>';
          return p;
        }).join('');
        
        return html;
      }

      function toggleCollapse(element) {
        var codeBlock = element.closest('.code-block');
        if (codeBlock) {
          codeBlock.classList.add('expanded');
        }
      }

      function toggleCodeBlock(element) {
        var codeBlock = element.closest('.code-block');
        if (codeBlock) {
          codeBlock.classList.toggle('expanded');
        }
      }

      function appendMessage(text, role) {
        removeStatus();
        const div = document.createElement("div");
        div.className = "message " + role;
        
        if (role === "agent") {
          div.innerHTML = simpleMarkdownToHtml(text);
        } else {
          div.textContent = text;
        }
        
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }

      function renderAttachments() {
        if (!attachmentsEl) return;
        attachmentsEl.innerHTML = "";
        if (!attachments || attachments.length === 0) {
          attachmentsEl.classList.remove("visible");
          return;
        }

        attachmentsEl.classList.add("visible");
        attachments.forEach(function (att, idx) {
          const chip = document.createElement("span");
          chip.className = "attachment-chip";

          const name = document.createElement("span");
          name.className = "attachment-name";
          name.textContent = att.filePath + (att.truncated ? " (gekürzt)" : "");

          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.className = "attachment-remove";
          removeBtn.textContent = "×";
          removeBtn.title = "Anhang entfernen";
          removeBtn.addEventListener("click", function () {
            attachments.splice(idx, 1);
            renderAttachments();
          });

          chip.appendChild(name);
          chip.appendChild(removeBtn);
          attachmentsEl.appendChild(chip);
        });
      }

      function adjustTextareaHeight() {
        inputEl.style.height = "auto";
        inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + "px";
      }

      function submitMessage() {
        const text = inputEl.value.trim();
        if ((!text && (!attachments || attachments.length === 0)) || sendBtn.disabled) {
          console.log('[UI] Submit blocked - empty or disabled');
          return;
        }

        console.log('[UI] Submitting message:', text);
        appendMessage(text, "user");
        showStatus("Denkt nach...");
        sendBtn.disabled = true;

        postToExtension({ type: "chat", text: text || "(nur Anhänge)", attachments: attachments });
        inputEl.value = "";
        inputEl.style.height = "24px";
        attachments = [];
        renderAttachments();
      }

      function showSettingsOverlay() {
        if (!settingsOverlayEl) return;
        settingsOverlayEl.classList.add("visible");
      }

      function hideSettingsOverlay() {
        if (!settingsOverlayEl) return;
        settingsOverlayEl.classList.remove("visible");
      }

      function updateSettingsFieldsByProvider(applyDefaults) {
        if (!settingsProviderEl || !settingsServerUrlEl || !settingsServerPortEl || !settingsApiKeyGroupEl || !settingsAccessTokenGroupEl) return;
        const provider = settingsProviderEl.value;

        settingsApiKeyGroupEl.style.display = "none";
        settingsAccessTokenGroupEl.style.display = "none";

        if (provider === "gemini") {
          if (applyDefaults) {
            settingsServerUrlEl.value = "https://generativelanguage.googleapis.com";
            settingsServerPortEl.value = "443";
          }
          settingsApiKeyGroupEl.style.display = "block";
        } else if (provider === "claude") {
          if (applyDefaults) {
            settingsServerUrlEl.value = "https://api.anthropic.com";
            settingsServerPortEl.value = "443";
          }
          settingsApiKeyGroupEl.style.display = "block";
        } else if (provider === "ollama") {
          if (applyDefaults) {
            settingsServerUrlEl.value = "http://localhost";
            settingsServerPortEl.value = "11434";
          }
        } else if (provider === "openai") {
          if (applyDefaults) {
            settingsServerUrlEl.value = "http://localhost";
            settingsServerPortEl.value = "8080";
          }
          settingsAccessTokenGroupEl.style.display = "block";
        } else {
          settingsAccessTokenGroupEl.style.display = "block";
        }
      }

      function applySettingsData(settings) {
        if (!settings) return;
        if (settingsProviderEl) settingsProviderEl.value = settings.provider || "openai";
        if (settingsServerUrlEl) settingsServerUrlEl.value = settings.serverUrl || "http://localhost";
        if (settingsServerPortEl) settingsServerPortEl.value = String(settings.serverPort || 8080);
        if (settingsApiKeyEl) settingsApiKeyEl.value = settings.apiKey || "";
        if (settingsAccessTokenEl) settingsAccessTokenEl.value = settings.accessToken || "";
        if (settingsUseAccessTokenEl) settingsUseAccessTokenEl.checked = !!settings.useAccessToken;
        if (settingsAccessTokenEl && settingsUseAccessTokenEl) {
          settingsAccessTokenEl.disabled = !settingsUseAccessTokenEl.checked;
        }
        updateSettingsFieldsByProvider(false);
      }

      sendBtn.addEventListener("click", function (e) {
        e.preventDefault();
        submitMessage();
      });

      inputEl.addEventListener("keydown", function (e) {
        if (e.isComposing) return;
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          submitMessage();
        }
      });

      inputEl.addEventListener("input", adjustTextareaHeight);
      inputEl.addEventListener("paste", function () {
        setTimeout(adjustTextareaHeight, 0);
      });

      if (settingsBtn) {
        settingsBtn.addEventListener("click", function (e) {
          e.preventDefault();
          postToExtension({ type: "openSettings" });
        });
      }

      if (settingsProviderEl) {
        settingsProviderEl.addEventListener("change", function () {
          updateSettingsFieldsByProvider(true);
        });
      }

      if (settingsUseAccessTokenEl && settingsAccessTokenEl) {
        settingsUseAccessTokenEl.addEventListener("change", function () {
          settingsAccessTokenEl.disabled = !settingsUseAccessTokenEl.checked;
          if (!settingsUseAccessTokenEl.checked) {
            settingsAccessTokenEl.value = "";
          }
        });
      }

      if (settingsFormEl) {
        settingsFormEl.addEventListener("submit", function (e) {
          e.preventDefault();
          postToExtension({
            type: "saveSettings",
            provider: settingsProviderEl ? settingsProviderEl.value : "openai",
            serverUrl: settingsServerUrlEl ? settingsServerUrlEl.value : "http://localhost",
            serverPort: settingsServerPortEl ? settingsServerPortEl.value : "8080",
            apiKey: settingsApiKeyEl ? settingsApiKeyEl.value : "",
            useAccessToken: settingsUseAccessTokenEl ? settingsUseAccessTokenEl.checked : false,
            accessToken: settingsAccessTokenEl ? settingsAccessTokenEl.value : "",
          });
        });
      }

      if (settingsCancelEl) {
        settingsCancelEl.addEventListener("click", function () {
          hideSettingsOverlay();
        });
      }

      if (attachBtn) {
        attachBtn.addEventListener("click", function (e) {
          e.preventDefault();
          postToExtension({ type: "pickAttachments" });
        });
      }

      window.addEventListener("error", function (event) {
        appendMessage("UI-Fehler: " + event.message, "system");
      });

      window.addEventListener("message", function (event) {
        const msg = event.data || {};
        if (msg.type === "status") {
          showStatus(msg.text || "");
        } else if (msg.type === "removeStatus") {
          removeStatus();
        } else if (msg.type === "enableSendButton") {
          sendBtn.disabled = false;
          console.log('[UI] Send button re-enabled');
        } else if (msg.type === "response") {
          removeStatus();
          appendMessage(msg.text || "", "agent");
          sendBtn.disabled = false;
        } else if (msg.type === "error") {
          removeStatus();
          appendMessage("Fehler: " + (msg.text || ""), "system");
          sendBtn.disabled = false;
        } else if (msg.type === "tokenUsage") {
          if (tokenInfoEl && msg.usage) {
            tokenInfoEl.textContent = "Used Tokens: " + (msg.usage.total_tokens || "–");
          }
        } else if (msg.type === "providerInfo") {
          const provider = msg.provider || "unbekannt";
          const model = msg.model || "";
          if (providerInfoEl) {
            providerInfoEl.textContent = model ? "Provider: " + provider + " (" + model + ")" : "Provider: " + provider;
          }
        } else if (msg.type === "attachmentsSelected") {
          attachments = Array.isArray(msg.attachments) ? msg.attachments : [];
          renderAttachments();
        } else if (msg.type === "settingsData") {
          applySettingsData(msg.settings || {});
          showSettingsOverlay();
        } else if (msg.type === "settingsSaved") {
          hideSettingsOverlay();
          appendMessage("Einstellungen gespeichert.", "system");
        }
      });

      postToExtension({ type: "getProviderInfo" });
    })();
  </script>
</body>
</html>`;
  }
}

function getNonce() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
