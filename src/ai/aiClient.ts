/**
 * VertexAgent – AiClient
 * Bindet den lokalen llama.cpp Server (OpenAI-kompatibel) als Backend für den Agenten ein.
 * Copyright (c) VertexLabs – Zafer Kılıçaslan
 * www.vertexlabs.de
 */

import * as vscode from "vscode";
import { request } from "undici";
import { AgentPayload, AgentResponse as AgentResponseType } from "../agent/types";
import { ProviderAdapter } from "./providerAdapter";

export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface AgentEdit {
  filePath: string;
  newContent: string;
}

export interface AgentResponse {
  message: string;
  usage?: TokenUsage;
  edits?: AgentEdit[];
  memoryNotes?: string[];
}

function extractCodeBlocksAsEdits(content: string): AgentEdit[] {
  const edits: AgentEdit[] = [];
  
  // Regex für Code-Blöcke mit Dateiangabe: ```language filepath oder ```filepath
  const codeBlockRegex = /```(?:[\w]+\s+)?([^\n]+)\n([\s\S]*?)```/g;
  
  // Liste von reinen Sprach-Identifiern die KEINE Dateipfade sind
  const languageKeywords = new Set([
    'python', 'javascript', 'typescript', 'java', 'cpp', 'c', 'go', 'rust', 'ruby',
    'php', 'swift', 'kotlin', 'scala', 'bash', 'sh', 'shell', 'json', 'yaml', 'yml',
    'xml', 'html', 'css', 'scss', 'sass', 'sql', 'markdown', 'md', 'txt', 'plaintext',
    'jsx', 'tsx', 'vue', 'svelte', 'rs', 'toml', 'ini', 'conf', 'dockerfile', 'makefile'
  ]);
  
  let match;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    const firstLine = match[1].trim();
    const codeContent = match[2];
    
    console.log('[extractCodeBlocksAsEdits] Found code block:', firstLine);
    
    // Ignoriere reine Sprach-Identifier
    if (languageKeywords.has(firstLine.toLowerCase())) {
      console.log('[extractCodeBlocksAsEdits] Skipping language keyword:', firstLine);
      continue;
    }
    
    // Prüfe ob die erste Zeile ein Dateipfad ist (enthält / oder endet mit Dateiendung)
    if (firstLine.includes('/') || /\.(ts|js|py|java|cpp|c|go|rs|tsx|jsx|vue|html|css|json|yaml|yml|md|txt|sh|rb|php|swift|kt)$/i.test(firstLine)) {
      console.log('[extractCodeBlocksAsEdits] Adding edit for:', firstLine);
      edits.push({
        filePath: firstLine,
        newContent: codeContent
      });
    } else {
      console.log('[extractCodeBlocksAsEdits] Skipping (no file path):', firstLine);
    }
  }
  
  console.log('[extractCodeBlocksAsEdits] Total edits extracted:', edits.length);
  return edits;
}

export class AiClient {
  async send(payload: AgentPayload): Promise<AgentResponseType> {
    const config = vscode.workspace.getConfiguration("vertexAgent");
    const serverUrl = config.get<string>("serverUrl", "http://localhost");
    const serverPort = config.get<number>("serverPort", 8080);
    const useAccessToken = config.get<boolean>("useAccessToken", false);
    const accessToken = config.get<string>("accessToken", "");

    const url = `${serverUrl.replace(/\/$/, "")}:${serverPort}/v1/chat/completions`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (useAccessToken && accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    const systemPrompt = `Du bist VertexAgent, ein spezialisierter Coding-Assistent im "${payload.mode}" Modus.

KONTEXT:
- Workspace: ${payload.projectContext}
- Notizen: ${payload.memory.join(", ") || "keine"}
- Fehler: ${payload.errors.length > 0 ? payload.errors.join("\n") : "keine"}

AUTONOMES TESTEN:
- Nach Code-Erstellung wird automatisch getestet
- Bei Fehlern erhältst du sie in der nächsten Iteration
- Behebe alle Fehler bevor du die Aufgabe als abgeschlossen markierst
- Setze "continue": true wenn du Fehler erwartest oder Verifikation brauchst

MEMORY-SYSTEM:
- Speichere wichtige Design-Entscheidungen in memoryNotes
- Nutze memoryNotes für: Architektur-Entscheidungen, verwendete Patterns, wichtige Abhängigkeiten
- memoryNotes werden persistent gespeichert und in zukünftigen Requests verfügbar
- Format: Array von kurzen, prägnanten Notizen

ANTWORTFORMAT:
1. Ein technischer Satz auf Deutsch
2. Code-Block mit Dateipfad
3. Kurze Implementierungs-Notizen auf Deutsch

Code-Format:
\`\`\`language dateipfad
code
\`\`\`

JSON-RESPONSE (optional, wenn strukturierte Daten nötig):
{
  "edits": [{"filePath": "src/file.ts", "newContent": "..."}],
  "memoryNotes": ["Used Express.js for REST API", "Implemented JWT authentication"],
  "continue": false
}

REGELN:
- Code zuerst, minimale Erklärung
- Folge Clean Code, SOLID, DRY Prinzipien
- Nutze Englisch für Code/Kommentare
- Nur relative Pfade (z.B. src/utils/helper.ts)
- Kommentiere nur komplexe Algorithmen
- Antworte auf Deutsch für Erklärungen
- Test-driven: Stelle sicher dass Code kompiliert und fehlerfrei läuft
- Erstelle memoryNotes bei wichtigen Entscheidungen`;

    const body = {
      model: "vertex-agent",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: payload.userMessage,
        },
      ],
      stream: false,
    };

