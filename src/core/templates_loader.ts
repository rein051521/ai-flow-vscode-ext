import * as vscode from "vscode";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type TemplateId = "codegen_ja" | "debug_ja";

async function tryRead(pathFs: string): Promise<string | null> {
  try {
    return await readFile(pathFs, { encoding: "utf-8" });
  } catch {
    return null;
  }
}

export async function loadTemplateText(
  templateId: TemplateId,
  repoRoot: string,
  context: vscode.ExtensionContext
): Promise<{ ok: true; text: string; from: string } | { ok: false; error: string }> {
  const cfg = vscode.workspace.getConfiguration();
  const canonCodegen = cfg.get<string>("aiFlow.templates.canonicalCodegenJa") ?? "docs/prompts/AI_FLOW_CODEGEN_JA.md";
  const canonDebug = cfg.get<string>("aiFlow.templates.canonicalDebugJa") ?? "docs/prompts/AI_FLOW_DEBUG_JA.md";

  const canonical = templateId === "codegen_ja" ? canonCodegen : canonDebug;
  const canonicalFs = join(repoRoot, canonical);

  const canon = await tryRead(canonicalFs);
  if (canon !== null) {
    return { ok: true, text: canon, from: `workspace:${canonical}` };
  }

  const fallbackRel =
    templateId === "codegen_ja"
      ? join("resources", "templates", "CODEGEN_PROMPT_JA.md")
      : join("resources", "templates", "DEBUG_PROMPT_JA.md");

  const fallbackUri = vscode.Uri.joinPath(context.extensionUri, fallbackRel);
  try {
    const bytes = await vscode.workspace.fs.readFile(fallbackUri);
    const text = Buffer.from(bytes).toString("utf-8");
    return { ok: true, text, from: `extension:${fallbackRel}` };
  } catch {
    return {
      ok: false,
      error: `テンプレが見つかりません。workspace側: ${canonical} / fallback側: ${fallbackRel}`
    };
  }
}
