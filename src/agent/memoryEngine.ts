/**
 * VertexAgent – MemoryEngine
 * Persistente Workspace-Memory im Ordner .vertex/memory.json für den Agenten.
 * Copyright (c) VertexLabs – Zafer Kılıçaslan
 * www.vertexlabs.de
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

export interface MemoryData {
  notes: string[];
  lastUpdated: string;
}

const MEMORY_DIR = ".vertex";
const MEMORY_FILE = "memory.json";

export class MemoryEngine {
  private workspaceRoot: string | undefined;

  constructor() {
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private ensureDir(): string | undefined {
    if (!this.workspaceRoot) return undefined;
    const dir = path.join(this.workspaceRoot, MEMORY_DIR);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  private getFilePath(): string | undefined {
    const dir = this.ensureDir();
    if (!dir) return undefined;
    return path.join(dir, MEMORY_FILE);
  }

  public load(): MemoryData {
    const filePath = this.getFilePath();
    if (!filePath || !fs.existsSync(filePath)) {
      return { notes: [], lastUpdated: new Date().toISOString() };
    }
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(raw) as MemoryData;
    } catch {
      return { notes: [], lastUpdated: new Date().toISOString() };
    }
  }

  public save(data: MemoryData): void {
    const filePath = this.getFilePath();
    if (!filePath) return;
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  public append(notes: string[]): void {
    if (!notes.length) return;
    const current = this.load();
    current.notes.push(...notes);
    this.save(current);
  }
}
