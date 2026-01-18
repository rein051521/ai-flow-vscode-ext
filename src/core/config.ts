import * as vscode from "vscode";
import { DEFAULTS } from "./constants";

export interface FlowConfig {
  pythonPath: string;
  validateScript: string;
  guardScript: string;
  strictClean: boolean;
}

export function getConfig(): FlowConfig {
  const cfg = vscode.workspace.getConfiguration("aiFlow");
  return {
    pythonPath: cfg.get<string>("pythonPath", DEFAULTS.pythonPath),
    validateScript: cfg.get<string>("validateScript", DEFAULTS.validateScript),
    guardScript: cfg.get<string>("guardScript", DEFAULTS.guardScript),
    strictClean: cfg.get<boolean>("strictClean", DEFAULTS.strictClean),
  };
}
