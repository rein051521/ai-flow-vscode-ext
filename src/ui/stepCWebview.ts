import * as vscode from "vscode";
import { validateFeatureKey } from "../core/featureKey";
import { loadTemplateText } from "../core/templates_loader";
import { gateRunAndStore, listHistory, RunRecord, GateMode } from "../core/evidence_store";
import { RunHistoryTreeDataProvider } from "./runHistoryTree";
import { gitDiffNameOnly, gitStatusPorcelain } from "../core/git";

type UiState = {
  repoRoot: string;
  featureKey: string;
  mode: GateMode;
  timeoutSec: number;
  lastRun: RunRecord | null;
};

type PersistedState = {
  featureKey: string;
  mode: GateMode;
  timeoutSec: number;
  lastRunId: string | null;
};

const GS_KEY = "aiFlow.stepC.state.v1";

function nonce(): string {
  return Math.random().toString(36).slice(2);
}

function renderHtml(webview: vscode.Webview, state: UiState): string {
  const n = nonce();
  const csp = `default-src 'none'; img-src ${webview.cspSource} https:; style-src ${webview.cspSource} 'nonce-${n}'; script-src 'nonce-${n}';`;

  const lastRunId = state.lastRun?.id ?? "";
  const lastFailLine = state.lastRun?.failLine ?? "";

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style nonce="${n}">
    body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; margin: 12px; }
    .row { display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end; }
    .field { display:flex; flex-direction:column; gap:4px; min-width: 260px; }
    input, select { padding: 6px 8px; }
    button { padding: 8px 10px; }
    .tabs { display:flex; gap:8px; margin-top:12px; }
    .tab { cursor:pointer; padding:6px 10px; border:1px solid #8884; border-bottom:none; }
    .tab.active { background:#8882; }
    .panel { border:1px solid #8884; padding:10px; }
    pre { white-space: pre-wrap; word-break: break-word; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #8884; padding: 6px; font-size: 12px; }
    .ok { font-weight: 700; }
    .ng { font-weight: 700; }
    .muted { opacity: 0.8; }
    .err { color: #b00020; }
  </style>
</head>
<body>
  <h2>AI Flow Step C</h2>

  <div class="row">
    <div class="field">
      <label>Repo Root</label>
      <input id="repoRoot" value="${state.repoRoot}" readonly />
    </div>
    <div class="field">
      <label>featureKey（slug）</label>
      <input id="featureKey" value="${state.featureKey}" placeholder="例: my-feature-1" />
    </div>
    <div class="field">
      <label>mode</label>
      <select id="mode">
        <option value="docs"${state.mode === "docs" ? " selected" : ""}>docs</option>
        <option value="full"${state.mode === "full" ? " selected" : ""}>full</option>
      </select>
    </div>
    <div class="field">
      <label>timeoutSec</label>
      <input id="timeoutSec" type="number" min="30" value="${state.timeoutSec}" />
    </div>
  </div>

  <div class="row" style="margin-top:10px;">
    <button id="btnGate">Run Gate</button>
    <button id="btnCodegen">Copy Codegen Prompt</button>
    <button id="btnDebug">Copy Debug Prompt</button>
    <button id="btnExport">Export Prompts</button>
    <span class="muted" id="status"></span>
  </div>

  <div class="tabs">
    <div class="tab active" data-tab="summary">Summary</div>
    <div class="tab" data-tab="diff">Diff</div>
    <div class="tab" data-tab="history">Run History</div>
    <div class="tab" data-tab="log">Last Gate (FAIL)</div>
  </div>

  <div class="panel" id="panel-summary">
    <div>lastRunId: <span id="lastRunId">${lastRunId}</span></div>
    <div>lastFailLine: <span id="lastFailLine">${lastFailLine}</span></div>
    <div class="muted">Evidenceは repo外（VS Code globalStorage）に保存します。</div>
    <div id="errors" class="err" style="margin-top:10px;"></div>
  </div>

  <div class="panel" id="panel-diff" style="display:none;">
    <pre id="diffText">(loading...)</pre>
  </div>

  <div class="panel" id="panel-history" style="display:none;">
    <table>
      <thead>
        <tr>
          <th>createdAt</th>
          <th>id</th>
          <th>mode</th>
          <th>featureKey</th>
          <th>ok</th>
          <th>open</th>
        </tr>
      </thead>
      <tbody id="historyBody"></tbody>
    </table>
  </div>

  <div class="panel" id="panel-log" style="display:none;">
    <pre id="failText"></pre>
  </div>

<script nonce="${n}">
  const vscode = acquireVsCodeApi();

  function setStatus(s) { document.getElementById('status').textContent = s; }
  function setErrors(lines) {
    const el = document.getElementById('errors');
    el.textContent = lines && lines.length ? ("入力エラー:\n- " + lines.join("\n- ")) : "";
  }
  function getInputs() {
    return {
      featureKey: document.getElementById('featureKey').value,
      mode: document.getElementById('mode').value,
      timeoutSec: Number(document.getElementById('timeoutSec').value || 0)
    };
  }

  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      const tab = t.getAttribute('data-tab');
      document.getElementById('panel-summary').style.display = tab === 'summary' ? '' : 'none';
      document.getElementById('panel-diff').style.display = tab === 'diff' ? '' : 'none';
      document.getElementById('panel-history').style.display = tab === 'history' ? '' : 'none';
      document.getElementById('panel-log').style.display = tab === 'log' ? '' : 'none';
      if (tab === 'diff') vscode.postMessage({ type: 'requestDiff' });
      if (tab === 'history') vscode.postMessage({ type: 'requestHistory' });
    });
  });

  document.getElementById('btnGate').addEventListener('click', () => {
    const i = getInputs();
    vscode.postMessage({ type: 'runGate', ...i });
  });
  document.getElementById('btnCodegen').addEventListener('click', () => {
    const i = getInputs();
    vscode.postMessage({ type: 'copyCodegen', ...i });
  });
  document.getElementById('btnDebug').addEventListener('click', () => {
    const i = getInputs();
    vscode.postMessage({ type: 'copyDebug', ...i });
  });
  document.getElementById('btnExport').addEventListener('click', () => {
    const i = getInputs();
    vscode.postMessage({ type: 'exportPrompts', ...i });
  });

  window.addEventListener('message', (ev) => {
    const msg = ev.data;
    if (msg.type === 'status') setStatus(msg.text);
    if (msg.type === 'errors') setErrors(msg.errors || []);
    if (msg.type === 'diff') document.getElementById('diffText').textContent = msg.text || '';
    if (msg.type === 'history') {
      const body = document.getElementById('historyBody');
      body.innerHTML = '';
      (msg.runs || []).forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + (r.createdAt || '') + '</td>' +
          '<td>' + (r.id || '') + '</td>' +
          '<td>' + (r.mode || '') + '</td>' +
          '<td>' + (r.featureKey || '') + '</td>' +
          '<td>' + (r.ok ? '<span class="ok">OK</span>' : '<span class="ng">NG</span>') + '</td>' +
          '<td>' +
            '<button data-open="meta" data-id="' + r.id + '">meta</button> ' +
            '<button data-open="stdout" data-id="' + r.id + '">stdout</button> ' +
            '<button data-open="stderr" data-id="' + r.id + '">stderr</button> ' +
            '<button data-open="diff" data-id="' + r.id + '">diff</button>' +
          '</td>';
        body.appendChild(tr);
      });
      body.querySelectorAll('button[data-open]').forEach(b => {
        b.addEventListener('click', () => {
          vscode.postMessage({ type: 'openEvidence', id: b.getAttribute('data-id'), which: b.getAttribute('data-open') });
        });
      });
    }
    if (msg.type === 'lastRun') {
      document.getElementById('lastRunId').textContent = msg.lastRunId || '';
      document.getElementById('lastFailLine').textContent = msg.lastFailLine || '';
      document.getElementById('failText').textContent = msg.failText || '';
    }
  });

  vscode.postMessage({ type: 'requestInit' });
