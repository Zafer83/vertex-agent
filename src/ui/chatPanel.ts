/**
 * VertexAgent – ChatPanel
 * Webview-UI für den VertexAgent mit Modi Chat/Fix/Refactor und minimalistischem Branding.
 * Copyright (c) VertexLabs – Zafer Kılıçaslan
 * www.vertexlabs.de
 */

import * as vscode from "vscode";
import { sendChatRequest } from "../ai/aiClient";
import { applyFileEdits } from "../fs/fileEditEngine";
import { fetchAvailableModel } from "../ai/modelFetcher";

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
            if (!text.trim()) return;

            try {
              this.panel.webview.postMessage({ type: "status", text: "Sammle Kontext..." });
              
              const response = await sendChatRequest(text);

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
                this.panel.webview.postMessage({ type: "status", text: `Schreibe ${response.edits.length} Datei(en)...` });
                await applyFileEdits(response.edits);
              }

              if (response.memoryNotes && Array.isArray(response.memoryNotes) && response.memoryNotes.length > 0) {
                console.log('[ChatPanel] Saving memoryNotes:', response.memoryNotes);
                const { MemoryEngine } = await import("../agent/memoryEngine");
                const memory = new MemoryEngine();
                memory.append(response.memoryNotes);
              }
            } catch (err: any) {
              this.panel.webview.postMessage({
                type: "error",
                text: `Fehler: ${err?.message ?? String(err)}`,
              });
            }
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
          vscode.commands.executeCommand("vertexAgent.openSettings");
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

  public static createOrShow(context: vscode.ExtensionContext) {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (ChatPanel.currentPanel) {
      ChatPanel.currentPanel.panel.reveal(column);
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

    panel.onDidDispose(() => {
      ChatPanel.currentPanel = undefined;
    });
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
    .message.agent code { background: rgba(255,255,255,0.1); padding: 2px 4px; border-radius: 3px; font-family: monospace; font-size: 11px; }
    .message.agent pre { background: #000; padding: 8px; border-radius: 4px; overflow-x: auto; margin: 6px 0; border: 1px solid var(--border-subtle); }
    .message.agent pre code { background: none; padding: 0; }
    .message.agent strong { font-weight: 600; }
    .message.agent em { font-style: italic; }
    .message.agent p { margin: 6px 0; }
    .message.system { font-size: 11px; color: var(--text-muted); text-align: center; }
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
    .input-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 8px 8px 8px;
    }
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

    .token-info { font-size: 10px; color: var(--text-muted); margin-left: 10px; }
    
    /* Footer with Provider Info */
    .footer {
      padding: 6px 14px;
      border-top: 1px solid var(--border-subtle);
      font-size: 9px;
      color: var(--text-muted);
      text-align: center;
      opacity: 0.6;
    }
    
    /* Code Blocks */
    .code-block { margin: 10px 0; border: 1px solid var(--border-subtle); border-radius: 6px; background: #000; overflow: hidden; }
    .code-header { 
      display: flex; justify-content: space-between; padding: 6px 10px; 
      background: rgba(255,255,255,0.03); border-bottom: 1px solid var(--border-subtle);
      font-family: monospace; font-size: 11px; cursor: pointer;
    }
    .code-content { display: none; padding: 10px; font-family: monospace; font-size: 12px; overflow-x: auto; white-space: pre; }
    .code-content.expanded { display: block; }
  </style>
</head>
<body>
  <header class="header">
    <img src="${iconUri}" class="logo" />
    <div class="title-block">
      <div class="title">VertexAgent</div>
      <div class="subtitle">Autonomer Code-Agent</div>
    </div>
    <div id="tokenInfo" class="token-info">Tokens: –</div>
  </header>
  <div class="container">
    <div id="messages" class="messages">
      <div class="message system">VertexAgent bereit. Wie kann ich helfen?</div>
    </div>
    
    <div class="input-container">
      <div class="input-wrapper">
        <textarea id="input" class="input" rows="1" placeholder="Frage den Agenten..."></textarea>
      </div>
      <div class="input-footer">
        <div class="input-actions">
          <button class="action-btn" id="attachFile" title="Datei anhängen"><span>📎</span></button>
          <button class="action-btn" id="openSettings" title="Einstellungen"><span>⚙️</span></button>
        </div>
        <button id="send" class="send-btn">
          <span style="font-size: 18px;">↑</span>
        </button>
      </div>
    </div>
  </div>
  
  <footer class="footer" id="providerInfo">
    Provider: –
  </footer>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const messagesEl = document.getElementById("messages");
    const inputEl = document.getElementById("input");
    const sendBtn = document.getElementById("send");
    const tokenInfoEl = document.getElementById("tokenInfo");
    const providerInfoEl = document.getElementById("providerInfo");

    let currentStatusMessage = null;
    
    // Request provider info on load
    vscode.postMessage({ type: "getProviderInfo" });

    function showStatus(text) {
      removeStatus();
      const div = document.createElement("div");
      div.className = "message status";
      div.id = "status-message";
      
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

    function removeStatus() {
      if (currentStatusMessage) {
        currentStatusMessage.remove();
        currentStatusMessage = null;
      }
    }

    function simpleMarkdownToHtml(text) {
      var html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      var backtick = String.fromCharCode(96);
      var tripleBacktick = backtick + backtick + backtick;
      
      // Code blocks
      var codeBlockRegex = new RegExp(tripleBacktick + '[\\\\w]*?\\\\n([\\\\s\\\\S]*?)' + tripleBacktick, 'g');
      html = html.replace(codeBlockRegex, '<pre><code>$1</code></pre>');
      
      // Inline code
      var inlineCodeRegex = new RegExp(backtick + '([^' + backtick + ']+)' + backtick, 'g');
      html = html.replace(inlineCodeRegex, '<code>$1</code>');
      
      // Bold
      html = html.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
      
      // Italic
      html = html.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');
      
      // Headers
      html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
      
      // Lists
      html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
      var listItems = html.match(/<li>.*?<\\/li>/g);
      if (listItems && listItems.length > 0) {
        html = html.replace(/(<li>.*?<\\/li>\\n?)+/g, '<ul>$&</ul>');
      }
      
      // Paragraphs
      html = html.split('\\n\\n').map(function(p) { 
        if (p.match(/^<(ul|pre|h3)/)) return p;
        return '<p>' + p + '</p>';
      }).join('');
      
      return html;
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

    sendBtn.addEventListener("click", () => {
      const text = inputEl.value.trim();
      if (!text) return;
      appendMessage(text, "user");
      showStatus("Denkt nach...");
      sendBtn.disabled = true;
      vscode.postMessage({ type: "chat", text });
      inputEl.value = "";
      inputEl.style.height = "24px";
    });

    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
      }
    });

    inputEl.addEventListener("input", () => {
      inputEl.style.height = "auto";
      inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + "px";
    });

    document.getElementById("openSettings").addEventListener("click", () => {
      vscode.postMessage({ type: "openSettings" });
    });

    window.addEventListener("message", (event) => {
      const msg = event.data;
      if (msg.type === "status") {
        showStatus(msg.text);
      }
      if (msg.type === "response") {
        removeStatus();
        appendMessage(msg.text, "agent");
        sendBtn.disabled = false;
      }
      if (msg.type === "error") {
        removeStatus();
        appendMessage("Fehler: " + msg.text, "system");
        sendBtn.disabled = false;
      }
      if (msg.type === "tokenUsage") {
        tokenInfoEl.textContent = "Tokens: " + (msg.usage.total_tokens || "–");
      }
      if (msg.type === "providerInfo") {
        const provider = msg.provider || "unbekannt";
        const model = msg.model || "";
        providerInfoEl.textContent = model ? "Provider: " + provider + " (" + model + ")" : "Provider: " + provider;
      }
    });
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