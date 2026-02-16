import * as vscode from "vscode";
import { Buffer } from "node:buffer";
import { join } from "node:path";
import { gateRunAndStore, listHistory, RunRecord } from "../core/evidence_store";
import { validateFeatureKey } from "../core/featureKey";
import { gitDiffNameOnly } from "../core/git";
import { generateDocsFromTemplates } from "../core/docgen";
import { classifyFailStep, getTroubleCards, FailStep } from "../core/troubleshoot";
import { RunHistoryTreeDataProvider } from "./runHistoryTree";
import {
  SessionRecord,
  createSession,
  loadSession,
  saveSession,
  listSessions,
  writeSessionOutput,
  revealSessionInOS,
} from "../core/session_store";

type FlowState = {
  sessionId: string;
  featureKey: string;
  goal: string;
  constraints: string;
  targetFilesRaw: string;
  acceptanceRaw: string;
  planText: string;
  lastRun: RunRecord | null;
  lastFailStep: FailStep | null;
};

function stateKey(repoRoot: string): string {
  const norm = repoRoot.replace(/\\/g, "/");
  return `aiFlow.flowState:${norm}`;
}

async function readState(context: vscode.ExtensionContext, repoRoot: string): Promise<FlowState> {
  const raw = context.globalState.get<FlowState>(stateKey(repoRoot));
  if (raw && raw.sessionId) {
    return {
      sessionId: raw.sessionId,
      featureKey: raw.featureKey ?? "",
      goal: raw.goal ?? "",
      constraints: (raw as any).constraints ?? "",
      targetFilesRaw: (raw as any).targetFilesRaw ?? "",
      acceptanceRaw: (raw as any).acceptanceRaw ?? "",
      planText: raw.planText ?? "",
      lastRun: raw.lastRun ?? null,
      lastFailStep: raw.lastFailStep ?? null
    };
  }

  const sess = await createSession(context, repoRoot);
  return {
    sessionId: sess.sessionId,
    featureKey: "",
    goal: "",
    constraints: "",
    targetFilesRaw: "",
    acceptanceRaw: "",
    planText: "",
    lastRun: null,
    lastFailStep: null
  };
}

async function writeState(context: vscode.ExtensionContext, repoRoot: string, state: FlowState): Promise<void> {
  await context.globalState.update(stateKey(repoRoot), state);
}

async function openFile(fsPath: string): Promise<void> {
  const uri = vscode.Uri.file(fsPath);
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, { preview: false });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

function parseList(raw: string, pattern: RegExp): string[] {
  return String(raw ?? "")
    .split(pattern)
    .map((s) => s.trim())
    .filter((s) => !!s);
}

function parseTargetFiles(raw: string): string[] {
  // comma or newline
  return parseList(raw, /[\n,]/);
}

function parseAcceptance(raw: string): string[] {
  // newline or semicolon
  return parseList(raw, /[\n;]/);
}

function renderHtml(state: FlowState): string {
  const fk = escapeHtml(state.featureKey ?? "");
  const goal = escapeHtml(state.goal ?? "");
  const constraints = escapeHtml(state.constraints ?? "");
  const targets = escapeHtml(state.targetFilesRaw ?? "");
  const acceptance = escapeHtml(state.acceptanceRaw ?? "");
  const plan = escapeHtml(state.planText ?? "");
  const sid = escapeHtml(state.sessionId ?? "");
  const last = state.lastRun
    ? escapeHtml(`${state.lastRun.createdAt} ${state.lastRun.ok ? "OK" : "NG"} ${state.lastRun.mode} ${state.lastRun.featureKey}`)
    : "（なし）";
  const failStep = state.lastFailStep ? escapeHtml(state.lastFailStep) : "（未特定）";

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>AI Flow</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.5; padding: 12px 16px; }
  .row { display:flex; gap:16px; flex-wrap: wrap; }
  .card { border: 1px solid var(--vscode-editorWidget-border); padding: 12px; border-radius: 8px; background: var(--vscode-editorWidget-background); min-width: 320px; flex: 1; }
  h2 { margin: 0 0 8px; font-size: 14px; }
  label { display:block; font-size: 12px; margin: 8px 0 4px; color: var(--vscode-descriptionForeground); }
  input, textarea, select { width: 100%; box-sizing: border-box; padding: 8px; border-radius: 6px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); }
  textarea { min-height: 96px; resize: vertical; }
  button { padding: 8px 10px; border-radius: 6px; border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-background); color: var(--vscode-button-foreground); cursor: pointer; }
  button.secondary { background: transparent; color: var(--vscode-foreground); border-color: var(--vscode-editorWidget-border); }
  .btns { display:flex; gap:8px; flex-wrap: wrap; margin-top: 10px; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; font-size: 12px; white-space: pre-wrap; }
  .muted { color: var(--vscode-descriptionForeground); font-size: 12px; }
  .tabs { display:flex; gap:8px; margin: 10px 0; }
  .tab { padding: 6px 10px; border-radius: 999px; border: 1px solid var(--vscode-editorWidget-border); cursor:pointer; }
  .tab.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; }
  .panel { display:none; }
  .panel.active { display:block; }
