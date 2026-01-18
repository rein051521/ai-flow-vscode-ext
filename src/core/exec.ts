import { spawn } from "node:child_process";

export type ExecResult = {
  argv: string[];
  cwd: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
};

async function killProcessTree(pid: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const p = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
    p.on("close", () => resolve());
    p.on("error", () => resolve());
  });
}

export async function execWithTimeout(
  argv: string[],
  cwd: string,
  timeoutMs: number,
  onStdout?: (chunk: string) => void,
  onStderr?: (chunk: string) => void
): Promise<ExecResult> {
  const start = Date.now();
  const [cmd, ...args] = argv;

  return await new Promise<ExecResult>((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
        GIT_PAGER: "cat"
      }
    });

    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let timedOut = false;

    const timer = setTimeout(async () => {
      timedOut = true;
      try {
        if (child.pid) await killProcessTree(child.pid);
      } finally {
        // closeを待つ
      }
    }, Math.max(1, timeoutMs));

    child.stdout?.on("data", (d: Buffer) => {
      out.push(d);
      onStdout?.(d.toString("utf-8"));
    });

    child.stderr?.on("data", (d: Buffer) => {
      err.push(d);
      onStderr?.(d.toString("utf-8"));
    });

    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        argv,
        cwd,
        exitCode: code,
        timedOut,
        durationMs: Date.now() - start,
        stdout: Buffer.concat(out).toString("utf-8"),
        stderr: Buffer.concat(err).toString("utf-8")
      });
    });
  });
}
