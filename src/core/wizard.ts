import * as vscode from "vscode";
import { DEFAULTS } from "./constants";
import { getConfig } from "./config";
import type { FlowState, AcceptanceCheck } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

async function pickOne<T extends string>(title: string, items: { label: string; value: T; description?: string }[], placeHolder?: string): Promise<T | undefined> {
  const picked = await vscode.window.showQuickPick(
    items.map((i) => ({ label: i.label, description: i.description, value: i.value })),
    { title, placeHolder }
  );
  return picked?.value;
}

export async function runWizard(existing: FlowState): Promise<FlowState | undefined> {
  const projectKind = await pickOne("AI Flow: 種別", [
    { label: "新規 (New)", value: "new", description: "要件→タスク→実装→ゲートまで一気通貫" },
    { label: "既存拡張 (Extend)", value: "extend", description: "既存の前提/影響範囲/互換性を重視" },
  ], "まず種別を選択");
  if (!projectKind) return undefined;

  const mode = await pickOne("AI Flow: モード", [
    { label: "FULL", value: "full", description: "コード/テスト/品質ゲート込み（デフォ）" },
    { label: "DOCS", value: "docs", description: "docs/scripts中心（ドキュメント作業の日）" },
  ], "通常は FULL");
  if (!mode) return undefined;

  const goal = await vscode.window.showInputBox({
    title: "AI Flow: 目的",
    prompt: "何を達成したい？（ユーザー価値ベースで1〜3行）",
    value: existing.goal || "",
    validateInput: (v) => (v.trim().length === 0 ? "必須です" : undefined),
  });
  if (!goal) return undefined;

  const constraints = await vscode.window.showInputBox({
    title: "AI Flow: 制約（Hard Constraints）",
    prompt: "例）PowerShell禁止 / strict-clean / ネットワーク禁止 / 互換性 など",
    value: existing.constraints || "",
  });
  if (constraints === undefined) return undefined;

  const filesRaw = await vscode.window.showInputBox({
    title: "AI Flow: 変更対象（任意）",
    prompt: "相対パスをカンマ区切り（例: ai_flow/foo.py, tests/test_foo.py）。未指定でもOK",
    value: existing.targetFiles.join(", "),
  });
  if (filesRaw === undefined) return undefined;
  const targetFiles = filesRaw.split(",").map((s) => s.trim()).filter(Boolean);

  const acceptanceRaw = await vscode.window.showInputBox({
    title: "AI Flow: 受け入れ条件（任意）",
    prompt: "cmd を ' ; ' 区切りで複数（例: python -m pytest -q ; python scripts\\validate_repo.py --mode full --strict-clean）",
    value: existing.acceptance.map((a) => a.cmd).join(" ; "),
  });
  if (acceptanceRaw === undefined) return undefined;

  const acceptance: AcceptanceCheck[] = acceptanceRaw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((cmd) => ({ cmd, expect: "exit 0" }));

  const providerId = "manual" as const;

  return {
    projectKind,
    mode,
    goal,
    constraints,
    targetFiles,
    acceptance: acceptance.length ? acceptance : existing.acceptance,
    providerId,
    updatedAt: nowIso(),
  };
}

export function buildValidateCommand(mode: "full" | "docs", strictClean: boolean): string {
  const cfg = getConfig();
  const sc = strictClean ? " --strict-clean" : "";
  return `${cfg.pythonPath} ${cfg.validateScript} --mode ${mode}${sc}`;
}

export function buildGuardCommand(mode: "full" | "docs"): string {
  const cfg = getConfig();
  return `${cfg.pythonPath} ${cfg.guardScript} --mode ${mode}`;
}
