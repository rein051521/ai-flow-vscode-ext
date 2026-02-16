import * as vscode from "vscode";
import { openStepCWebview } from "./ui/stepCWebview";
import { openFlowWebview } from "./ui/flowWebview";
import { RunHistoryTreeDataProvider } from "./ui/runHistoryTree";

function pickWorkspaceRoot(): string {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    throw new Error("ワークスペースが開かれていません。ai-dev-template ルートを開いてください。");
  }
  return folders[0].uri.fsPath;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const historyProvider = new RunHistoryTreeDataProvider(context);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("aiFlow.runHistory", historyProvider)
  );

  const openWizard = async () => {
    try {
      const repoRoot = pickWorkspaceRoot();
      await openFlowWebview(context, repoRoot, historyProvider);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      vscode.window.showErrorMessage(msg);
    }
  };

  const openStepC = async () => {
    try {
      const repoRoot = pickWorkspaceRoot();
      await openStepCWebview(context, repoRoot, historyProvider);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      vscode.window.showErrorMessage(msg);
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("aiFlow.open", openWizard),
    vscode.commands.registerCommand("aiFlow.stepC", openStepC)
  );
}

export function deactivate(): void {
  // no-op
}
