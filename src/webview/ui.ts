export type UiError = { code: string; message: string };

export type UiEvidenceItem = { id: string; label: string };

export type UiState = {
  featureKey: string;
  storagePath: string;
  lastGate?: { ok: boolean; exitCode: number; ranAt: string };
  previews: { spec: string; tasks: string; codegen: string; debug: string };
  tokenEstimates: { codegen: number; debug: number };
  evidence: UiEvidenceItem[];
  errors: UiError[];
};

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

export function renderHtml(state: UiState): string {
  const last = state.lastGate
    ? `${state.lastGate.ok ? "PASS" : "FAIL"} (exit ${state.lastGate.exitCode}) @ ${escapeHtml(state.lastGate.ranAt)}`
    : "(not run yet)";

  const errorTable = state.errors.length
    ? `<table>
        <thead><tr><th>code</th><th>message</th></tr></thead>
        <tbody>
          ${state.errors.map((e) => `<tr><td>${escapeHtml(e.code)}</td><td>${escapeHtml(e.message)}</td></tr>`).join("\n")}
        </tbody>
      </table>`
    : "";

  const evidenceList = state.evidence.length
    ? `<ul>
        ${state.evidence.map((it) => `<li><a href="#" data-evid="${escapeHtml(it.id)}">${escapeHtml(it.label)}</a></li>`).join("\n")}
      </ul>`
    : "(none)";

  const tabButton = (id: string, label: string, active: boolean) =>
    `<button class="tabbtn${active ? " active" : ""}" data-tab="${id}">${escapeHtml(label)}</button>`;

  const tabPanel = (id: string, content: string, active: boolean) =>
    `<div class="tabpanel${active ? " active" : ""}" id="tab-${id}"><pre>${escapeHtml(content)}</pre></div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI Flow</title>
  <style>
    body { font-family: var(--vscode-font-family); padding: 12px; }
    .row { display: flex; gap: 12px; flex-wrap: wrap; }
    .card { border: 1px solid var(--vscode-editorWidget-border); border-radius: 10px; padding: 12px; flex: 1; min-width: 320px; }
    .muted { color: var(--vscode-descriptionForeground); }
    button { padding: 8px 12px; border-radius: 8px; border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-background); color: var(--vscode-button-foreground); cursor: pointer; }
    button.secondary { background: transparent; color: var(--vscode-foreground); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
    .tabbtn { background: transparent; color: var(--vscode-foreground); border: 1px solid var(--vscode-editorWidget-border); }
    .tabbtn.active { background: var(--vscode-editorWidget-background); }
    .tabpanel { display: none; }
    .tabpanel.active { display: block; }
    pre { white-space: pre-wrap; word-wrap: break-word; background: var(--vscode-editor-background); border: 1px solid var(--vscode-editorWidget-border); border-radius: 10px; padding: 10px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid var(--vscode-editorWidget-border); padding: 6px; text-align: left; }
    h2 { margin-top: 0; }
  </style>
</head>
<body>
  <div class="row">
    <div class="card">
      <h2>Session</h2>
      <div><span class="muted">featureKey</span>: <strong>${escapeHtml(state.featureKey)}</strong></div>
      <div><span class="muted">storage</span>: <code>${escapeHtml(state.storagePath)}</code></div>
      <div><span class="muted">last gate</span>: <strong>${last}</strong></div>
      <div class="muted" style="margin-top:8px;">token estimate: codegen=${state.tokenEstimates.codegen}, debug=${state.tokenEstimates.debug}</div>
      <div style="margin-top: 12px; display:flex; gap: 8px; flex-wrap: wrap;">
        <button id="btn-generate">Generate</button>
        <button id="btn-gate">Run Gate</button>
        <button id="btn-copy-codegen" class="secondary">Copy Codegen</button>
        <button id="btn-copy-debug" class="secondary">Copy Debug</button>
        <button id="btn-export" class="secondary">Export</button>
      </div>
      <div class="muted" style="margin-top: 8px;">Export writes into the workspace and may make it dirty.</div>
    </div>

    <div class="card">
      <h2>Errors</h2>
      ${errorTable || "(none)"}
    </div>
  </div>

  <div class="row" style="margin-top: 12px;">
    <div class="card">
      <h2>Preview</h2>
      <div class="tabs">
        ${tabButton("spec", "Spec", true)}
        ${tabButton("tasks", "Tasks", false)}
        ${tabButton("codegen", "Codegen", false)}
        ${tabButton("debug", "Debug", false)}
      </div>
      ${tabPanel("spec", state.previews.spec, true)}
      ${tabPanel("tasks", state.previews.tasks, false)}
      ${tabPanel("codegen", state.previews.codegen, false)}
      ${tabPanel("debug", state.previews.debug, false)}
    </div>

    <div class="card">
      <h2>Evidence Pack</h2>
      ${evidenceList}
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function post(command, payload) {
      vscode.postMessage({ command, payload });
    }

    for (const btn of document.querySelectorAll('.tabbtn')) {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-tab');
        for (const b of document.querySelectorAll('.tabbtn')) b.classList.toggle('active', b === btn);
        for (const p of document.querySelectorAll('.tabpanel')) p.classList.toggle('active', p.id === 'tab-' + id);
      });
    }

    document.getElementById('btn-generate').addEventListener('click', () => post('generate'));
    document.getElementById('btn-gate').addEventListener('click', () => post('runGate'));
    document.getElementById('btn-copy-codegen').addEventListener('click', () => post('copyCodegen'));
    document.getElementById('btn-copy-debug').addEventListener('click', () => post('copyDebug'));
    document.getElementById('btn-export').addEventListener('click', () => post('export'));

    for (const a of document.querySelectorAll('a[data-evid]')) {
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        post('openEvidence', { id: a.getAttribute('data-evid') });
      });
    }
  </script>
</body>
</html>`;
}
