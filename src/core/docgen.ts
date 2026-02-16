import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as vscode from "vscode";
import { Buffer } from "node:buffer";

async function tryRead(fsPath: string): Promise<string | null> {
  try {
    return await readFile(fsPath, { encoding: "utf-8" });
  } catch {
    return null;
  }
}

async function ensureDir(uri: vscode.Uri): Promise<void> {
  await vscode.workspace.fs.createDirectory(uri);
}

async function writeText(uri: vscode.Uri, text: string): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(text, "utf-8"));
}

function nowJstIso(): string {
  const d = new Date();
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().replace("Z", "+09:00");
}

export type DocGenResult = {
  ok: true;
  files: { featureSpec: string; featureTasks: string };
  usedTemplates: { specTemplate: string; tasksTemplate: string };
  generatedText: { featureSpec: string; featureTasks: string };
} | {
  ok: false;
  error: string;
};

export async function generateDocsFromTemplates(
  repoRoot: string,
  featureKey: string,
  goal: string,
  constraints: string,
  targetFiles: string[],
  acceptance: string[]
): Promise<DocGenResult> {
  const cfg = vscode.workspace.getConfiguration();

  const specTplRel =
    cfg.get<string>("aiFlow.docs.featureSpecTemplate") ?? "docs/specs/FEATURE_SPEC_TEMPLATE.md";
  const tasksTplRel =
    cfg.get<string>("aiFlow.docs.featureTasksTemplateJa") ?? "docs/specs/FEATURE_TASKS_TEMPLATE_JA.yaml";
  const outDirRel =
    cfg.get<string>("aiFlow.docs.outDir") ?? "docs/specs";

  const specTplFs = join(repoRoot, specTplRel);
  const tasksTplFs = join(repoRoot, tasksTplRel);

  const specTpl = await tryRead(specTplFs);
  const tasksTpl = await tryRead(tasksTplFs);

  if (specTpl === null) {
    return { ok: false, error: `テンプレが見つかりません: ${specTplRel}` };
  }
  if (tasksTpl === null) {
    return { ok: false, error: `テンプレが見つかりません: ${tasksTplRel}` };
  }

  const targetLines = (targetFiles ?? []).map((s) => `- ${s}`);
  const acceptanceLines = (acceptance ?? []).map((s) => `- ${s}`);

  const header = [
    `<!-- generated-by: ai-flow-vscode-ext -->`,
    `<!-- generated-at: ${nowJstIso()} -->`,
    `<!-- featureKey: ${featureKey} -->`,
    ``,
    `# FEATURE_SPEC`,
    ``,
    `## featureKey`,
    `- ${featureKey}`,
    ``,
    `## goal`,
    `${goal.trim() ? goal.trim() : "（未入力）"}`,
    ``,
    `## constraints（Hard Constraints）`,
    `${constraints.trim() ? constraints.trim() : "（未入力）"}`,
    ``,
    `## targetFiles（Paths / Files）`,
    ...(targetLines.length ? targetLines : ["- （未入力）"]),
    ``,
    `## acceptance（受け入れ条件）`,
    ...(acceptanceLines.length ? acceptanceLines : ["- （未入力）"]),
    ``,
    `---`,
    ``
  ].join("\n");

  const outSpecRel = join(outDirRel, "FEATURE_SPEC.md").replace(/\\/g, "/");
  const outTasksRel = join(outDirRel, "FEATURE_TASKS.yaml").replace(/\\/g, "/");

  const outSpecUri = vscode.Uri.file(join(repoRoot, outSpecRel));
  const outTasksUri = vscode.Uri.file(join(repoRoot, outTasksRel));

  await ensureDir(vscode.Uri.file(join(repoRoot, outDirRel)));

  const outSpecText = header + specTpl.trimStart() + "\n";
  const tasksHeader = [
    `# generated-by: ai-flow-vscode-ext`,
    `# generated-at: ${nowJstIso()}`,
    `# featureKey: ${featureKey}`,
    `# goal: ${goal.trim() ? goal.trim().replace(/\r?\n/g, " ") : "（未入力）"}`,
    `# constraints: ${constraints.trim() ? constraints.trim().replace(/\r?\n/g, " ") : "（未入力）"}`,
    `# targetFiles: ${(targetFiles ?? []).join(", ") || "（未入力）"}`,
    `# acceptance: ${(acceptance ?? []).join(" | ") || "（未入力）"}`,
    ``
  ].join("\n");

  const outTasksText = tasksHeader + tasksTpl.trimStart() + "\n";

  await writeText(outSpecUri, outSpecText);
  await writeText(outTasksUri, outTasksText);

  return {
    ok: true,
    files: {
      featureSpec: outSpecUri.fsPath,
      featureTasks: outTasksUri.fsPath
    },
    usedTemplates: {
      specTemplate: specTplRel,
      tasksTemplate: tasksTplRel
    },
    generatedText: {
      featureSpec: outSpecText,
      featureTasks: outTasksText
    }
  };
}
