import * as vscode from "vscode";
import { Buffer } from "node:buffer";

export type SessionRecord = {
  sessionId: string;
  createdAt: string; // ISO
  repoRoot: string;
  featureKey: string;
  goal: string;
  constraints?: string;
  targetFiles?: string[];
  acceptance?: string[];
  planText: string;
  runIds: string[];
};

function nowIsoJst(): string {
  const d = new Date();
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().replace("Z", "+09:00");
}

function rand6(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function newSessionId(): string {
  return `s_${Date.now()}_${rand6()}`;
}

export function sessionsRoot(context: vscode.ExtensionContext): vscode.Uri {
  return vscode.Uri.joinPath(context.globalStorageUri, "ai-flow", "sessions");
}

export function sessionDir(context: vscode.ExtensionContext, sessionId: string): vscode.Uri {
  return vscode.Uri.joinPath(sessionsRoot(context), sessionId);
}

async function ensureDir(uri: vscode.Uri): Promise<void> {
  await vscode.workspace.fs.createDirectory(uri);
}

async function writeJson(uri: vscode.Uri, obj: unknown): Promise<void> {
  const text = JSON.stringify(obj, null, 2);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(text, "utf-8"));
}

async function readJson<T>(uri: vscode.Uri): Promise<T | null> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(bytes).toString("utf-8");
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function createSession(
  context: vscode.ExtensionContext,
  repoRoot: string
): Promise<SessionRecord> {
  const id = newSessionId();
  const dir = sessionDir(context, id);
  await ensureDir(dir);
  await ensureDir(vscode.Uri.joinPath(dir, "outputs"));
  const rec: SessionRecord = {
    sessionId: id,
    createdAt: nowIsoJst(),
    repoRoot,
    featureKey: "",
    goal: "",
    constraints: "",
    targetFiles: [],
    acceptance: [],
    planText: "",
    runIds: []
  };
  await writeJson(vscode.Uri.joinPath(dir, "session.json"), rec);
  return rec;
}

export async function loadSession(
  context: vscode.ExtensionContext,
  sessionId: string
): Promise<SessionRecord | null> {
  const uri = vscode.Uri.joinPath(sessionDir(context, sessionId), "session.json");
  return await readJson<SessionRecord>(uri);
}

export async function saveSession(
  context: vscode.ExtensionContext,
  rec: SessionRecord
): Promise<void> {
  const dir = sessionDir(context, rec.sessionId);
  await ensureDir(dir);
  await ensureDir(vscode.Uri.joinPath(dir, "outputs"));
  await writeJson(vscode.Uri.joinPath(dir, "session.json"), rec);
}

export async function listSessions(
  context: vscode.ExtensionContext
): Promise<SessionRecord[]> {
  const root = sessionsRoot(context);
  try {
    const items = await vscode.workspace.fs.readDirectory(root);
    const sessions: SessionRecord[] = [];
    for (const [name, kind] of items) {
      if (kind !== vscode.FileType.Directory) continue;
      const rec = await loadSession(context, name);
      if (rec) sessions.push(rec);
    }
    sessions.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return sessions;
  } catch {
    return [];
  }
}

export async function writeSessionOutput(
  context: vscode.ExtensionContext,
  sessionId: string,
  filename: string,
  content: string
): Promise<string> {
  const dir = sessionDir(context, sessionId);
  const out = vscode.Uri.joinPath(dir, "outputs", filename);
  await ensureDir(vscode.Uri.joinPath(dir, "outputs"));
  await vscode.workspace.fs.writeFile(out, Buffer.from(content, "utf-8"));
  return out.fsPath;
}

export async function revealSessionInOS(
  context: vscode.ExtensionContext,
  sessionId: string
): Promise<void> {
  const dir = sessionDir(context, sessionId);
  await ensureDir(dir);
  await vscode.commands.executeCommand("revealFileInOS", dir);
}
