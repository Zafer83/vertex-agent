/**
 * VertexAgent – Agent-Typdefinitionen
 * Copyright (c) VertexLabs – Zafer Kılıçaslan
 * www.vertexlabs.de
 */

export interface AgentEdit {
  filePath: string;
  newContent: string;
}

export interface AgentResponse {
  message: string;
  edits?: AgentEdit[];
  memoryNotes?: string[];
  continue?: boolean;
}

export interface AgentPayload {
  mode: "chat" | "fix" | "refactor";
  userMessage: string;
  projectContext: string;
  memory: string[];
  errors: string[];
}
