import { spawn } from "child_process";

export type ExecResult = { exitCode: number; stdout: string };

export async function execCapture(cmd: string, args: string[], cwd: string): Promise<ExecResult> {
  return await new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, windowsHide: true });
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString("utf8")));
    p.stderr.on("data", (d) => (out += d.toString("utf8")));
    p.on("error", (e) => reject(e));
    p.on("close", (code) => resolve({ exitCode: typeof code === "number" ? code : 1, stdout: out }));
  });
}
