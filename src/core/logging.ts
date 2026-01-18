import * as vscode from "vscode";
import { OUTPUT_CHANNEL_NAME } from "./constants";

let channel: vscode.OutputChannel | undefined;

export function getChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  }
  return channel;
}

export function logLine(line: string): void {
  const ch = getChannel();
  ch.appendLine(line);
}

export function showChannel(preserveFocus = true): void {
  getChannel().show(preserveFocus);
}
