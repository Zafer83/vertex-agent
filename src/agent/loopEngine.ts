/**
 * VertexAgent – LoopEngine
 * Autonomer Agent-Loop für Chat, Fix und Refactor-Modi mit llama.cpp Backend.
 * Copyright (c) VertexLabs – Zafer Kılıçaslan
 * www.vertexlabs.de
 */

import { AiClient } from "../ai/aiClient";
import { MemoryEngine } from "./memoryEngine";
import { ContextBuilder } from "./contextBuilder";
import { ErrorAnalyzer } from "./errorAnalyzer";
import { FileEditEngine } from "../fs/fileEditEngine";
import { AgentPayload, AgentResponse } from "./types";

export interface LoopResult {
  success: boolean;
  iterations: number;
  lastResponse?: AgentResponse;
  errorsFix: number;
  testsRun: number;
}

export type LoopMode = "chat" | "fix" | "refactor";

export type LoopProgressCallback = (info: {
  iteration: number;
  response: AgentResponse;
  status?: string;
}) => void;

export class LoopEngine {
  constructor(
    private ai: AiClient,
    private memory: MemoryEngine,
    private context: ContextBuilder,
    private errors: ErrorAnalyzer,
    private edits: FileEditEngine
  ) {}

  public async run(
    mode: LoopMode,
    userMessage: string,
    maxIterations: number,
    onProgress?: LoopProgressCallback
  ): Promise<LoopResult> {
    let iteration = 0;
    let lastResponse: any;
    let errorsFix = 0;
    let testsRun = 0;

    while (iteration < maxIterations) {
      iteration++;

      if (onProgress) {
        onProgress({ iteration, response: { message: "" } as any, status: "Sammle Projekt-Kontext..." });
      }

      const projectContext = await this.context.collect();
      const mem = this.memory.load();
      const errs = this.errors.collectErrors();

      if (onProgress) {
        onProgress({ iteration, response: { message: "" } as any, status: "Sende Anfrage an AI..." });
      }

      const payload: AgentPayload = {
        mode,
        userMessage,
        projectContext,
        memory: mem.notes,
        errors: errs
      };

      const response = await this.ai.send(payload);
      lastResponse = response;
      
      if (onProgress) {
        onProgress({ iteration, response: { message: "" } as any, status: "Verarbeite AI-Antwort..." });
      }

      if (response.memoryNotes && response.memoryNotes.length > 0) {
        this.memory.append(response.memoryNotes);
      }

      if (response.edits && response.edits.length > 0) {
        if (onProgress) {
          onProgress({ iteration, response: { message: "" } as any, status: `Schreibe ${response.edits.length} Datei(en)...` });
        }
        
        await this.edits.applyFileEdits(response.edits);
        
        if (onProgress) {
          onProgress({ iteration, response: { message: "" } as any, status: "Warte auf Diagnostics..." });
        }
        
        // Wait for VS Code to process file changes and update diagnostics
        await this.waitForDiagnostics(500);
        
        if (onProgress) {
          onProgress({ iteration, response: { message: "" } as any, status: "Prüfe auf Fehler..." });
        }
        
        // Test for errors after applying edits
        testsRun++;
        const errorsAfterEdit = this.errors.collectErrors();
        
        if (errorsAfterEdit.length > 0 && iteration < maxIterations) {
          // Errors detected - continue loop to fix them
          errorsFix++;
          userMessage = `Fix the following errors in the code:\n${errorsAfterEdit.slice(0, 5).join('\n')}`;
          
          if (onProgress) {
            onProgress({ 
              iteration, 
              response: { 
                message: `Detected ${errorsAfterEdit.length} errors. Fixing automatically...`,
                edits: response.edits,
                memoryNotes: response.memoryNotes
              } as any 
            });
          }
          continue;
        }
      }

      if (onProgress) {
        onProgress({ iteration, response: response as any });
      }

      // If AI doesn't signal to continue and no errors, we are done
      if (!(response as any).continue && iteration >= 1) {
        const finalErrors = this.errors.collectErrors();
        return { 
          success: finalErrors.length === 0, 
          iterations: iteration, 
          lastResponse: response as any,
          errorsFix,
          testsRun
        };
      }
    }

    return { 
      success: false, 
      iterations: iteration, 
      lastResponse: lastResponse,
      errorsFix,
      testsRun
    };
  }

  private async waitForDiagnostics(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}