import type { FlowState, GateRun } from "./types";
import { getConfig } from "./config";

export function renderFeatureSpecJa(state: FlowState): string {
  const targets = state.targetFiles.length ? state.targetFiles.map((s) => `- ${s}`).join("\n") : "- (未指定)";
  const acc = state.acceptance
    .map((a, i) => `- [ ] (${i + 1}) ${a.cmd}${a.expect ? `\n  - 期待: ${a.expect}` : ""}`)
    .join("\n");

  return `# FEATURE_SPEC (JA)

## 目的
${state.goal || "(未入力)"}

## 種別
- projectKind: ${state.projectKind}
- mode: ${state.mode}

## 制約（Hard Constraints）
${state.constraints || "(未入力)"}

## 変更対象（Paths / Files）
${targets}

## 受け入れ条件（Acceptance）
${acc}

## 非目標（Out of scope）
- 目的に直接関係しないリファクタ・整形の拡大
- 仕様を推測で追加（必ず根拠・ログで確認）
`;
}

export function renderTasksYamlJa(state: FlowState): string {
  const cfg = getConfig();
  const gateCmd = `${cfg.pythonPath} ${cfg.validateScript} --mode ${state.mode} --strict-clean`;

  const items = [
    { id: "spec", title: "FEATURE_SPEC を確定", details: "目的/制約/受け入れ条件/変更範囲を固定し、未記入をゼロにする。" },
    { id: "plan", title: "実装タスク分解", details: "変更ファイル候補と手順、テスト計画を列挙。最小変更で達成する。" },
    { id: "impl", title: "実装（Codegen）", details: "差分を最小化して実装。各変更のたびに git diff --name-only を確認する。" },
    { id: "gate", title: "最終ゲート（validate_repo）", details: gateCmd },
    { id: "fix", title: "失敗時は 1点修正（Debug）", details: "FAIL(<step>) の 1点だけを直し、再度ゲートを通す。" },
    { id: "review", title: "レビュー（差分/ログ）", details: "変更範囲とゲートログを添付し、再現性を担保する。" },
  ];

  const yaml = [
    "# FEATURE_TASKS (JA)",
    "tasks:",
    ...items.map((t) => {
      const body = t.details.replace(/\n/g, "\n      ");
      return `  - id: ${t.id}\n    title: ${t.title}\n    details: |\n      ${body}`;
    }),
    "",
  ].join("\n");

  return yaml;
}

export function renderCodegenPromptJa(state: FlowState): string {
  const cfg = getConfig();
  const targets = state.targetFiles.length ? state.targetFiles.join(", ") : "(未指定)";
  const acc = state.acceptance.map((a) => `- ${a.cmd}${a.expect ? ` (期待: ${a.expect})` : ""}`).join("\n");

  return `# TASK: CODEGEN (JA)
あなたは実装担当です。**推測で直さない**。必ずログ/差分/ゲートで裏取りする。

## Inputs
- projectKind: ${state.projectKind}
- mode: ${state.mode}
- 目的: ${state.goal || "(未入力)"}
- 変更対象: ${targets}
- 受け入れ条件:
${acc}

## Hard Constraints
${state.constraints || "(未入力)"}

## 手順（必須）
1) 変更するファイル一覧を先に宣言（最小）。
2) 変更ごとに \`git diff --name-only\` を実行し、意図外変更が無いか確認。
3) 最後に最終ゲートを **1コマンドで完走**：
   - docs: \`${cfg.pythonPath} ${cfg.validateScript} --mode docs --strict-clean\`
   - full: \`${cfg.pythonPath} ${cfg.validateScript} --mode full --strict-clean\`
4) 失敗したら **FAIL(<step>) の 1点だけ**を直す（他を触らない）。

## 出力（必須）
- 実行したコマンドと結果ログ
- 変更したファイル一覧（diff name-only）
- 最終ゲートの完走ログ（exit 0）
`;
}

export function renderDebugPromptJa(state: FlowState, last: GateRun): string {
  const cfg = getConfig();
  const lastRes = last.results[last.results.length - 1];
  const fail = last.failLine || "(FAIL行が見つかりませんでした)";

  return `# TASK: DEBUG (JA)
あなたはデバッグ担当です。**推測禁止**。まず再現 → 原因特定 → 最小修正 → 再検証。

## FAIL
${fail}

## 再現コマンド
${lastRes?.cmd || "(不明)"}

## 直前ログ（stdout/stderr 抜粋）
\`\`\`
${(lastRes?.stdout || "").slice(-4000)}
${(lastRes?.stderr || "").slice(-4000)}
\`\`\`

## 制約
- 直すのは FAIL の 1点のみ（他の改善はしない）
- 変更のたびに \`git diff --name-only\`
- 最後に validate_repo を再実行して exit 0

## 最終ゲート
${cfg.pythonPath} ${cfg.validateScript} --mode ${state.mode} --strict-clean
`;
}
