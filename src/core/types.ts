import type { Mode, ProjectKind, ProviderId } from "./constants";

export interface AcceptanceCheck {
  cmd: string;
  expect?: string; // human-readable expected outcome
}

export interface FlowState {
  projectKind: ProjectKind;
  mode: Mode;
  goal: string;
  constraints: string;
  targetFiles: string[]; // paths relative to repo root
  acceptance: AcceptanceCheck[];
  providerId: ProviderId;
  updatedAt: string; // ISO
}

export interface CmdResult {
  cmd: string;
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  startedAt: string; // ISO
  finishedAt: string; // ISO
}

export interface GateRun {
  mode: Mode;
  strictClean: boolean;
  results: CmdResult[];
  ok: boolean;
  failLine?: string;
}
