import * as vscode from "vscode";
import { spawn } from "child_process";
import { logLine } from "./logging";
import type { CmdResult } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Run a command via cmd.exe to avoid PowerShell usage.
 * `commandLine` must be a single Windows cmd command line.
 */
export async function runCmdInWorkspace(commandLine: string, cwd: string): Promise<CmdResult> {
  const startedAt = nowIso();
  logLine(`$ ${commandLine}`);

  return await new Promise<CmdResult>((resolve) => {
    const child = spawn("cmd.exe", ["/c", commandLine], {
      cwd,
      windowsHide: true,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => {
      const s = d.toString();
      stdout += s;
      logLine(s.trimEnd());
    });
    child.stderr.on("data", (d) => {
      const s = d.toString();
      stderr += s;
      logLine(s.trimEnd());
    });

    child.on("close", (code) => {
      const finishedAt = nowIso();
      const exitCode = typeof code === "number" ? code : 1;
      logLine(`== exit ${exitCode} ==`);
      resolve({
        cmd: commandLine,
        cwd,
        exitCode,
        stdout,
        stderr,
        startedAt,
        finishedAt,
      });
    });
  });
}

/**
 * Basic guard: require a trusted workspace before running external commands.
 */
export function ensureTrustedWorkspace(): boolean {
  if (vscode.workspace.isTrusted) return true;
  void vscode.window.showWarningMessage(
    "このワークスペースは未信頼 (Workspace Trust) のため、AI Flow は外部コマンド実行を停止しました。信頼してから再実行してください。"
  );
  return false;
}
