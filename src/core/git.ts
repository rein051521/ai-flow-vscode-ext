import { execWithTimeout } from "./exec";

export async function gitStatusPorcelain(repoRoot: string, timeoutMs: number): Promise<string> {
  const r = await execWithTimeout(["git", "status", "--porcelain"], repoRoot, timeoutMs);
  return r.stdout.trimEnd();
}

export async function gitDiffNameOnly(repoRoot: string, timeoutMs: number): Promise<string> {
  const r = await execWithTimeout(["git", "--no-pager", "diff", "--name-only"], repoRoot, timeoutMs);
  return r.stdout.trimEnd();
}

export async function gitDiffCachedNameOnly(repoRoot: string, timeoutMs: number): Promise<string> {
  const r = await execWithTimeout(["git", "--no-pager", "diff", "--name-only", "--cached"], repoRoot, timeoutMs);
  return r.stdout.trimEnd();
}

export async function gitUntracked(repoRoot: string, timeoutMs: number): Promise<string> {
  const r = await execWithTimeout(["git", "ls-files", "--others", "--exclude-standard"], repoRoot, timeoutMs);
  return r.stdout.trimEnd();
}

export async function gitTopLevel(repoRoot: string, timeoutMs: number): Promise<string> {
  const r = await execWithTimeout(["git", "rev-parse", "--show-toplevel"], repoRoot, timeoutMs);
  return r.stdout.trim();
}
