import * as vscode from "vscode";
import * as crypto from "crypto";

export async function ensureDir(u: vscode.Uri): Promise<void> {
  await vscode.workspace.fs.createDirectory(u);
}

export async function exists(u: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(u);
    return true;
  } catch {
    return false;
  }
}

export async function readText(u: vscode.Uri): Promise<string> {
  const b = await vscode.workspace.fs.readFile(u);
  return Buffer.from(b).toString("utf-8");
}

export async function writeText(u: vscode.Uri, text: string): Promise<void> {
  const b = Buffer.from(text, "utf-8");
  await vscode.workspace.fs.writeFile(u, b);
}

export function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

export function safeBasename(featureKey: string): string {
  const s = featureKey.trim();
  if (s.includes("/") || s.includes("\\") || s.includes("..")) {
    throw new Error("featureKey contains illegal path characters");
  }
  if (/[<>:"|?*]/.test(s)) throw new Error("featureKey contains illegal Windows filename characters");
  if (/[.\s]$/.test(s)) throw new Error("featureKey must not end with dot or whitespace");
  const reserved = new Set([
    "con","prn","aux","nul",
    "com1","com2","com3","com4","com5","com6","com7","com8","com9",
    "lpt1","lpt2","lpt3","lpt4","lpt5","lpt6","lpt7","lpt8","lpt9",
  ]);
  if (reserved.has(s.toLowerCase())) throw new Error("featureKey is a reserved Windows name");
  return s;
}
