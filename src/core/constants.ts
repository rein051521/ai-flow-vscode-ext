export const EXT_ID = "ai-flow";
export const OUTPUT_CHANNEL_NAME = "AI Flow";
export const STATE_KEY = "aiFlow.state.v1";
export const LAST_RUN_KEY = "aiFlow.lastRun.v1";

export type Mode = "full" | "docs";
export type ProjectKind = "new" | "extend";
export type ProviderId = "manual"; // extend later

export const DEFAULTS = {
  mode: "full" as Mode,
  projectKind: "new" as ProjectKind,
  pythonPath: ".\\.venv\\Scripts\\python",
  validateScript: "scripts\\validate_repo.py",
  guardScript: "scripts\\guard_worktree.py",
  strictClean: true,
};
