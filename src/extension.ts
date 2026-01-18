import * as vscode from "vscode";
import { openStepCWebview } from "./ui/stepCWebview";
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

  const open = async () => {
    const repoRoot = pickWorkspaceRoot();
    await openStepCWebview(context, repoRoot, historyProvider);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("aiFlow.open", open),
    vscode.commands.registerCommand("aiFlow.stepC", open)
  );
}

export function deactivate(): void {
  // no-op
}
