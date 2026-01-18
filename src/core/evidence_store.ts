import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import { execWithTimeout, ExecResult } from "./exec";
import {
  gitStatusPorcelain,
  gitDiffNameOnly,
  gitDiffCachedNameOnly,
  gitUntracked,
  gitTopLevel
} from "./git";

export type GateMode = "docs" | "full";

export type RunRecord = {
  id: string;
  createdAt: string;
  repoRoot: string;
  mode: GateMode;
  featureKey: string;
  kind: "gate";
  ok: boolean;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  failLine: string | null;
  argv: string[];
  artifacts: {
    runDir: string;
    metaJson: string;
    stdoutTxt: string;
    stderrTxt: string;
    gitStatusTxt: string;
    diffNameOnlyTxt: string;
    diffCachedNameOnlyTxt: string;
    untrackedTxt: string;
  };
};

function nowIso(): string {
  return new Date().toISOString();
}

async function ensureDir(uri: vscode.Uri): Promise<void> {
  await vscode.workspace.fs.createDirectory(uri);
}

async function writeText(uri: vscode.Uri, text: string): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(text, "utf-8"));
}

async function writeJson(uri: vscode.Uri, obj: unknown): Promise<void> {
  await writeText(uri, JSON.stringify(obj, null, 2) + "\n");
}

function extractFailLine(stdout: string, stderr: string): string | null {
  const all = `${stdout}\n${stderr}`.split(/\r?\n/);
  const fail = all.find((l) => l.startsWith("FAIL(")) ?? all.find((l) => /FAIL\(/.test(l));
  return fail ?? null;
}

async function resolvePythonArgv(repoRoot: string): Promise<string[]> {
  const venv = vscode.Uri.joinPath(vscode.Uri.file(repoRoot), ".venv", "Scripts", "python.exe");
  try {
    await vscode.workspace.fs.stat(venv);
    return [venv.fsPath];
  } catch {
    return ["py", "-3.12"];
  }
}

export async function gateRunAndStore(
  context: vscode.ExtensionContext,
  repoRoot: string,
  featureKey: string,
  mode: GateMode,
  timeoutSec: number
): Promise<RunRecord> {
  const top = await gitTopLevel(repoRoot, 10_000);
  if (top && top.replace(/\\/g, "/") !== repoRoot.replace(/\\/g, "/")) {
    throw new Error(`workspace root と git toplevel が一致しません。\nroot=${repoRoot}\ntoplevel=${top}`);
  }

  const status = await gitStatusPorcelain(repoRoot, 10_000);
  if (status.trim() !== "") {
    throw new Error("作業ツリーがdirtyのため Gate を実行しません（strict-clean前提）。まず git status を空にしてください。");
  }

  const base = vscode.Uri.joinPath(context.globalStorageUri, "ai-flow");
  const runsDir = vscode.Uri.joinPath(base, "runs");
  await ensureDir(runsDir);

  const id = `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${randomUUID().slice(0, 8)}`;
  const runDir = vscode.Uri.joinPath(runsDir, id);
  await ensureDir(runDir);

  const py = await resolvePythonArgv(repoRoot);
  const argv = [...py, "scripts/validate_repo.py", "--mode", mode, "--strict-clean"];

  const diffNameOnly = await gitDiffNameOnly(repoRoot, 10_000);
  const diffCached = await gitDiffCachedNameOnly(repoRoot, 10_000);
  const untracked = await gitUntracked(repoRoot, 10_000);

  const result: ExecResult = await execWithTimeout(argv, repoRoot, timeoutSec * 1000);

  const failLine = extractFailLine(result.stdout, result.stderr);
  const ok = result.exitCode === 0 && !result.timedOut;

  const meta = {
    id,
    kind: "gate",
    createdAt: nowIso(),
    repoRoot,
    mode,
    featureKey,
    argv,
    ok,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    failLine,
    env: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      vscode: vscode.version
    }
  };

  const metaJson = vscode.Uri.joinPath(runDir, "meta.json");
  const stdoutTxt = vscode.Uri.joinPath(runDir, "stdout.txt");
  const stderrTxt = vscode.Uri.joinPath(runDir, "stderr.txt");
  const gitStatusTxt = vscode.Uri.joinPath(runDir, "git_status_porcelain.txt");
  const diffNameOnlyTxt = vscode.Uri.joinPath(runDir, "git_diff_name_only.txt");
  const diffCachedNameOnlyTxt = vscode.Uri.joinPath(runDir, "git_diff_cached_name_only.txt");
  const untrackedTxt = vscode.Uri.joinPath(runDir, "git_untracked.txt");

  await writeJson(metaJson, meta);
  await writeText(stdoutTxt, result.stdout);
  await writeText(stderrTxt, result.stderr);
  await writeText(gitStatusTxt, status);
  await writeText(diffNameOnlyTxt, diffNameOnly);
  await writeText(diffCachedNameOnlyTxt, diffCached);
  await writeText(untrackedTxt, untracked);

  const record: RunRecord = {
    id,
    createdAt: meta.createdAt,
    repoRoot,
    mode,
    featureKey,
    kind: "gate",
    ok,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    failLine,
    argv,
    artifacts: {
      runDir: runDir.fsPath,
      metaJson: metaJson.fsPath,
      stdoutTxt: stdoutTxt.fsPath,
      stderrTxt: stderrTxt.fsPath,
      gitStatusTxt: gitStatusTxt.fsPath,
      diffNameOnlyTxt: diffNameOnlyTxt.fsPath,
      diffCachedNameOnlyTxt: diffCachedNameOnlyTxt.fsPath,
      untrackedTxt: untrackedTxt.fsPath
    }
  };

  await appendHistory(context, record);
  return record;
}

type HistoryFile = { version: 1; runs: RunRecord[] };

async function readHistoryFile(context: vscode.ExtensionContext): Promise<HistoryFile> {
  const base = vscode.Uri.joinPath(context.globalStorageUri, "ai-flow");
  await ensureDir(base);
  const file = vscode.Uri.joinPath(base, "history.json");
  try {
    const bytes = await vscode.workspace.fs.readFile(file);
    const json = JSON.parse(Buffer.from(bytes).toString("utf-8")) as HistoryFile;
    if (json && json.version === 1 && Array.isArray(json.runs)) return json;
  } catch {
    // ignore
  }
  return { version: 1, runs: [] };
}

async function writeHistoryFile(context: vscode.ExtensionContext, hist: HistoryFile): Promise<void> {
  const base = vscode.Uri.joinPath(context.globalStorageUri, "ai-flow");
  const file = vscode.Uri.joinPath(base, "history.json");
  await writeJson(file, hist);
}

export async function listHistory(context: vscode.ExtensionContext): Promise<RunRecord[]> {
  const hist = await readHistoryFile(context);
  return [...hist.runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function appendHistory(context: vscode.ExtensionContext, run: RunRecord): Promise<void> {
  const hist = await readHistoryFile(context);
  hist.runs.push(run);
  if (hist.runs.length > 200) hist.runs.splice(0, hist.runs.length - 200);
  await writeHistoryFile(context, hist);
}