</style>
</head>
<body>
  <div class="card" style="margin-bottom:12px;">
    <h2>セッション（Task Pack / ログを repo 外に保存）</h2>
    <div class="muted">sessionId: <span class="mono">${sid}</span></div>
    <div class="btns">
      <button class="secondary" id="btnNewSession">新規セッション</button>
      <button class="secondary" id="btnPickSession">過去セッションを開く</button>
      <button class="secondary" id="btnOpenSession">保存先を開く</button>
      <button class="secondary" id="btnOpenStepC">Step C（プロンプト出力）を開く</button>
    </div>
    <div class="muted" id="sessionStatus"></div>
  </div>

  <div class="row">
    <div class="card">
      <h2>① 仕様（FEATURE_SPEC / TASKS）</h2>
      <div class="muted">テンプレから生成 → 内容を埋める（コードは触らない）</div>

      <label>featureKey（必須・slug）</label>
      <input id="featureKey" value="${fk}" placeholder="例: fix-guard-worktree" />

      <label>目的（goal）（必須）</label>
      <textarea id="goal" placeholder="何を達成したいか">${goal}</textarea>

      <label>制約（Hard Constraints）（必須）</label>
      <textarea id="constraints" placeholder="例: strict-clean前提 / 推測で直さない / 変更範囲最小">${constraints}</textarea>

      <label>変更対象（Paths / Files）（必須・カンマ区切り or 改行）</label>
      <textarea id="targetFilesRaw" placeholder="例: src/xxx.ts, tests/yyy.test.ts">${targets}</textarea>

      <label>受け入れ条件（推奨3つ以上：正常/境界/異常）（必須・改行 or セミコロン区切り）</label>
      <textarea id="acceptanceRaw" placeholder="例:\n1) 正常: validate_repoがPASS\n2) 境界: (最小入力)でもPASS\n3) 異常: 不正入力で適切にエラー">${acceptance}</textarea>

      <div class="btns">
        <button id="btnSaveDocs">保存 → テンプレ生成</button>
        <button class="secondary" id="btnOpenSpec">FEATURE_SPECを開く</button>
        <button class="secondary" id="btnOpenTasks">FEATURE_TASKSを開く</button>
      </div>
      <div class="muted" id="docsStatus"></div>
    </div>

    <div class="card">
      <h2>② 実装プラン（承認用）</h2>
      <div class="muted">「やること」を文章で整理（ここが承認ポイント）</div>

      <label>プラン（差分/DoD/検証）</label>
      <textarea id="planText" placeholder="例: 1) 変更点 2) 影響範囲 3) テスト手順 4) DoD">${plan}</textarea>

      <div class="btns">
        <button id="btnSavePlan">保存</button>
        <button class="secondary" id="btnExportPlan">plan.mdとして出力</button>
      </div>
      <div class="muted" id="planStatus"></div>
    </div>
  </div>

  <div class="row" style="margin-top: 16px;">
    <div class="card">
      <h2>③ Gate（strict-clean検証）</h2>
      <div class="muted">このステップだけは必ず手動実行（誤操作/コスト暴騰防止）</div>

      <label>mode</label>
      <select id="mode">
        <option value="docs">docs</option>
        <option value="full" selected>full</option>
      </select>

      <label>timeoutSec</label>
      <input id="timeoutSec" value="900" />

      <div class="btns">
        <button id="btnRunGate">Gate実行 → 証跡保存</button>
        <button class="secondary" id="btnOpenTrouble">トラブルシュート</button>
        <button class="secondary" id="btnRefreshHistory">履歴を更新</button>
      </div>

      <div style="margin-top: 10px;" class="muted">
        最新結果: <span id="lastResult">${last}</span><br/>
        失敗ステップ推定: <span id="failStep">${failStep}</span>
      </div>

      <div class="tabs">
        <div class="tab active" data-tab="history">履歴</div>
        <div class="tab" data-tab="changes">変更ファイル</div>
        <div class="tab" data-tab="log">メッセージ</div>
      </div>

      <div class="panel active" id="panel-history">
        <div class="mono" id="historyBox">（未取得）</div>
      </div>
      <div class="panel" id="panel-changes">
        <div class="mono" id="changesBox">（未取得）</div>
      </div>
      <div class="panel" id="panel-log">
        <div class="mono" id="logBox">（なし）</div>
      </div>
    </div>
  </div>