    const res = await request(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (res.statusCode < 200 || res.statusCode >= 300) {
      const text = await res.body.text();
      throw new Error(`LLM-Server Fehler (${res.statusCode}): ${text}`);
    }

    const json = (await res.body.json()) as any;

    const content =
      json?.choices?.[0]?.message?.content ??
      "Keine Antwort vom Modell erhalten.";

    const edits = json?.edits;
    const memoryNotes = json?.memoryNotes;
    const continueFlag = json?.continue;

    return {
      message: content,
      edits,
      memoryNotes,
      continue: continueFlag,
    };
  }

  async sendChat(prompt: string): Promise<AgentResponse> {
    const config = vscode.workspace.getConfiguration("vertexAgent");
    const provider = config.get<string>("provider", "openai");
    const serverUrl = config.get<string>("serverUrl", "http://localhost");
    const serverPort = config.get<number>("serverPort", 8080);
    const apiKey = config.get<string>("apiKey", "");
    const useAccessToken = config.get<boolean>("useAccessToken", false);
    const accessToken = config.get<string>("accessToken", "");

    const systemPrompt = "Du bist VertexAgent, ein spezialisierter Coding-Assistent.\n\nAUTONOMES TESTEN:\n- Dein Code wird nach Erstellung automatisch getestet\n- Bei Fehlern erhältst du sie und musst sie beheben\n- Melde nur 'ready' wenn Code fehlerfrei ist\n\nMEMORY-SYSTEM:\n- Speichere wichtige Design-Entscheidungen als memoryNotes\n- Format: Array von kurzen Notizen im JSON-Response\n- Beispiel: {\"memoryNotes\": [\"Used React for UI\", \"Implemented Redux for state\"]}\n\nANTWORTFORMAT:\n1. Ein technischer Satz auf Deutsch\n2. Code-Block mit Dateipfad\n3. Kurze Implementierungs-Notizen auf Deutsch\n\nCode-Format:\n```language dateipfad\ncode\n```\n\nREGELN:\n- Code zuerst, minimale Erklärung\n- Folge Clean Code, SOLID, DRY Prinzipien\n- Nutze Englisch für Code/Kommentare\n- Kommentiere nur komplexe Algorithmen\n- Nur relative Pfade (z.B. src/main.py)\n- Workspace: Nur aktuelles Projektverzeichnis\n- Antworte auf Deutsch für Erklärungen\n- Test-driven: Stelle sicher dass Code kompiliert und fehlerfrei läuft\n- Erstelle memoryNotes bei wichtigen Architektur-Entscheidungen";

    const providerConfig = {
      provider,
      serverUrl,
      serverPort,
      apiKey,
      useAccessToken,
      accessToken,
    };

    const { url, headers, body } = ProviderAdapter.buildRequest(providerConfig, prompt, systemPrompt);

    const res = await request(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (res.statusCode < 200 || res.statusCode >= 300) {
      const text = await res.body.text();
      throw new Error(`LLM-Server Fehler (${res.statusCode}): ${text}`);
    }

    const json = (await res.body.json()) as any;

    const { content, usage: usageData } = ProviderAdapter.parseResponse(providerConfig, json);

    const usage: TokenUsage | undefined = usageData;

    // Extrahiere Code-Blöcke aus der Antwort
    const extractedEdits = extractCodeBlocksAsEdits(content);
    
    // Kombiniere strukturierte Edits vom Server (falls vorhanden) mit extrahierten Code-Blöcken
    const edits: AgentEdit[] | undefined = json?.edits 
      ? [...json.edits, ...extractedEdits]
      : extractedEdits.length > 0 
        ? extractedEdits 
        : undefined;

    // Extrahiere memoryNotes aus JSON-Response
    const memoryNotes = json?.memoryNotes;
    console.log('[sendChat] memoryNotes from response:', memoryNotes);

    return {
      message: content,
      usage,
      edits,
      memoryNotes,
    };
  }
}

export async function sendChatRequest(prompt: string): Promise<AgentResponse> {
  const client = new AiClient();
  return client.sendChat(prompt);
}
