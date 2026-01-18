import * as vscode from "vscode";
import { listHistory, RunRecord } from "../core/evidence_store";

class RunItem extends vscode.TreeItem {
  constructor(public readonly run: RunRecord) {
    super(`${run.createdAt} ${run.ok ? "OK" : "NG"} ${run.mode} ${run.featureKey}`, vscode.TreeItemCollapsibleState.None);
    this.description = run.id;
    this.tooltip = `${run.id}\n${run.failLine ?? ""}`;
    this.command = {
      command: "vscode.open",
      title: "Open meta.json",
      arguments: [vscode.Uri.file(run.artifacts.metaJson)]
    };
  }
}

export class RunHistoryTreeDataProvider implements vscode.TreeDataProvider<RunItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: RunItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<RunItem[]> {
    const runs = await listHistory(this.context);
    return runs.slice(0, 50).map((r) => new RunItem(r));
  }
}
