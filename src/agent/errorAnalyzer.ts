/**
 * VertexAgent – ErrorAnalyzer
 * Liest VS Code Diagnostics und extrahiert Fehler für den Agenten-Loop.
 * Copyright (c) VertexLabs – Zafer Kılıçaslan
 * www.vertexlabs.de
 */

import * as vscode from "vscode";

export class ErrorAnalyzer {
  public collectErrors(): string[] {
    const errors: string[] = [];

    const diagnostics = vscode.languages.getDiagnostics();
    for (const [uri, diags] of diagnostics) {
      for (const d of diags) {
        if (d.severity === vscode.DiagnosticSeverity.Error) {
          errors.push(
            `${uri.fsPath}:${d.range.start.line + 1}:${
              d.range.start.character + 1
            } - ${d.message}`
          );
        }
      }
    }

    return errors;
  }
}
