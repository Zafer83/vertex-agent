/**
 * VertexAgent – Settings Panel
 * UI für LLM-Konfiguration (Host, Port, Token)
 * Copyright (c) VertexLabs – Zafer Kılıçaslan
 * www.vertexlabs.de
 */

import * as vscode from "vscode";

export class SettingsPanel {
  private static currentPanel: SettingsPanel | undefined;
  private readonly panel: vscode.WebviewPanel;

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this.panel = panel;
    this.panel.webview.html = this.getHtmlForWebview(this.panel.webview, context);

    this.panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === "saveSettings") {
        const config = vscode.workspace.getConfiguration("vertexAgent");
        await config.update("provider", message.provider, vscode.ConfigurationTarget.Global);
        await config.update("serverUrl", message.serverUrl, vscode.ConfigurationTarget.Global);
        await config.update("serverPort", parseInt(message.serverPort), vscode.ConfigurationTarget.Global);
        await config.update("apiKey", message.apiKey, vscode.ConfigurationTarget.Global);
        await config.update("useAccessToken", message.useAccessToken, vscode.ConfigurationTarget.Global);
        await config.update("accessToken", message.accessToken, vscode.ConfigurationTarget.Global);
        
        vscode.window.showInformationMessage("VertexAgent Einstellungen gespeichert!");
        this.panel.dispose();
      }
    });
  }

  public static createOrShow(context: vscode.ExtensionContext) {
    if (SettingsPanel.currentPanel) {
      SettingsPanel.currentPanel.panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "vertexAgentSettings",
      "VertexAgent Einstellungen",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    SettingsPanel.currentPanel = new SettingsPanel(panel, context);

    panel.onDidDispose(() => {
      SettingsPanel.currentPanel = undefined;
    });
  }

  private getHtmlForWebview(webview: vscode.Webview, context: vscode.ExtensionContext): string {
    const config = vscode.workspace.getConfiguration("vertexAgent");
    const provider = config.get<string>("provider", "openai");
    const serverUrl = config.get<string>("serverUrl", "http://localhost");
    const serverPort = config.get<number>("serverPort", 8080);
    const apiKey = config.get<string>("apiKey", "");
    const useAccessToken = config.get<boolean>("useAccessToken", false);
    const accessToken = config.get<string>("accessToken", "");

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>VertexAgent Einstellungen</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #050509;
      --border: #262636;
      --accent: #f43a35;
      --text: #f5f5f7;
      --text-muted: #808090;
      --input-bg: #0d0d12;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
    }
    h1 {
      font-size: 20px;
      font-weight: 600;
      margin: 0 0 20px 0;
      color: var(--accent);
    }
    .form-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 6px;
      color: var(--text);
    }
    .label-description {
      font-size: 11px;
      color: var(--text-muted);
      font-weight: 400;
      margin-top: 2px;
    }
    input[type="text"],
    input[type="number"],
    input[type="password"] {
      width: 100%;
      padding: 8px 12px;
      background: var(--input-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      font-size: 13px;
      outline: none;
    }
    input:focus {
      border-color: var(--accent);
    }
    .checkbox-group {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
    }
    input[type="checkbox"] {
      width: 16px;
      height: 16px;
      cursor: pointer;
    }
    .checkbox-label {
      font-size: 13px;
      color: var(--text);
      cursor: pointer;
      user-select: none;
    }
    .button-group {
      display: flex;
      gap: 10px;
      margin-top: 30px;
    }
    button {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-primary {
      background: var(--accent);
      color: white;
    }
    .btn-primary:hover {
      opacity: 0.9;
    }
    .btn-secondary {
      background: rgba(255,255,255,0.06);
      color: var(--text);
    }
    .btn-secondary:hover {
      background: rgba(255,255,255,0.1);
    }
    .info-box {
      background: rgba(244,58,53,0.08);
      border: 1px solid rgba(244,58,53,0.3);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 20px;
      font-size: 12px;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <h1>⚙️ VertexAgent Einstellungen</h1>
  
  <div class="info-box">
    Wähle deinen LLM Provider und konfiguriere die Verbindung. Das API-Format wird automatisch angepasst.
  </div>

  <form id="settingsForm">
    <div class="form-group">
      <label>
        Provider
        <div class="label-description">Wähle deinen LLM Provider</div>
      </label>
      <select id="provider" required>
        <option value="openai" ${provider === 'openai' ? 'selected' : ''}>OpenAI-kompatibel (llama.cpp, Ollama, LiteLLM)</option>
        <option value="gemini" ${provider === 'gemini' ? 'selected' : ''}>Google Gemini</option>
        <option value="claude" ${provider === 'claude' ? 'selected' : ''}>Anthropic Claude</option>
        <option value="ollama" ${provider === 'ollama' ? 'selected' : ''}>Ollama (lokal)</option>
        <option value="custom" ${provider === 'custom' ? 'selected' : ''}>Custom API</option>
      </select>
    </div>
    <div class="form-group">
      <label>
        Server URL
        <div class="label-description">Die Basis-URL deines LLM-Servers (z.B. http://localhost oder https://api.example.com)</div>
      </label>
      <input type="text" id="serverUrl" value="${serverUrl}" placeholder="http://localhost" required>
    </div>

    <div class="form-group">
      <label>
        Server Port
        <div class="label-description">Der Port deines LLM-Servers</div>
      </label>
      <input type="number" id="serverPort" value="${serverPort}" placeholder="8080" required>
    </div>

    <div class="form-group" id="apiKeyGroup" style="display: none;">
      <label>
        API Key
        <div class="label-description">API Key für Gemini oder Claude</div>
      </label>
      <input type="password" id="apiKey" value="${apiKey}" placeholder="z.B. AIza... für Gemini">
    </div>

    <div class="form-group" id="accessTokenGroup" style="display: none;">
      <label>
        Access Token
        <div class="label-description">Optional: Bearer Token für authentifizierte Anfragen</div>
      </label>
      <input type="password" id="accessToken" value="${accessToken}" placeholder="Leer lassen wenn kein Token benötigt" ${!useAccessToken ? 'disabled' : ''}>
      
      <div class="checkbox-group">
        <input type="checkbox" id="useAccessToken" ${useAccessToken ? 'checked' : ''}>
        <label for="useAccessToken" class="checkbox-label">Access Token verwenden</label>
      </div>
    </div>

    <div class="button-group">
      <button type="submit" class="btn-primary">Speichern</button>
      <button type="button" class="btn-secondary" id="cancelBtn">Abbrechen</button>
    </div>
  </form>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const form = document.getElementById('settingsForm');
    const providerSelect = document.getElementById('provider');
    const serverUrlInput = document.getElementById('serverUrl');
    const serverPortInput = document.getElementById('serverPort');
    const apiKeyGroup = document.getElementById('apiKeyGroup');
    const accessTokenGroup = document.getElementById('accessTokenGroup');
    const useTokenCheckbox = document.getElementById('useAccessToken');
    const tokenInput = document.getElementById('accessToken');
    const cancelBtn = document.getElementById('cancelBtn');

    function updateFieldsForProvider() {
      const provider = providerSelect.value;
      
      // Reset visibility
      apiKeyGroup.style.display = 'none';
      accessTokenGroup.style.display = 'none';
      
      // Provider-specific configuration
      if (provider === 'gemini') {
        serverUrlInput.value = 'https://generativelanguage.googleapis.com';
        serverPortInput.value = '443';
        apiKeyGroup.style.display = 'block';
      } else if (provider === 'claude') {
        serverUrlInput.value = 'https://api.anthropic.com';
        serverPortInput.value = '443';
        apiKeyGroup.style.display = 'block';
      } else if (provider === 'ollama') {
        serverUrlInput.value = 'http://localhost';
        serverPortInput.value = '11434';
      } else if (provider === 'openai') {
        serverUrlInput.value = 'http://localhost';
        serverPortInput.value = '8080';
        accessTokenGroup.style.display = 'block';
      } else {
        accessTokenGroup.style.display = 'block';
      }
    }

    providerSelect.addEventListener('change', updateFieldsForProvider);
    updateFieldsForProvider();

    useTokenCheckbox.addEventListener('change', () => {
      tokenInput.disabled = !useTokenCheckbox.checked;
      if (!useTokenCheckbox.checked) {
        tokenInput.value = '';
      }
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      
      vscode.postMessage({
        type: 'saveSettings',
        provider: providerSelect.value,
        serverUrl: document.getElementById('serverUrl').value,
        serverPort: document.getElementById('serverPort').value,
        apiKey: document.getElementById('apiKey').value,
        useAccessToken: useTokenCheckbox.checked,
        accessToken: tokenInput.value
      });
    });

    cancelBtn.addEventListener('click', () => {
      window.close();
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
