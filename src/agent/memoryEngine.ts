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
  private readonly maxNotes = 200;

  constructor() {
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this.ensureFile();
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

  private ensureFile(): void {
    const filePath = this.getFilePath();
    if (!filePath) return;
    if (fs.existsSync(filePath)) return;

    const initial: MemoryData = {
      notes: [],
      lastUpdated: new Date().toISOString(),
    };
    fs.writeFileSync(filePath, JSON.stringify(initial, null, 2), "utf-8");
  }

  public load(): MemoryData {
    this.ensureFile();
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
    const normalized = notes
      .map((note) => String(note ?? "").trim())
      .filter((note) => note.length > 0);
    if (!normalized.length) return;

    const seen = new Set(current.notes);
    for (const note of normalized) {
      if (!seen.has(note)) {
        current.notes.push(note);
        seen.add(note);
      }
    }

    if (current.notes.length > this.maxNotes) {
      current.notes = current.notes.slice(-this.maxNotes);
    }

    this.save(current);
  }

  public recent(limit: number = 20): string[] {
    const current = this.load();
    return current.notes.slice(-Math.max(1, limit));
  }
}