</script>
</body>
</html>`;
}

async function persist(context: vscode.ExtensionContext, st: PersistedState): Promise<void> {
  await context.globalState.update(GS_KEY, st);
}

function loadPersisted(context: vscode.ExtensionContext): PersistedState | null {
  const v = context.globalState.get<PersistedState>(GS_KEY);
  return v ?? null;
}

async function ensureDir(uri: vscode.Uri): Promise<void> {
  await vscode.workspace.fs.createDirectory(uri);
}

async function writeText(uri: vscode.Uri, text: string): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(text, "utf-8"));
}

function tsId(): string {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

export async function openStepCWebview(
  context: vscode.ExtensionContext,
  repoRoot: string,
  historyProvider: RunHistoryTreeDataProvider
): Promise<void> {
  const cfg = vscode.workspace.getConfiguration();

  const persisted = loadPersisted(context);

  const initMode = (cfg.get<string>("aiFlow.defaultMode") as GateMode) ?? "full";
  const initTimeout = Math.max(30, cfg.get<number>("aiFlow.gate.timeoutSec") ?? 900);

  let lastRun: RunRecord | null = null;
  if (persisted?.lastRunId) {
    const runs = await listHistory(context);
    lastRun = runs.find((r) => r.id === persisted.lastRunId) ?? null;
  }

  const state: UiState = {
    repoRoot,
    featureKey: persisted?.featureKey ?? "",
    mode: persisted?.mode ?? initMode,
    timeoutSec: persisted?.timeoutSec ?? initTimeout,
    lastRun
  };

  const panel = vscode.window.createWebviewPanel(
    "aiFlow.stepC",
    "AI Flow Step C",
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  panel.webview.html = renderHtml(panel.webview, state);

  const postStatus = (text: string) => panel.webview.postMessage({ type: "status", text });

  async function postDiff(): Promise<void> {
    const diff = await gitDiffNameOnly(repoRoot, 10_000);
    panel.webview.postMessage({ type: "diff", text: diff || "(no diff)" });
  }

  async function postHistory(): Promise<void> {
    const runs = await listHistory(context);
    panel.webview.postMessage({ type: "history", runs });
  }

  async function openFile(fsPath: string): Promise<void> {
    const uri = vscode.Uri.file(fsPath);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: false });
  }

  async function updateLastRun(run: RunRecord): Promise<void> {
    state.lastRun = run;
    await persist(context, {
      featureKey: state.featureKey,
      mode: state.mode,
      timeoutSec: state.timeoutSec,
      lastRunId: run.id
    });

    panel.webview.postMessage({
      type: "lastRun",
      lastRunId: run.id,
      lastFailLine: run.failLine ?? "",
      failText:
        "runDir: " +
        run.artifacts.runDir +
        "\n" +
        "meta: " +
        run.artifacts.metaJson +
        "\n" +
        "stdout: " +
        run.artifacts.stdoutTxt +
        "\n" +
        "stderr: " +
        run.artifacts.stderrTxt +
        "\n" +
        "diff: " +
        run.artifacts.diffNameOnlyTxt +
        "\n" +
        (run.failLine ? `\nFAIL: ${run.failLine}` : "")
    });
  }

  async function dirtyWarningIfNeeded(): Promise<boolean> {
    const st = await gitStatusPorcelain(repoRoot, 10_000);
    if (st.trim() === "") return true;
    const pick = await vscode.window.showWarningMessage(
      "作業ツリーがdirtyです。ここから先は実行せず、まず git status を空にしてください（strict-clean前提）。",
      { modal: true },
      "OK"
    );
    return Boolean(pick);
  }

  panel.webview.onDidReceiveMessage(async (msg) => {
    try {
      if (msg.type === "requestInit") {
        await postDiff();
        await postHistory();
        if (state.lastRun) await updateLastRun(state.lastRun);
        return;
      }
      if (msg.type === "requestDiff") {
        await postDiff();
        return;
      }
      if (msg.type === "requestHistory") {
        await postHistory();
        return;
      }

      if (msg.type === "openEvidence") {
        const runs = await listHistory(context);
        const r = runs.find((x) => x.id === msg.id);
        if (!r) throw new Error(`run not found: ${msg.id}`);
        if (msg.which === "meta") return await openFile(r.artifacts.metaJson);
        if (msg.which === "stdout") return await openFile(r.artifacts.stdoutTxt);
        if (msg.which === "stderr") return await openFile(r.artifacts.stderrTxt);
        if (msg.which === "diff") return await openFile(r.artifacts.diffNameOnlyTxt);
        return;
      }

      const featureKey = String(msg.featureKey ?? "").trim();
      const mode: GateMode = String(msg.mode ?? "full") === "docs" ? "docs" : "full";
      const timeoutSec = Math.max(30, Number(msg.timeoutSec ?? 0) || 0);

      state.featureKey = featureKey;
      state.mode = mode;
      state.timeoutSec = timeoutSec;
      await persist(context, { featureKey, mode, timeoutSec, lastRunId: state.lastRun?.id ?? null });

      const errs = validateFeatureKey(featureKey);
      if (timeoutSec <= 0) errs.push("timeoutSec が不正です。");
      if (errs.length) {
        panel.webview.postMessage({ type: "errors", errors: errs });
        return;
      }
      panel.webview.postMessage({ type: "errors", errors: [] });

      if (msg.type === "runGate") {
        await dirtyWarningIfNeeded();
        const st = await gitStatusPorcelain(repoRoot, 10_000);
        if (st.trim() !== "") {
          panel.webview.postMessage({
            type: "errors",
            errors: ["作業ツリーがdirtyのため Gate 実行を停止（strict-clean前提）。まず git status を空にしてください。"]
          });
          return;
        }

        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: "AI Flow: Running gate...", cancellable: false },
          async () => {
            postStatus("Running gate...");
            const rec: RunRecord = await gateRunAndStore(context, repoRoot, featureKey, mode, timeoutSec);
            historyProvider.refresh();
            await postHistory();
            await postDiff();
            await updateLastRun(rec);
            postStatus(rec.ok ? "Gate OK" : "Gate NG");
          }
        );
        return;
      }

      const last = state.lastRun;

      if (msg.type === "copyCodegen") {
        const t = await loadTemplateText("codegen_ja", repoRoot, context);
        if (!t.ok) throw new Error(t.error);

        const text =
          `${t.text.trimEnd()}\n\n` +
          `---\n` +
          `## 実行コンテキスト（拡張が自動付与）\n` +
          `- featureKey: ${featureKey}\n` +
          `- mode: ${mode}\n` +
          `- 変更のたびに git diff --name-only を貼る\n` +
          `- 最終ゲート: .\\.venv\\Scripts\\python scripts\\validate_repo.py --mode ${mode} --strict-clean\n`;

        await vscode.env.clipboard.writeText(text);
        postStatus(`Copied Codegen Prompt (${t.from})`);
        return;
      }

      if (msg.type === "copyDebug") {
        const t = await loadTemplateText("debug_ja", repoRoot, context);
        if (!t.ok) throw new Error(t.error);

        const fail = last?.failLine ?? "(no last FAIL line)";
        const ev =
          last
            ? `- evidence.runDir: ${last.artifacts.runDir}\n- evidence.meta: ${last.artifacts.metaJson}\n- evidence.stdout: ${last.artifacts.stdoutTxt}\n- evidence.stderr: ${last.artifacts.stderrTxt}\n- evidence.diff: ${last.artifacts.diffNameOnlyTxt}\n`
            : "- evidence: (no last run)\n";

        const text =
          `${t.text.trimEnd()}\n\n` +
          `---\n` +
          `## デバッグ対象（拡張が自動付与）\n` +
          `- featureKey: ${featureKey}\n` +
          `- mode: ${mode}\n` +
          `- lastRunId: ${last?.id ?? "(none)"}\n` +
          `- lastFailLine: ${fail}\n` +
          ev +
          `- まず gate を再実行して FAIL 行を再現し、推測で直さない\n`;

        await vscode.env.clipboard.writeText(text);
        postStatus(`Copied Debug Prompt (${t.from})`);
        return;
      }

      if (msg.type === "exportPrompts") {
        const ok = await dirtyWarningIfNeeded();
        if (!ok) return;

        const t1 = await loadTemplateText("codegen_ja", repoRoot, context);
        const t2 = await loadTemplateText("debug_ja", repoRoot, context);
        if (!t1.ok) throw new Error(t1.error);
        if (!t2.ok) throw new Error(t2.error);

        const fail = last?.failLine ?? "(no last FAIL line)";
        const ev =
          last
            ? `evidence.runDir=${last.artifacts.runDir}\nmeta=${last.artifacts.metaJson}\nstdout=${last.artifacts.stdoutTxt}\nstderr=${last.artifacts.stderrTxt}\ndiff=${last.artifacts.diffNameOnlyTxt}\n`
            : "evidence=(no last run)\n";

        const codegenText =
          `${t1.text.trimEnd()}\n\n---\n` +
          `featureKey=${featureKey}\nmode=${mode}\ntimeoutSec=${timeoutSec}\n` +
          `finalGate=.\\.venv\\Scripts\\python scripts\\validate_repo.py --mode ${mode} --strict-clean\n`;

        const debugText =
          `${t2.text.trimEnd()}\n\n---\n` +
          `featureKey=${featureKey}\nmode=${mode}\nlastRunId=${last?.id ?? "(none)"}\nlastFailLine=${fail}\n` +
          ev;

        const exportsDir = vscode.Uri.joinPath(context.globalStorageUri, "ai-flow", "exports");
        await ensureDir(exportsDir);

        const baseId = tsId();
        const codegenUri = vscode.Uri.joinPath(exportsDir, `${baseId}_codegen.txt`);
        const debugUri = vscode.Uri.joinPath(exportsDir, `${baseId}_debug.txt`);
        await writeText(codegenUri, codegenText);
        await writeText(debugUri, debugText);

        await openFile(codegenUri.fsPath);
        await openFile(debugUri.fsPath);

        postStatus("Exported prompts (globalStorage)");
        return;
      }
    } catch (e) {
      const msgText = e instanceof Error ? e.message : String(e);
      panel.webview.postMessage({ type: "errors", errors: [msgText] });
      postStatus("Error");
    }
  });
}
