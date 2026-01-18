"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const YAML = __importStar(require("yaml"));
const schema_1 = require("./core/schema");
const fs_1 = require("./core/fs");
const git_1 = require("./core/git");
const process_1 = require("./core/process");
const ui_1 = require("./webview/ui");
function nowIso() {
    return new Date().toISOString();
}
async function pickOne(title, items, placeHolder) {
    const picked = await vscode.window.showQuickPick(items.map((i) => ({ label: i.label, description: i.description, value: i.value })), { title, placeHolder });
    return picked?.value;
}
async function input(title, prompt, value) {
    return await vscode.window.showInputBox({ title, prompt, value });
}
function estimateTokens(s) {
    return Math.ceil(s.length / 4);
}
async function getWorkspaceRoot() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0)
        throw new Error("No workspace folder");
    return folders[0].uri.fsPath;
}
async function runWizard(existing) {
    const projectKind = await pickOne("AI Flow: 種別", [
        { label: "新規 (New)", value: "new", description: "要件→タスク→実装" },
        { label: "変更 (Change)", value: "change", description: "既存の改善/拡張" },
        { label: "バグ修正 (Bugfix)", value: "bugfix", description: "不具合修正" },
        { label: "リファクタ (Refactor)", value: "refactor", description: "挙動維持で内部改善" },
    ]);
    if (!projectKind)
        return;
    const featureKey = await input("AI Flow: featureKey", "例: hello_feature / lot-trace-v2", existing?.featureKey);
    if (!featureKey)
        return;
    const goal = await input("AI Flow: Goal", "何を成立させる？（必須）", existing?.goal);
    if (!goal)
        return;
    const filesRaw = await input("AI Flow: Target Files", "対象ファイル（任意、カンマ区切り）", (existing?.targetFiles || []).join(", "));
    const targetFiles = (filesRaw || "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    try {
        (0, fs_1.safeBasename)(featureKey);
        schema_1.FeatureKeySchema.parse(featureKey);
        return schema_1.FlowStateSchema.parse({ featureKey, goal, projectKind, targetFiles });
    }
    catch (e) {
        const msg = e?.issues ? e.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("\n") : String(e);
        void vscode.window.showErrorMessage("入力が不正です。\n" + msg);
        return;
    }
}
const DefaultManifest = {
    schema_version: 1,
    canonical: {
        prompts: { codegen_ja: "docs/prompts/AI_FLOW_CODEGEN_JA.md", debug_ja: "docs/prompts/AI_FLOW_DEBUG_JA.md" },
        specs: {
            feature_spec: "docs/specs/FEATURE_SPEC.md",
            feature_tasks: "docs/specs/FEATURE_TASKS.yaml",
            feature_spec_template: "docs/specs/FEATURE_SPEC_TEMPLATE.md",
        },
    },
    fallback: {
        prompts: {
            codegen_ja: "resources/templates/CODEGEN_PROMPT_JA.md",
            debug_ja: "resources/templates/DEBUG_PROMPT_JA.md",
            review_checklist_ja: "resources/templates/REVIEW_CHECKLIST_JA.md",
        },
        specs: { feature_spec: "resources/templates/FEATURE_SPEC.md", feature_tasks_template_ja: "resources/templates/FEATURE_TASKS_TEMPLATE_JA.yaml" },
    },
};
async function loadManifest(workspaceRoot) {
    const manifestPath = path.join(workspaceRoot, "docs", "specs", "AI_FLOW_MANIFEST.json");
    const u = vscode.Uri.file(manifestPath);
    if (await (0, fs_1.exists)(u)) {
        try {
            const j = JSON.parse(await (0, fs_1.readText)(u));
            if (typeof j?.schema_version === "number" && j?.canonical?.prompts?.codegen_ja)
                return j;
        }
        catch {
            // fall through
        }
    }
    return DefaultManifest;
}
function uriInStorage(context, parts) {
    return vscode.Uri.file(path.join(context.globalStorageUri.fsPath, ...parts));
}
async function listEvidence(context, featureKey) {
    const base = uriInStorage(context, ["features", featureKey, "evidence"]);
    if (!(await (0, fs_1.exists)(base)))
        return [];
    const entries = await vscode.workspace.fs.readDirectory(base);
    return entries
        .filter(([_, t]) => t === vscode.FileType.Directory)
        .map(([name]) => ({ id: name, label: name }))
        .sort((a, b) => (a.label < b.label ? 1 : -1));
}
async function buildPreviews(workspaceRoot, manifest, state, context) {
    const errors = [];
    const specTmplU = vscode.Uri.file(path.join(workspaceRoot, manifest.canonical.specs.feature_spec_template));
    const tasksTmplU = vscode.Uri.file(path.join(workspaceRoot, "docs/specs/FEATURE_TASKS_TEMPLATE_JA.yaml"));
    const codegenTmplU = vscode.Uri.file(path.join(workspaceRoot, manifest.canonical.prompts.codegen_ja));
    const debugTmplU = vscode.Uri.file(path.join(workspaceRoot, manifest.canonical.prompts.debug_ja));
    const extRoot = context.extensionUri.fsPath;
    const fbCodegenU = vscode.Uri.file(path.join(extRoot, manifest.fallback.prompts.codegen_ja));
    const fbDebugU = vscode.Uri.file(path.join(extRoot, manifest.fallback.prompts.debug_ja));
    const fbReviewU = vscode.Uri.file(path.join(extRoot, manifest.fallback.prompts.review_checklist_ja));
    const fbSpecU = vscode.Uri.file(path.join(extRoot, manifest.fallback.specs.feature_spec));
    const fbTasksU = vscode.Uri.file(path.join(extRoot, manifest.fallback.specs.feature_tasks_template_ja));
    async function readOr(u, fallback, errCode) {
        if (await (0, fs_1.exists)(u))
            return await (0, fs_1.readText)(u);
        if (await (0, fs_1.exists)(fallback)) {
            errors.push({ code: errCode, message: `workspace missing: ${u.fsPath} -> fallback used` });
            return await (0, fs_1.readText)(fallback);
        }
        errors.push({ code: errCode, message: `missing: ${u.fsPath} (no fallback)` });
        return "";
    }
    const specTemplate = await readOr(specTmplU, fbSpecU, "TEMPLATE_SPEC");
    const tasksTemplate = await readOr(tasksTmplU, fbTasksU, "TEMPLATE_TASKS");
    const codegenTemplate = await readOr(codegenTmplU, fbCodegenU, "TEMPLATE_CODEGEN");
    const debugTemplate = await readOr(debugTmplU, fbDebugU, "TEMPLATE_DEBUG");
    const reviewChecklist = await readOr(fbReviewU, fbReviewU, "TEMPLATE_REVIEW");
    const spec = specTemplate.replaceAll("<FEATURE_ID>", state.featureKey);
    let tasksText = tasksTemplate;
    tasksText = tasksText.replaceAll("TEMPLATE_ID", state.featureKey);
    tasksText = tasksText.replaceAll("TEMPLATE_TITLE", state.goal);
    tasksText = tasksText.replaceAll("TEMPLATE_DETAIL_1", "TODO: 具体タスクを列挙（AI Flow UIで編集）");
    try {
        const obj = YAML.parse(tasksText);
        schema_1.TasksYamlSchema.parse(obj);
    }
    catch (e) {
        errors.push({ code: "SCHEMA_TASKS", message: `Tasks YAML invalid: ${String(e)}` });
    }
    const header = `\n\n---\n\n# AI Flow Context\n` +
        `featureKey: ${state.featureKey}\n` +
        `projectKind: ${state.projectKind}\n` +
        `goal: ${state.goal}\n` +
        `targetFiles:\n` +
        `${state.targetFiles.map((s) => "  - " + s).join("\n") || "  - (none)"}\n`;
    const codegen = codegenTemplate +
        header +
        "\n\n## FEATURE_SPEC\n\n" +
        spec +
        "\n\n## FEATURE_TASKS\n\n```yaml\n" +
        tasksText +
        "\n```\n\n## REVIEW_CHECKLIST\n\n" +
        reviewChecklist +
        "\n";
    const debug = debugTemplate +
        header +
        "\n\n## FEATURE_SPEC\n\n" +
        spec +
        "\n\n## FEATURE_TASKS\n\n```yaml\n" +
        tasksText +
        "\n```\n";
    return { spec, tasks: tasksText, codegen, debug, errors };
}
async function writeArtifactsToStorage(context, state, previews) {
    const fk = state.featureKey;
    const base = uriInStorage(context, ["features", fk]);
    await (0, fs_1.ensureDir)(base);
    await (0, fs_1.writeText)(uriInStorage(context, ["features", fk, "feature_spec.md"]), previews.spec);
    await (0, fs_1.writeText)(uriInStorage(context, ["features", fk, "feature_tasks.yaml"]), previews.tasks);
    await (0, fs_1.writeText)(uriInStorage(context, ["features", fk, "prompt_codegen.md"]), previews.codegen);
    await (0, fs_1.writeText)(uriInStorage(context, ["features", fk, "prompt_debug.md"]), previews.debug);
    return base.fsPath;
}
async function runGate(context, repoRoot, state) {
    const ranAt = nowIso();
    const sessionId = ranAt.replace(/[:.]/g, "-") + "-" + (0, fs_1.sha256Hex)(String(Math.random())).slice(0, 8);
    const evDir = uriInStorage(context, ["features", state.featureKey, "evidence", sessionId]);
    await (0, fs_1.ensureDir)(evDir);
    const diff = await (0, git_1.gitDiffNameOnly)(repoRoot);
    await (0, fs_1.writeText)(vscode.Uri.file(path.join(evDir.fsPath, "diff-name-only.txt")), diff);
    const pyCmd = vscode.workspace.getConfiguration("aiFlow").get("pythonCommand") || "py";
    const pyArgs = vscode.workspace.getConfiguration("aiFlow").get("pythonArgs") || ["-3.12"];
    const args = [...pyArgs, "scripts/validate_repo.py", "--mode", "full", "--strict-clean"];
    const res = await (0, process_1.execCapture)(pyCmd, args, repoRoot);
    await (0, fs_1.writeText)(vscode.Uri.file(path.join(evDir.fsPath, "validate_repo.log")), res.stdout);
    await (0, fs_1.writeText)(vscode.Uri.file(path.join(evDir.fsPath, "exit_code.txt")), String(res.exitCode));
    const m = res.stdout.match(/^FAIL\([^\n]+\):.*$/m);
    const failLine = m?.[0];
    if (failLine)
        await (0, fs_1.writeText)(vscode.Uri.file(path.join(evDir.fsPath, "fail_line.txt")), failLine);
    const meta = {
        ranAt,
        repoRoot,
        featureKey: state.featureKey,
        exitCode: res.exitCode,
        ok: res.exitCode === 0,
        failLine: failLine || null,
    };
    await (0, fs_1.writeText)(vscode.Uri.file(path.join(evDir.fsPath, "run.json")), JSON.stringify(meta, null, 2));
    return { ok: res.exitCode === 0, exitCode: res.exitCode, ranAt, evidenceId: sessionId, failLine };
}
async function exportToRepo(context, repoRoot, state) {
    const dest = path.join(repoRoot, "docs", "work", state.featureKey);
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(dest));
    const base = uriInStorage(context, ["features", state.featureKey]);
    const pairs = [
        ["feature_spec.md", "feature_spec.md"],
        ["feature_tasks.yaml", "feature_tasks.yaml"],
        ["prompt_codegen.md", "prompt_codegen.md"],
        ["prompt_debug.md", "prompt_debug.md"],
    ];
    for (const [src, dst] of pairs) {
        const su = vscode.Uri.file(path.join(base.fsPath, src));
        if (await (0, fs_1.exists)(su)) {
            const du = vscode.Uri.file(path.join(dest, dst));
            const b = await vscode.workspace.fs.readFile(su);
            await vscode.workspace.fs.writeFile(du, b);
        }
    }
}
function buildUiState(state, storagePath, previews, evidence, errors, lastGate) {
    return {
        featureKey: state.featureKey,
        storagePath,
        lastGate,
        previews: { spec: previews.spec, tasks: previews.tasks, codegen: previews.codegen, debug: previews.debug },
        tokenEstimates: { codegen: estimateTokens(previews.codegen), debug: estimateTokens(previews.debug) },
        evidence,
        errors,
    };
}
function activate(context) {
    const cmd = vscode.commands.registerCommand("aiFlow.open", async () => {
        try {
            if (!vscode.workspace.isTrusted) {
                void vscode.window.showWarningMessage("未信頼ワークスペースのため停止（Workspace Trust）。信頼後に再実行してください。");
                return;
            }
            const workspaceRoot = await getWorkspaceRoot();
            const repoRoot = await (0, git_1.gitRoot)(workspaceRoot);
            const nested = await (0, git_1.scanNestedGitDirs)(workspaceRoot);
            if (nested.length) {
                void vscode.window.showErrorMessage("ネストした .git を検知したため停止。\n" + nested.join("\n"));
                return;
            }
            const missing = await (0, git_1.ensureRequiredFiles)(repoRoot);
            if (missing.length) {
                void vscode.window.showErrorMessage("必要ファイル不足のため停止。\n" + missing.join("\n"));
                return;
            }
            const state = await runWizard();
            if (!state)
                return;
            (0, fs_1.safeBasename)(state.featureKey);
            const manifest = await loadManifest(repoRoot);
            const previews = await buildPreviews(repoRoot, manifest, state, context);
            const storagePath = await writeArtifactsToStorage(context, state, previews);
            const evidence = await listEvidence(context, state.featureKey);
            const panel = vscode.window.createWebviewPanel("aiFlowWizard", `AI Flow: ${state.featureKey}`, vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
            let lastGate;
            function render() {
                panel.webview.html = (0, ui_1.renderHtml)(buildUiState(state, storagePath, previews, evidence, previews.errors, lastGate));
            }
            panel.webview.onDidReceiveMessage(async (msg) => {
                const command = msg?.command;
                try {
                    if (command === "generate") {
                        const next = await buildPreviews(repoRoot, manifest, state, context);
                        previews.spec = next.spec;
                        previews.tasks = next.tasks;
                        previews.codegen = next.codegen;
                        previews.debug = next.debug;
                        previews.errors = next.errors;
                        await writeArtifactsToStorage(context, state, previews);
                        const ev = await listEvidence(context, state.featureKey);
                        evidence.splice(0, evidence.length, ...ev);
                        render();
                        return;
                    }
                    if (command === "runGate") {
                        if (!(await (0, git_1.isWorkspaceClean)(repoRoot))) {
                            void vscode.window.showErrorMessage("repo が dirty のため Gate を停止（strict-clean衝突回避）。先にコミット/破棄してください。");
                            return;
                        }
                        const r = await runGate(context, repoRoot, state);
                        lastGate = { ok: r.ok, exitCode: r.exitCode, ranAt: r.ranAt };
                        const ev = await listEvidence(context, state.featureKey);
                        evidence.splice(0, evidence.length, ...ev);
                        render();
                        return;
                    }
                    if (command === "copyCodegen") {
                        await vscode.env.clipboard.writeText(previews.codegen);
                        void vscode.window.showInformationMessage("Codegen prompt をコピーしました。");
                        return;
                    }
                    if (command === "copyDebug") {
                        await vscode.env.clipboard.writeText(previews.debug);
                        void vscode.window.showInformationMessage("Debug prompt をコピーしました。");
                        return;
                    }
                    if (command === "export") {
                        const ok = await vscode.window.showWarningMessage("Export は repo を dirty にする可能性があります。続行しますか？（続行後はコミットまたは破棄が必要）", { modal: true }, "続行");
                        if (ok !== "続行")
                            return;
                        await exportToRepo(context, repoRoot, state);
                        void vscode.window.showInformationMessage("Export 完了: docs/work/" + state.featureKey);
                        return;
                    }
                    if (command === "openEvidence") {
                        const id = String(msg?.payload?.id || "");
                        const evDir = uriInStorage(context, ["features", state.featureKey, "evidence", id]);
                        const logU = vscode.Uri.file(path.join(evDir.fsPath, "validate_repo.log"));
                        if (await (0, fs_1.exists)(logU)) {
                            const doc = await vscode.workspace.openTextDocument(logU);
                            await vscode.window.showTextDocument(doc, { preview: false });
                        }
                        else {
                            void vscode.window.showErrorMessage("Evidence が見つかりません: " + id);
                        }
                        return;
                    }
                }
                catch (e) {
                    void vscode.window.showErrorMessage("AI Flow error: " + String(e?.message || e));
                }
            });
            render();
        }
        catch (e) {
            void vscode.window.showErrorMessage("AI Flow fatal: " + String(e?.message || e));
        }
    });
    context.subscriptions.push(cmd);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map