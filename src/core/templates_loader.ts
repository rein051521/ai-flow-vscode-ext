import * as vscode from "vscode";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Buffer } from "node:buffer";

export type TemplateId = "codegen_ja" | "debug_ja";

export type FallbackPolicy = "prompt" | "deny" | "allow";

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

  const rawPolicy = cfg.get<string>("aiFlow.templates.fallbackPolicy") ?? "deny";
  const fallbackPolicy: FallbackPolicy =
    rawPolicy === "prompt" || rawPolicy === "deny" || rawPolicy === "allow"
      ? rawPolicy
      : "deny";

  // 1) canonical（workspace側）を最優先で読む
  const canon = await tryRead(canonicalFs);
  if (canon !== null) {
    return { ok: true, text: canon, from: `workspace:${canonical}` };
  }

  // 2) canonicalが無い場合の挙動（fail-closedが既定）
  if (fallbackPolicy === "deny") {
    return {
      ok: false,
      error:
        `テンプレ（正）が見つかりません。\n` +
        `workspace側: ${canonical}\n` +
        `設定 aiFlow.templates.fallbackPolicy=deny のため fallback を許可しません。`
    };
  }

  if (fallbackPolicy === "prompt") {
    const picked = await vscode.window.showWarningMessage(
      `テンプレ（正）が見つかりません。fallback（拡張機能内テンプレ）を使いますか？\n` +
        `workspace側: ${canonical}`,
      { modal: true },
      "使う",
      "中止"
    );
    if (picked !== "使う") {
      return {
        ok: false,
        error:
          `テンプレ（正）が見つからず、ユーザーが fallback を拒否しました。\n` +
          `workspace側: ${canonical}`
      };
    }
  }

  // 3) fallback（拡張機能内）
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
