import * as vscode from "vscode";
import { DEFAULTS, STATE_KEY, LAST_RUN_KEY } from "./constants";
import type { FlowState, GateRun } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

export function getWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return undefined;
  return folders[0].uri.fsPath;
}

export async function loadState(ctx: vscode.ExtensionContext): Promise<FlowState | undefined> {
  return ctx.globalState.get<FlowState>(STATE_KEY);
}

export async function saveState(ctx: vscode.ExtensionContext, state: FlowState): Promise<void> {
  await ctx.globalState.update(STATE_KEY, state);
}

export async function loadLastRun(ctx: vscode.ExtensionContext): Promise<GateRun | undefined> {
  return ctx.globalState.get<GateRun>(LAST_RUN_KEY);
}

export async function saveLastRun(ctx: vscode.ExtensionContext, run: GateRun): Promise<void> {
  await ctx.globalState.update(LAST_RUN_KEY, run);
}

export function newDefaultState(): FlowState {
  return {
    projectKind: DEFAULTS.projectKind,
    mode: DEFAULTS.mode,
    goal: "",
    constraints: [
      "PowerShell 禁止（cmd / git / python のみ）",
      "ネットワーク不要で完結（外部DLなし）",
      "変更範囲は最小化し、常に git diff --name-only で可視化",
      "validate_repo (--strict-clean) を最終ゲートとして必ず通す",
      "失敗時は FAIL(<step>) の 1点だけを直す",
    ].join("\n"),
    targetFiles: [],
    acceptance: [
      { cmd: ".\\.venv\\Scripts\\python -m pytest -q", expect: "exit 0" },
      { cmd: ".\\.venv\\Scripts\\python scripts\\validate_repo.py --mode full --strict-clean", expect: "exit 0" },
    ],
    providerId: "manual",
    updatedAt: nowIso(),
  };
}

export function mergeWithDefaults(state?: FlowState): FlowState {
  const base = newDefaultState();
  if (!state) return base;
  return { ...base, ...state, updatedAt: nowIso() };
}