<script>
const vscode = acquireVsCodeApi();
function byId(id){ return document.getElementById(id); }
function log(msg){
  const el = byId("logBox");
  el.textContent = (el.textContent ? (el.textContent + "\n") : "") + msg;
}
function setStatus(id, msg){ byId(id).textContent = msg; }
function currentState(){
  return {
    featureKey: byId("featureKey").value,
    goal: byId("goal").value,
    constraints: byId("constraints").value,
    targetFilesRaw: byId("targetFilesRaw").value,
    acceptanceRaw: byId("acceptanceRaw").value,
    planText: byId("planText").value,
    mode: byId("mode").value,
    timeoutSec: byId("timeoutSec").value
  };
}

byId("btnNewSession").addEventListener("click", () => vscode.postMessage({ type: "newSession" }));
byId("btnPickSession").addEventListener("click", () => vscode.postMessage({ type: "pickSession" }));
byId("btnOpenSession").addEventListener("click", () => vscode.postMessage({ type: "openSession" }));
byId("btnOpenStepC").addEventListener("click", () => vscode.postMessage({ type: "openStepC" }));

byId("btnSaveDocs").addEventListener("click", () => {
  const s = currentState();
  vscode.postMessage({
    type: "saveDocs",
    featureKey: s.featureKey,
    goal: s.goal,
    constraints: s.constraints,
    targetFilesRaw: s.targetFilesRaw,
    acceptanceRaw: s.acceptanceRaw
  });
});
byId("btnOpenSpec").addEventListener("click", () => vscode.postMessage({ type: "openSpec" }));
byId("btnOpenTasks").addEventListener("click", () => vscode.postMessage({ type: "openTasks" }));

byId("btnSavePlan").addEventListener("click", () => {
  const s = currentState();
  vscode.postMessage({ type: "savePlan", planText: s.planText });
});
byId("btnExportPlan").addEventListener("click", () => {
  const s = currentState();
  vscode.postMessage({ type: "exportPlan", planText: s.planText });
});

byId("btnRunGate").addEventListener("click", () => {
  const s = currentState();
  vscode.postMessage({ type: "runGate", mode: s.mode, timeoutSec: s.timeoutSec });
});
byId("btnOpenTrouble").addEventListener("click", () => vscode.postMessage({ type: "openTrouble" }));
byId("btnRefreshHistory").addEventListener("click", () => vscode.postMessage({ type: "refresh" }));

document.querySelectorAll(".tab").forEach((t) => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    const tab = t.getAttribute("data-tab");
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    byId("panel-" + tab).classList.add("active");
  });
});

window.addEventListener("message", (ev) => {
  const msg = ev.data;
  if (!msg || !msg.type) return;

  if (msg.type === "sessionStatus") { setStatus("sessionStatus", msg.text); log(msg.text); }
  if (msg.type === "docsStatus") { setStatus("docsStatus", msg.text); log(msg.text); }
  if (msg.type === "planStatus") { setStatus("planStatus", msg.text); log(msg.text); }
  if (msg.type === "history") { byId("historyBox").textContent = msg.text; }
  if (msg.type === "changes") { byId("changesBox").textContent = msg.text; }
  if (msg.type === "last") {
    byId("lastResult").textContent = msg.text;
    byId("failStep").textContent = msg.failStep || "（未特定）";
  }
});
</script>
</body>
</html>`;
}

async function ensureDir(uri: vscode.Uri): Promise<void> {
  await vscode.workspace.fs.createDirectory(uri);
}

async function writeText(uri: vscode.Uri, text: string): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(text, "utf-8"));
}

export async function openFlowWebview(
  context: vscode.ExtensionContext,
  repoRoot: string,
  historyProvider: RunHistoryTreeDataProvider
): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    "aiFlow",
    "AI Flow",
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  let state = await readState(context, repoRoot);

  async function ensureSessionLoaded(): Promise<SessionRecord> {
    const s = await loadSession(context, state.sessionId);
    if (s) return s;
    // missing -> recreate
    return await createSession(context, repoRoot);
  }

  panel.webview.html = renderHtml(state);

  async function postHistory(): Promise<void> {
    const runs = await listHistory(context);
    const items = runs.slice(0, 50);
    const text = items
      .map((r) => `${r.createdAt} ${r.ok ? "OK" : "NG"} ${r.mode} ${r.featureKey}  id=${r.id}`)
      .join("\n");
    panel.webview.postMessage({ type: "history", text: text || "（履歴なし）" });
  }

  async function postChanges(): Promise<void> {
    const diff = await gitDiffNameOnly(repoRoot, 10_000);
    panel.webview.postMessage({ type: "changes", text: diff || "（差分なし）" });
  }

  async function updateLast(run: RunRecord | null, failStep: FailStep | null): Promise<void> {
    state = { ...state, lastRun: run, lastFailStep: failStep };
    await writeState(context, repoRoot, state);
    panel.webview.postMessage({
      type: "last",
      text: run ? `${run.createdAt} ${run.ok ? "OK" : "NG"} ${run.mode} ${run.featureKey}（${run.id}）` : "（なし）",
      failStep: failStep ?? "（未特定）"
    });
  }

  async function openTrouble(): Promise<void> {
    const cards = getTroubleCards(state.lastFailStep ?? "unknown");
    const md = [
      `# AI Flow トラブルシュート`,
      ``,
      `- 推定ステップ: ${state.lastFailStep ?? "unknown"}`,
      ``,
      `---`,
      ...cards.flatMap((c) => [
        `## ${c.title}`,
        ``,
        `**症状**`,
        ...c.symptoms.map((s) => `- ${s}`),
        ``,
        `**原因候補**`,
        ...c.likelyCauses.map((s) => `- ${s}`),
        ``,
        `**対処手順**`,
        ...c.fixSteps.map((s) => `1. ${s}`),
        ``,
        `**確認**`,
        ...c.verify.map((s) => `- ${s}`),
        ``,
        `---`,
        ``
      ])
    ].join("\n");

    const base = vscode.Uri.joinPath(context.globalStorageUri, "ai-flow");
    const tDir = vscode.Uri.joinPath(base, "troubleshoot");
    await ensureDir(tDir);
    const file = vscode.Uri.joinPath(tDir, `troubleshoot_${Date.now()}.md`);
    await writeText(file, md);
    await openFile(file.fsPath);
  }

  async function syncSession(update: Partial<SessionRecord>): Promise<void> {
    const sess = await ensureSessionLoaded();
    const next: SessionRecord = { ...sess, ...update };
    await saveSession(context, next);
  }

  panel.webview.onDidReceiveMessage(async (msg) => {
    try {
      if (msg.type === "refresh") {
        await postHistory();
        await postChanges();
        return;
      }

      if (msg.type === "newSession") {
        const sess = await createSession(context, repoRoot);
        state = {
          ...state,
          sessionId: sess.sessionId,
          featureKey: "",
          goal: "",
          constraints: "",
          targetFilesRaw: "",
          acceptanceRaw: "",
          planText: ""
        };
        await writeState(context, repoRoot, state);
        panel.webview.html = renderHtml(state);
        panel.webview.postMessage({ type: "sessionStatus", text: `新規セッションを作成: ${sess.sessionId}` });
        await postHistory();
        await postChanges();
        return;
      }

      if (msg.type === "pickSession") {
        const sessions = await listSessions(context);
        if (sessions.length === 0) {
          panel.webview.postMessage({ type: "sessionStatus", text: "過去セッションがありません。" });
          return;
        }
        const picked = await vscode.window.showQuickPick(
          sessions.map((s) => ({
            label: `${s.sessionId}`,
            description: `${s.createdAt}  ${s.featureKey || "（未設定）"}`,
            detail: s.repoRoot
          })),
          { placeHolder: "開くセッションを選択" }
        );
        if (!picked) return;
        const rec = await loadSession(context, picked.label);
        if (!rec) return;
        state = {
          ...state,
          sessionId: rec.sessionId,
          featureKey: rec.featureKey,
          goal: rec.goal,
          constraints: rec.constraints ?? "",
          targetFilesRaw: (rec.targetFiles ?? []).join(", "),
          acceptanceRaw: (rec.acceptance ?? []).join("\n"),
          planText: rec.planText
        };
        await writeState(context, repoRoot, state);
        panel.webview.html = renderHtml(state);
        panel.webview.postMessage({ type: "sessionStatus", text: `セッションを読み込み: ${rec.sessionId}` });
        await postHistory();
        await postChanges();
        return;
      }

      if (msg.type === "openSession") {
        await revealSessionInOS(context, state.sessionId);
        return;
      }

      if (msg.type === "openStepC") {
        await vscode.commands.executeCommand("aiFlow.stepC");
        return;
      }

      if (msg.type === "saveDocs") {
        const featureKey = String(msg.featureKey ?? "").trim();
        const goal = String(msg.goal ?? "").trim();
        const constraints = String(msg.constraints ?? "").trim();
        const targetFilesRaw = String(msg.targetFilesRaw ?? "");
        const acceptanceRaw = String(msg.acceptanceRaw ?? "");

        const targetFiles = parseTargetFiles(targetFilesRaw);
        const acceptance = parseAcceptance(acceptanceRaw);

        const errs: string[] = [];
        errs.push(...validateFeatureKey(featureKey));
        if (!goal) errs.push("goal が空です。");
        if (!constraints) errs.push("制約（Hard Constraints）が空です。");
        if (targetFiles.length === 0) errs.push("変更対象（Paths / Files）が空です。");
        if (acceptance.length < 3) errs.push("受け入れ条件は3つ以上を推奨します（正常/境界/異常）。");

        if (errs.length > 0) {
          panel.webview.postMessage({ type: "docsStatus", text: "入力エラー:\n- " + errs.join("\n- ") });
          return;
        }

        state = { ...state, featureKey, goal, constraints, targetFilesRaw, acceptanceRaw };
        await writeState(context, repoRoot, state);
        await syncSession({ featureKey, goal, constraints, targetFiles, acceptance });

        panel.webview.postMessage({ type: "docsStatus", text: "テンプレ生成中..." });
        const r = await generateDocsFromTemplates(repoRoot, featureKey, goal, constraints, targetFiles, acceptance);
        if (!r.ok) {
          const fs = classifyFailStep(r.error);
          await updateLast(state.lastRun, fs);
          panel.webview.postMessage({ type: "docsStatus", text: "失敗: " + r.error });
          return;
        }

        // session outputs（repo外）
        await writeSessionOutput(context, state.sessionId, "FEATURE_SPEC.md", r.generatedText.featureSpec);
        await writeSessionOutput(context, state.sessionId, "FEATURE_TASKS.yaml", r.generatedText.featureTasks);

        panel.webview.postMessage({
          type: "docsStatus",
          text:
            "生成OK（repo内へ反映 + repo外へTask Pack保存）\n" +
            `- FEATURE_SPEC: ${r.files.featureSpec}\n` +
            `- FEATURE_TASKS: ${r.files.featureTasks}\n` +
            `- templates: ${r.usedTemplates.specTemplate} / ${r.usedTemplates.tasksTemplate}`
        });
        return;
      }

      if (msg.type === "openSpec") {
        const outDirRel = vscode.workspace.getConfiguration().get<string>("aiFlow.docs.outDir") ?? "docs/specs";
        await openFile(join(repoRoot, outDirRel, "FEATURE_SPEC.md"));
        return;
      }
      if (msg.type === "openTasks") {
        const outDirRel = vscode.workspace.getConfiguration().get<string>("aiFlow.docs.outDir") ?? "docs/specs";
        await openFile(join(repoRoot, outDirRel, "FEATURE_TASKS.yaml"));
        return;
      }

      if (msg.type === "savePlan") {
        const planText = String(msg.planText ?? "");

        if (!state.featureKey || !state.goal || !state.constraints) {
          panel.webview.postMessage({ type: "planStatus", text: "先に①（featureKey/goal/制約/対象/受け入れ）を保存してください。" });
          return;
        }

        state = { ...state, planText };
        await writeState(context, repoRoot, state);
        await syncSession({ planText });

        await writeSessionOutput(context, state.sessionId, "plan.md", planText.trim() ? planText.trim() + "\n" : "（未入力）\n");

        panel.webview.postMessage({ type: "planStatus", text: "保存しました（repo外にも保存）。" });
        return;
      }

      if (msg.type === "exportPlan") {
        const planText = String(msg.planText ?? "");
        state = { ...state, planText };
        await writeState(context, repoRoot, state);
        await syncSession({ planText });

        const out = vscode.Uri.file(repoRoot + "/docs/ai_flow/plan.md");
        await ensureDir(vscode.Uri.file(repoRoot + "/docs/ai_flow"));
        const md = [
          `# plan`,
          ``,
          `- sessionId: ${state.sessionId}`,
          `- featureKey: ${state.featureKey || "（未設定）"}`,
          ``,
          planText.trim() ? planText.trim() : "（未入力）",
          ``
        ].join("\n");
        await writeText(out, md);

        await writeSessionOutput(context, state.sessionId, "plan.md", md);

        panel.webview.postMessage({ type: "planStatus", text: `出力しました: ${out.fsPath}（repo外にも保存）` });
        await openFile(out.fsPath);
        return;
      }

      if (msg.type === "runGate") {
        const mode = String(msg.mode ?? "full") === "docs" ? "docs" : "full";
        const timeoutSec = Math.max(30, Number(msg.timeoutSec ?? 900) || 900);

        const tf = parseTargetFiles(state.targetFilesRaw);
        const ac = parseAcceptance(state.acceptanceRaw);
        if (!state.featureKey || !state.goal || !state.constraints || tf.length === 0 || ac.length === 0) {
          panel.webview.postMessage({ type: "docsStatus", text: "先に①（featureKey/goal/制約/対象/受け入れ）を保存してください。" });
          return;
        }

        panel.webview.postMessage({ type: "planStatus", text: "Gate実行中...（strict-clean前提）" });

        let run: RunRecord | null = null;
        try {
          run = await gateRunAndStore(context, repoRoot, state.featureKey, mode, timeoutSec);
        } catch (e) {
          const emsg = e instanceof Error ? e.message : String(e);
          const fs = classifyFailStep(emsg);
          await updateLast(null, fs);
          panel.webview.postMessage({ type: "planStatus", text: "失敗: " + emsg });
          return;
        }

        historyProvider.refresh();
        const fs = classifyFailStep(run.failLine);
        await updateLast(run, fs);

        // session record: append runId
        const sess = await ensureSessionLoaded();
        const runIds = Array.from(new Set([...(sess.runIds ?? []), run.id]));
        await saveSession(context, { ...sess, featureKey: state.featureKey, goal: state.goal, planText: state.planText, runIds });

        panel.webview.postMessage({
          type: "planStatus",
          text:
            (run.ok ? "Gate OK" : "Gate NG") +
            `\n- id: ${run.id}` +
            `\n- failLine: ${run.failLine ?? "（なし）"}` +
            `\n- meta: ${run.artifacts.metaJson}` +
            `\n- （Gateログは Run History / session に保存済み）`
        });

        await postHistory();
        await postChanges();
        return;
      }

      if (msg.type === "openTrouble") {
        await openTrouble();
        return;
      }
    } catch (e) {
      const emsg = e instanceof Error ? e.message : String(e);
      vscode.window.showErrorMessage(emsg);
    }
  });

  // initial
  await postHistory();
  await postChanges();
  if (state.lastRun) {
    const fs = classifyFailStep(state.lastRun.failLine);
    panel.webview.postMessage({
      type: "last",
      text: `${state.lastRun.createdAt} ${state.lastRun.ok ? "OK" : "NG"} ${state.lastRun.mode} ${state.lastRun.featureKey}（${state.lastRun.id}）`,
      failStep: fs
    });
  }
}
